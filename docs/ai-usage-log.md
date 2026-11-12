# บันทึกการใช้ AI (Claude Code)

## รอบที่ 1 — Backend (Node.js + Express) และโครงสร้างฐานข้อมูล (2026-11-12)

### สิ่งที่สร้าง
- `.gitignore` กัน `node_modules/`, `.env` และ `.env.*`, `*.log`, `k8s/secret.yaml` และ `k8s/*secret*.yaml`
  รวมถึงไฟล์ที่ OS สร้างเอง แต่ยังเก็บไฟล์ `*.example` ไว้ (ตรวจด้วย `git check-ignore` แล้ว)
- `db/init.sql` สร้างตาราง `equipment` และ `loans` (มี CHECK ค่าสถานะ) พร้อมข้อมูลสมมติอุปกรณ์ 10 ชิ้น
  - unique index `one_active_loan_per_equipment` บังคับว่าอุปกรณ์ 1 ชิ้นมีคำขอ `approved` ได้แค่ 1 รายการ
- `backend/` (Express 4.22.3 + pg 8.13.1 ล็อกเวอร์ชันตายตัว)
  - `src/server.js` มี `/healthz`, `/readyz`, request log, error handler และปิดอย่างนุ่มนวลเมื่อได้ SIGTERM
  - `src/db.js` อ่าน `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` จาก env
  - `src/routes/equipment.js`: `GET /api/equipment`
  - `src/routes/loans.js`: `GET/POST /api/loans`, `GET /api/loans/:id`,
    `POST /api/loans/:id/approve|reject|return`
  - `.env.example` เป็นค่าสมมติ
- ทดสอบในเครื่องด้วย `postgres:16.4` ผ่าน `docker run` ทุก endpoint ได้ status code ตามที่ออกแบบ
  ทดสอบ DB ล่มแล้ว `/readyz` ได้ 503 ส่วน `/healthz` ยังได้ 200 และ BE ไม่ crash

### การตัดสินใจที่ AI เสนอและผู้ใช้ยืนยัน
- สถานะ "ว่าง/ถูกยืม" ของอุปกรณ์คำนวณจากตาราง loans ไม่เก็บซ้ำ
- การเปลี่ยนสถานะใช้ `UPDATE ... WHERE status = <สถานะเดิม>` ในคำสั่งเดียว
- ไม่เปิด CORS เพราะรอบ FE จะให้ nginx ส่งต่อ `/api` ไปที่ BE
- ระหว่างทดสอบ `npm audit` พบช่องโหว่ใน express 4.21.2 จึงอัปเป็น 4.22.3 (major เดิม) แล้วทดสอบซ้ำผ่าน

### สิ่งที่มนุษย์ต้องตรวจ
- [ ] ทุกคนในทีมอ่าน `backend/src/routes/loans.js` และอธิบาย workflow กับฟังก์ชัน `changeStatus` ได้
- [ ] ตรวจว่า schema และข้อความ error ภาษาไทยตรงกับที่ทีมต้องการ
- [ ] การสร้างคำขอยืมตอนอุปกรณ์ถูกยืมอยู่จะถูกปฏิเสธ (409) ใน BE แต่ไม่ได้บังคับที่ DB
  ถ้ามีคำขอ `requested` ค้างอยู่หลายรายการของอุปกรณ์เดียวกัน อนุมัติได้รายการเดียว ที่เหลือต้องกดปฏิเสธเอง
  ทีมต้องตัดสินใจว่ายอมรับพฤติกรรมนี้หรือไม่
- [ ] ตอน DB ล่ม endpoint `/api/*` ตอบ 500 (ส่วน `/readyz` ตอบ 503) ซึ่งเป็นพฤติกรรมที่ตั้งใจไว้
- [ ] รอบ k8s ต้องให้ livenessProbe ใช้ `/healthz` และ readinessProbe ใช้ `/readyz` เท่านั้น
- [ ] ยังไม่มี Dockerfile ของ BE (ทำในรอบ build/k8s)
- [ ] `backend/.env` ในเครื่องผู้ทดสอบมีรหัสผ่านทดสอบ ไฟล์นี้ถูกกันไว้ใน .gitignore แล้ว ห้าม commit
