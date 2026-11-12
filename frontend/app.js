// Frontend ของระบบยืม-คืนอุปกรณ์ (JavaScript ธรรมดา ไม่ใช้เฟรมเวิร์ก)
// เรียก BE ผ่านพาธ /api/... เท่านั้น  nginx เป็นคนส่งต่อไปยัง Service ของ BE
// ข้อมูลจากผู้ใช้แสดงด้วย textContent เสมอ (กัน XSS)

// ---------- ตัวช่วยเรียก API ----------
// ถ้า BE ตอบ error จะโยน Error พร้อมข้อความจาก BE (เช่น 409 อุปกรณ์ถูกยืมอยู่)
async function api(method, path, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `เกิดข้อผิดพลาด (HTTP ${res.status})`);
  }
  return data;
}

// ---------- แถบข้อความ ----------
function showMessage(text, isError) {
  const box = document.getElementById('message');
  box.textContent = text;
  box.className = 'message ' + (isError ? 'error' : 'ok');
  box.hidden = false;
}

// สร้างช่อง <td> จากข้อความ
function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text == null ? '-' : String(text);
  if (className) td.className = className;
  return td;
}

function formatTime(iso) {
  return iso ? new Date(iso).toLocaleString('th-TH') : '-';
}

// ---------- อุปกรณ์ ----------
async function loadEquipment() {
  const items = await api('GET', '/api/equipment');

  // ตารางอุปกรณ์
  const tbody = document.getElementById('equipment-body');
  tbody.replaceChildren();
  for (const item of items) {
    const tr = document.createElement('tr');
    tr.append(
      cell(item.id),
      cell(item.name),
      cell(item.category),
      item.available
        ? cell('ว่าง', 'status-available')
        : cell('ถูกยืม', 'status-borrowed')
    );
    tbody.append(tr);
  }

  // dropdown ในฟอร์ม: แสดงเฉพาะอุปกรณ์ที่ว่าง
  const select = document.getElementById('equipment-select');
  select.replaceChildren();
  for (const item of items.filter((i) => i.available)) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = `${item.id}. ${item.name}`;
    select.append(opt);
  }
}

// ---------- คำขอยืม ----------
async function loadLoans() {
  const status = document.getElementById('status-filter').value;
  const path = status ? `/api/loans?status=${encodeURIComponent(status)}` : '/api/loans';
  const loans = await api('GET', path);

  const tbody = document.getElementById('loans-body');
  tbody.replaceChildren();
  for (const loan of loans) {
    const tr = document.createElement('tr');
    tr.append(
      cell(loan.id),
      cell(loan.equipment_name),
      cell(loan.borrower_contact
        ? `${loan.borrower_name} (${loan.borrower_contact})`
        : loan.borrower_name),
      cell(loan.purpose),
      cell(loan.reject_reason ? `${loan.status}: ${loan.reject_reason}` : loan.status,
        'status-' + loan.status),
      cell(formatTime(loan.requested_at)),
      actionCell(loan)
    );
    tbody.append(tr);
  }
}

// ปุ่มจัดการตามสถานะ: requested -> อนุมัติ/ปฏิเสธ,  approved -> คืน
function actionCell(loan) {
  const td = document.createElement('td');
  if (loan.status === 'requested') {
    td.append(
      button('อนุมัติ', () => changeStatus(loan.id, 'approve')),
      button('ปฏิเสธ', () => {
        const reason = prompt('เหตุผลที่ปฏิเสธ (เว้นว่างได้)');
        if (reason === null) return; // กดยกเลิก
        changeStatus(loan.id, 'reject', { reason: reason.trim() || undefined });
      })
    );
  } else if (loan.status === 'approved') {
    td.append(button('คืน', () => changeStatus(loan.id, 'return')));
  }
  return td;
}

function button(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// action = approve | reject | return
async function changeStatus(id, action, body) {
  try {
    const loan = await api('POST', `/api/loans/${id}/${action}`, body || {});
    showMessage(`คำขอ #${loan.id} เปลี่ยนเป็น ${loan.status} แล้ว`, false);
  } catch (err) {
    showMessage(err.message, true);
  }
  await refresh();
}

// ---------- ฟอร์มขอยืม ----------
document.getElementById('loan-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  try {
    const loan = await api('POST', '/api/loans', {
      equipment_id: Number(document.getElementById('equipment-select').value),
      borrower_name: document.getElementById('borrower-name').value,
      borrower_contact: document.getElementById('borrower-contact').value || undefined,
      purpose: document.getElementById('purpose').value || undefined,
    });
    showMessage(`ส่งคำขอ #${loan.id} (${loan.equipment_name}) แล้ว รออนุมัติ`, false);
    form.reset();
  } catch (err) {
    showMessage(err.message, true);
  }
  await refresh();
});

document.getElementById('status-filter').addEventListener('change', () => refresh());

// โหลดข้อมูลทั้งหมดใหม่
// ถ้าเคยโหลดไม่สำเร็จ แล้วรอบนี้สำเร็จ ให้ซ่อนข้อความ error เดิม
let loadFailed = false;
async function refresh() {
  try {
    await Promise.all([loadEquipment(), loadLoans()]);
    if (loadFailed) {
      document.getElementById('message').hidden = true;
      loadFailed = false;
    }
  } catch (err) {
    showMessage('โหลดข้อมูลไม่สำเร็จ: ' + err.message, true);
    loadFailed = true;
  }
}

refresh();
