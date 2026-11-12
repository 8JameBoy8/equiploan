// เส้นทาง /api/equipment : ดูรายการอุปกรณ์
const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/equipment
// available = true ถ้าไม่มีคำขอที่ approved (ยังไม่คืน) ของอุปกรณ์ชิ้นนั้น
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.id, e.name, e.category, e.description,
             NOT EXISTS (
               SELECT 1 FROM loans l
               WHERE l.equipment_id = e.id AND l.status = 'approved'
             ) AS available
      FROM equipment e
      ORDER BY e.id
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
