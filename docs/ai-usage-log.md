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

## รอบที่ 2 — Frontend (HTML + JavaScript + nginx) (2026-11-12)

### สิ่งที่สร้าง
- `frontend/index.html` หน้าเดียว แบ่ง 3 ส่วน: ตารางอุปกรณ์พร้อมสถานะว่าง/ถูกยืม, ฟอร์มขอยืม (dropdown แสดงเฉพาะอุปกรณ์ที่ว่าง),
  ตารางคำขอพร้อมตัวกรองสถานะและปุ่ม อนุมัติ/ปฏิเสธ/คืน ตามสถานะ
- `frontend/app.js` JavaScript ธรรมดา เรียก BE ผ่าน `fetch('/api/...')` แบบ relative path เท่านั้น
  แสดงข้อมูลด้วย `textContent` (กัน XSS) และแสดงข้อความ error จาก BE (เช่น 409) ที่แถบด้านบน
- `frontend/style.css` สไตล์เรียบง่าย
- `frontend/nginx/default.conf.template` เสิร์ฟไฟล์ static, ส่งต่อ `/api/` ไปยัง `http://${BACKEND_HOST}:${BACKEND_PORT}`
  และมี `/nginx-health` ไว้ให้ probe
- `frontend/Dockerfile` ใช้ `nginx:1.27.3-alpine` ตั้งค่าเริ่มต้น `BACKEND_HOST=backend` และ `BACKEND_PORT=3000`
  (เปลี่ยนได้ด้วย env ตอนรัน ไม่ต้อง build ใหม่)

### การทดสอบ
- build `equiploan-frontend:0.1.0` แล้วรันโดยตั้ง `BACKEND_HOST=host.docker.internal` เพื่อชี้ไปที่ BE บนเครื่อง
  config ที่ nginx สร้างแทนค่าถูกต้อง และ `$uri` ไม่ถูกแตะ
- curl: `/` ได้ 200, `/app.js` ได้ 200, `/nginx-health` ได้ 200, `/api/equipment` ผ่าน nginx ได้ 200, path ที่ไม่มีได้ 404
- ใน browser: ขอยืม -> อนุมัติ (อุปกรณ์เปลี่ยนเป็น "ถูกยืม" และหายจาก dropdown) -> คืน, ปฏิเสธพร้อมเหตุผล,
  อนุมัติซ้ำแล้วเห็นข้อความ 409 จาก BE, ตัวกรองสถานะใช้ได้, ข้อมูลที่มี `<img onerror>` แสดงเป็นตัวอักษรธรรมดา
- หยุด BE แล้วหน้าเว็บแสดง "โหลดข้อมูลไม่สำเร็จ (HTTP 502)" แต่ nginx ยังเสิร์ฟหน้าเว็บได้
- พบบั๊กใน app.js: ข้อความ error ค้างอยู่แม้โหลดครั้งถัดไปสำเร็จ แก้แล้วและทดสอบซ้ำผ่าน

### สิ่งที่มนุษย์ต้องตรวจ
- [ ] ทุกคนอธิบายได้ว่า FE ไม่รู้ที่อยู่ของ BE เลย: browser เรียก `/api` -> nginx -> Service ของ BE
- [ ] ทดสอบปุ่มปฏิเสธใน browser ด้วยมือ (ตอนทดสอบอัตโนมัติ AI แทน `prompt()` ด้วยค่าคงที่ เพราะ dialog บล็อกการทำงานอัตโนมัติ)
- [ ] nginx resolve `BACKEND_HOST` ตอนสตาร์ท ถ้าไม่มี Service ชื่อนั้น container จะสตาร์ทไม่ขึ้น
  รอบ k8s ต้องสร้าง Service ของ BE ก่อน หรือยอมให้ pod ของ FE restart สักรอบ
- [ ] ตอนทดสอบในเครื่อง `host.docker.internal` มีทั้ง IPv4 และ IPv6 (ต่อไม่ได้) หลัง BE ล่มแล้วกลับมา
  จึงอาจได้ 502 ประมาณ 10 วินาที (ค่า `fail_timeout` ของ nginx) ใน k8s ที่ Service มี ClusterIP เดียวจะไม่เกิดปัญหานี้
- [ ] ยังไม่มีการกำหนด resource requests/limits และ probe ของ FE (ทำในรอบ k8s)

## รอบที่ 3 — Dockerfile และโหลด image เข้า minikube (2026-11-12)

### สิ่งที่สร้าง
- `backend/Dockerfile` ใช้ `node:22.12.0-alpine`, ติดตั้งด้วย `npm ci --omit=dev`, รันด้วย `USER node` (uid 1000)
  และสั่ง `CMD ["node", "src/server.js"]` (ไม่ผ่าน npm เพื่อให้ SIGTERM ถึงแอป)
  ใน image มีแค่ `NODE_ENV` และ `PORT` ค่า `DB_*` ต้องส่งตอนรัน
- `backend/.dockerignore` กัน `node_modules`, `.env` และ `.env.*`, `*.log`, `.git`
- `frontend/.dockerignore` ส่วน `frontend/Dockerfile` ใช้ของเดิมจากรอบ 2
- DB ไม่มี Dockerfile ใช้ `postgres:16.4` สำเร็จรูป

### การทดสอบ
- `equiploan-backend:0.1.0`:
  - `id` ได้ `uid=1000(node)`
  - env ไม่มี `DB_*`
  - ไม่มีไฟล์ `.env` ใน image
  - user node เขียน `/app/src` ไม่ได้
  - ใน `docker image history` ไม่มีคำว่า password
- รัน DB + BE + FE ใน docker network `equiploan-net` (DB ไม่เปิดพอร์ตออกนอก network):
  ขอยืมและอนุมัติผ่าน nginx ได้, หยุด DB แล้ว `/readyz` ได้ 503 ส่วน `/healthz` ได้ 200 และ BE ไม่ restart
- `docker stop` BE ปิดตัวใน 0.2 วินาที ด้วย exit code 0 (รับ SIGTERM ได้)
- `minikube image load` ทั้ง `equiploan-backend:0.1.0`, `equiploan-frontend:0.1.0` และ `postgres:16.4`
  แล้วยืนยันด้วย `minikube image ls` (minikube v1.39.0)

### สิ่งที่มนุษย์ต้องตรวจ
- [ ] FE (nginx) ยังรันเป็น root ตามค่าเริ่มต้นของ image  ถ้าต้องการ non-root ให้เปลี่ยนเป็น `nginxinc/nginx-unprivileged`
- [ ] BE ใน image ใช้ Node 22 แต่ตอนพัฒนาในเครื่องใช้ Node 24 (โค้ดใช้ได้ทั้งคู่ เพราะ engines กำหนด >=20.6)
- [ ] เวลาแก้โค้ดต้องเพิ่ม tag ทุกครั้ง (เช่น 0.1.1) แล้ว build และ `minikube image load` ใหม่ ห้ามใช้ latest
- [ ] รอบ k8s ต้องตั้ง `imagePullPolicy: IfNotPresent` (หรือ `Never`) เพื่อให้ใช้ image ที่โหลดเข้า minikube แล้ว
