// เส้นทาง /api/loans : คำขอยืม และการเปลี่ยนสถานะ
// Workflow: requested -> approved / rejected,  approved -> returned
const express = require('express');
const pool = require('../db');

const router = express.Router();

const STATUSES = ['requested', 'approved', 'rejected', 'returned'];

// SELECT ที่ใช้ซ้ำ: ข้อมูลคำขอ + ชื่ออุปกรณ์
const LOAN_SELECT = `
  SELECT l.*, e.name AS equipment_name
  FROM loans l
  JOIN equipment e ON e.id = l.equipment_id
`;

// แปลงค่าเป็นเลข id ที่ถูกต้อง (จำนวนเต็มบวก) ถ้าไม่ถูกคืน null
function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/loans?status=requested  -> รายการคำขอ (กรองตามสถานะได้)
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    if (status && !STATUSES.includes(status)) {
      return res.status(400).json({ error: `status ต้องเป็นหนึ่งใน ${STATUSES.join(', ')}` });
    }
    const { rows } = status
      ? await pool.query(`${LOAN_SELECT} WHERE l.status = $1 ORDER BY l.id DESC`, [status])
      : await pool.query(`${LOAN_SELECT} ORDER BY l.id DESC`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/loans/:id  -> รายละเอียดคำขอ
router.get('/:id', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'id ไม่ถูกต้อง' });

    const { rows } = await pool.query(`${LOAN_SELECT} WHERE l.id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'ไม่พบคำขอนี้' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/loans  -> สร้างคำขอยืม
// body: { equipment_id, borrower_name, borrower_contact?, purpose? }
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const equipmentId = toId(body.equipment_id);
    const name = typeof body.borrower_name === 'string' ? body.borrower_name.trim() : '';

    if (!equipmentId) return res.status(400).json({ error: 'ต้องระบุ equipment_id' });
    if (!name || name.length > 100) {
      return res.status(400).json({ error: 'ต้องระบุ borrower_name (ไม่เกิน 100 ตัวอักษร)' });
    }

    // ตรวจว่ามีอุปกรณ์นี้จริง และยังไม่ถูกยืมอยู่
    const eq = await pool.query(
      `SELECT e.id,
              EXISTS (SELECT 1 FROM loans l
                      WHERE l.equipment_id = e.id AND l.status = 'approved') AS borrowed
       FROM equipment e WHERE e.id = $1`,
      [equipmentId]
    );
    if (eq.rows.length === 0) return res.status(404).json({ error: 'ไม่พบอุปกรณ์นี้' });
    if (eq.rows[0].borrowed) {
      return res.status(409).json({ error: 'อุปกรณ์นี้ถูกยืมอยู่ ยังขอยืมไม่ได้' });
    }

    const { rows } = await pool.query(
      `INSERT INTO loans (equipment_id, borrower_name, borrower_contact, purpose)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [equipmentId, name, body.borrower_contact || null, body.purpose || null]
    );
    const created = await pool.query(`${LOAN_SELECT} WHERE l.id = $1`, [rows[0].id]);
    console.log(`[loans] created loan #${rows[0].id} for equipment #${equipmentId}`);
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ฟังก์ชันกลางสำหรับเปลี่ยนสถานะ
// UPDATE ... WHERE status = fromStatus  ทำในคำสั่งเดียว จึงปลอดภัยเมื่อมีคนกดพร้อมกัน
async function changeStatus(req, res, next, fromStatus, setSql, params = []) {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'id ไม่ถูกต้อง' });

    const result = await pool.query(
      `UPDATE loans SET ${setSql}
       WHERE id = $1 AND status = $2
       RETURNING id`,
      [id, fromStatus, ...params]
    );

    if (result.rowCount === 0) {
      // ไม่มีแถวถูกแก้: อาจไม่มีคำขอนี้ หรือสถานะไม่ตรง
      const cur = await pool.query('SELECT status FROM loans WHERE id = $1', [id]);
      if (cur.rows.length === 0) return res.status(404).json({ error: 'ไม่พบคำขอนี้' });
      return res.status(409).json({
        error: `ทำรายการไม่ได้: สถานะปัจจุบันคือ ${cur.rows[0].status} (ต้องเป็น ${fromStatus})`,
      });
    }

    const { rows } = await pool.query(`${LOAN_SELECT} WHERE l.id = $1`, [id]);
    console.log(`[loans] loan #${id}: ${fromStatus} -> ${rows[0].status}`);
    res.json(rows[0]);
  } catch (err) {
    // 23505 = unique violation จาก index one_active_loan_per_equipment
    if (err.code === '23505') {
      return res.status(409).json({ error: 'อุปกรณ์นี้ถูกยืมอยู่แล้ว อนุมัติซ้ำไม่ได้' });
    }
    next(err);
  }
}

// POST /api/loans/:id/approve  (requested -> approved)
router.post('/:id/approve', (req, res, next) =>
  changeStatus(req, res, next, 'requested', `status = 'approved', decided_at = now()`)
);

// POST /api/loans/:id/reject  body: { reason? }  (requested -> rejected)
router.post('/:id/reject', (req, res, next) => {
  const reason = (req.body && req.body.reason) || null;
  changeStatus(req, res, next, 'requested',
    `status = 'rejected', decided_at = now(), reject_reason = $3`, [reason]);
});

// POST /api/loans/:id/return  (approved -> returned) คืนได้เฉพาะที่อนุมัติแล้ว
router.post('/:id/return', (req, res, next) =>
  changeStatus(req, res, next, 'approved', `status = 'returned', returned_at = now()`)
);

module.exports = router;
