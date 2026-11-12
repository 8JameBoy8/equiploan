# equiploan — ระบบยืม-คืนอุปกรณ์ของชมรม บน Kubernetes

โครงงานวิชา DGT01 3130 : ระบบ Three Tier (Frontend / Backend / Database) ที่ deploy และทดสอบซ้ำได้บน minikube

- ขั้นตอนการใช้งาน: **ขอยืม** (`requested`) → **อนุมัติ / ปฏิเสธ** (`approved` / `rejected`) → **คืน** (`returned`)
- อุปกรณ์ที่ถูกอนุมัติแล้ว (ยังไม่คืน) จะถูกยืมซ้ำไม่ได้ และคืนได้เฉพาะคำขอที่อนุมัติแล้ว
- ใช้ข้อมูลสมมติ (อุปกรณ์ 10 ชิ้น) ไม่มีระบบล็อกอิน

## สถาปัตยกรรม

```
 Browser
    │  http://127.0.0.1:<port>   (minikube service)
    ▼
┌──────────────────────┐  Service: equiploan-frontend (NodePort 30080)
│ FE  nginx + HTML/JS  │  เสิร์ฟหน้าเว็บ และส่งต่อ /api/... ไปที่ BE
└──────────┬───────────┘
           │ /api/...
           ▼
┌──────────────────────┐  Service: equiploan-backend (ClusterIP :3000) ภายใน cluster
│ BE  Node.js+Express  │  /healthz  /readyz  /api/equipment  /api/loans
└──────────┬───────────┘  ค่า DB จาก ConfigMap + Secret
           │ SQL
           ▼
┌──────────────────────┐  Service: equiploan-db (ClusterIP :5432) ภายใน cluster
│ DB  PostgreSQL 16.4  │  ข้อมูลอยู่บน PVC 1Gi (equiploan-db-data)
└──────────────────────┘
```

- FE ติดต่อ DB ผ่าน BE เท่านั้น และ browser ไม่รู้ที่อยู่ของ BE (เรียกแค่ `/api/...`)
- DB และ BE ไม่เปิดออกนอก cluster (เป็น ClusterIP) มีแค่ FE ที่เปิดให้ browser เข้า
- ทุก resource อยู่ใน namespace `equiploan`

## โครงสร้างโฟลเดอร์

```
backend/            Node.js + Express (Dockerfile, src/, .env.example)
frontend/           index.html, app.js, style.css, nginx/default.conf.template, Dockerfile
db/init.sql         สร้างตาราง equipment, loans และข้อมูลสมมติ
k8s/                manifests (เลขหน้าชื่อไฟล์ = ลำดับการ apply)
  00-namespace.yaml
  10-configmap.yaml
  20-db.yaml          PVC + Deployment + Service ของ DB
  30-backend.yaml     Deployment + Service ของ BE
  40-frontend.yaml    Deployment + Service ของ FE
  secret.example.yaml ตัวอย่าง Secret (ค่าสมมติ ห้ามใช้จริง)
docs/test-plan.md   ขั้นตอนทดสอบพร้อมผลลัพธ์
docs/ai-usage-log.md บันทึกการใช้ AI
```

---

## 1. Prerequisites

| เครื่องมือ | ใช้ทำอะไร | เวอร์ชันที่ทีมทดสอบแล้ว |
|---|---|---|
| Docker Desktop (Windows) | build image | Docker 29.9.3 |
| minikube | Kubernetes ในเครื่อง (driver: docker) | v1.39.0 (Kubernetes v1.37.0) |
| kubectl | สั่งงาน Kubernetes | v1.36.1 |
| Git | clone โปรเจกต์ | - |
| Node.js 20.6 ขึ้นไป | **ไม่บังคับ** ใช้เฉพาะถ้าจะรัน BE นอก k8s (หัวข้อ 7) | v24 |

ทุกคำสั่งในเอกสารนี้รันใน **PowerShell** ที่โฟลเดอร์หลักของโปรเจกต์ (`equiploan/`)

ตรวจว่าติดตั้งครบและ minikube เปิดอยู่:

```powershell
docker version
minikube version
kubectl version --client
minikube start            # ถ้า minikube ยังไม่ได้เปิด
minikube status           # host / kubelet / apiserver ต้องเป็น Running
kubectl config current-context   # ต้องได้ minikube
```

---

## 2. Build image และโหลดเข้า minikube

```powershell
docker build -t equiploan-backend:0.1.0 backend
docker build -t equiploan-frontend:0.1.0 frontend
docker pull postgres:16.4

minikube image load equiploan-backend:0.1.0
minikube image load equiploan-frontend:0.1.0
minikube image load postgres:16.4

minikube image ls | Select-String "equiploan|postgres"   # ต้องเห็นครบ 3 ตัว
```

- ห้ามใช้ tag `latest`  ถ้าแก้โค้ด ให้เปลี่ยน tag (เช่น `0.1.1`) build ใหม่ load ใหม่
  และแก้ `image:` ใน `k8s/30-backend.yaml` หรือ `k8s/40-frontend.yaml` ให้ตรง
- image ไม่มีรหัสผ่านอยู่ข้างใน ค่าทั้งหมดส่งเข้ามาตอนรันผ่าน ConfigMap / Secret
- BE รันด้วย user `node` (uid 1000) ไม่ใช่ root

---

## 3. Deploy

> **ห้ามใช้ `kubectl apply -f k8s/` ทั้งโฟลเดอร์** เพราะจะ apply `secret.example.yaml` (ค่าสมมติ) ทับ Secret จริง
> ให้ apply ทีละไฟล์ตามขั้นตอนด้านล่าง

### 3.1 สร้าง Namespace

```powershell
kubectl apply -f k8s/00-namespace.yaml
```

### 3.2 สร้าง Secret ของ DB (ไม่เก็บค่าลับใน repository)

คำสั่งนี้ถามรหัสผ่านโดยไม่แสดงบนจอ แล้วสร้าง Secret ใน cluster โดยตรง ไม่มีไฟล์รหัสผ่านเกิดขึ้น

```powershell
$p = Read-Host "ตั้งรหัสผ่าน DB" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p))
kubectl create secret generic equiploan-db-secret -n equiploan --from-literal=DB_USER=equiploan --from-literal=DB_PASSWORD=$plain
Remove-Variable p, plain
```

ตรวจ (แสดงแค่ชื่อ key ไม่แสดงค่า):

```powershell
kubectl describe secret equiploan-db-secret -n equiploan
```

> รูปแบบของ Secret ดูได้ที่ `k8s/secret.example.yaml`  ถ้าจำเป็นต้องใช้ไฟล์ ให้ copy เป็น `k8s/secret.yaml`
> (ถูกกันไว้ใน `.gitignore`) แล้วแก้ค่าก่อน `kubectl apply -f k8s/secret.yaml`  ห้าม commit ไฟล์นี้

### 3.3 สร้าง ConfigMap ของสคริปต์ฐานข้อมูล

```powershell
kubectl create configmap equiploan-db-init -n equiploan --from-file=db/init.sql
```

### 3.4 Apply ConfigMap, DB, BE และ FE

```powershell
kubectl apply -f k8s/10-configmap.yaml -f k8s/20-db.yaml -f k8s/30-backend.yaml -f k8s/40-frontend.yaml
kubectl wait --for=condition=Ready pod --all -n equiploan --timeout=180s
kubectl get pods,svc,pvc -n equiploan
```

ผลที่ถูกต้อง:
- Pod ทั้ง 3 ตัว (`equiploan-db-…`, `equiploan-backend-…`, `equiploan-frontend-…`) เป็น `Running` และ `READY 1/1`
- `equiploan-db` และ `equiploan-backend` เป็น `ClusterIP`, `equiploan-frontend` เป็น `NodePort 80:30080`
- PVC `equiploan-db-data` เป็น `Bound` ขนาด `1Gi`

### 3.5 เปิดหน้าเว็บ

```powershell
minikube service equiploan-frontend -n equiploan --url
```

คำสั่งจะแสดง URL เช่น `http://127.0.0.1:52297` ให้เปิด URL นั้นใน browser
**ต้องเปิดหน้าต่าง PowerShell นี้ค้างไว้** (บน Windows ที่ใช้ docker driver คำสั่งนี้เป็น tunnel) และพอร์ตจะเปลี่ยนทุกครั้งที่รัน

---

## 4. Test

ขั้นตอนทดสอบละเอียดพร้อมตาราง Input / Expected / Actual อยู่ใน **[docs/test-plan.md](docs/test-plan.md)** ครอบคลุม:

1. Workflow ขอยืม → อนุมัติ/ปฏิเสธ → คืน
2. กฎห้ามยืมซ้ำ และคืนได้เฉพาะที่อนุมัติแล้ว
3. ค่า configuration ผ่าน ConfigMap / Secret
4. `/healthz` และ `/readyz`
5. DB ขัดข้อง: `/readyz` ไม่ผ่าน แต่ BE ไม่ restart วน
6. Persistence: ลบ DB Pod แล้วข้อมูลยังอยู่

ทดสอบเร็วๆ (เปิดหน้าต่าง PowerShell ใหม่ ขณะที่ `minikube service` ยังเปิดอยู่):

```powershell
$URL = "http://127.0.0.1:52297"     # เปลี่ยนเป็น URL ที่ได้จากข้อ 3.5
curl.exe -s "$URL/api/equipment"
kubectl exec -n equiploan deploy/equiploan-frontend -- wget -qO- http://equiploan-backend:3000/readyz
```

---

## 5. Cleanup (ลบเฉพาะของโปรเจกต์นี้)

```powershell
# 1) ปิดหน้าต่าง minikube service (กด Ctrl+C)

# 2) ลบทุก resource ของโปรเจกต์ รวมถึง PVC และข้อมูลใน DB
kubectl delete namespace equiploan

# 3) (ไม่บังคับ) ลบ image ออกจาก minikube และจาก Docker ในเครื่อง
minikube image rm equiploan-backend:0.1.0 equiploan-frontend:0.1.0 postgres:16.4
docker rmi equiploan-backend:0.1.0 equiploan-frontend:0.1.0
```

> ไม่ต้องใช้ `minikube delete` เพราะจะลบ cluster ทั้งหมด รวมถึงงานอื่นที่ไม่ใช่ของโปรเจกต์นี้
> ถ้าต้องการปิด minikube ชั่วคราวใช้ `minikube stop`

---

## 6. ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| Pod เป็น `ErrImagePull` / `ImagePullBackOff` | ยังไม่ได้ `minikube image load` หรือ tag ไม่ตรงกับใน manifest → ทำข้อ 2 ใหม่ |
| Pod เป็น `CreateContainerConfigError` | ยังไม่ได้สร้าง Secret `equiploan-db-secret` (ข้อ 3.2) ดูสาเหตุด้วย `kubectl describe pod -n equiploan <ชื่อ pod>` |
| DB Pod ค้าง `ContainerCreating` | ยังไม่ได้สร้าง ConfigMap `equiploan-db-init` (ข้อ 3.3) |
| หน้าเว็บขึ้น "โหลดข้อมูลไม่สำเร็จ (HTTP 502)" | BE ยังไม่ Ready (มักเพราะ DB ยังไม่พร้อม) ดู `kubectl get pods -n equiploan` และ `kubectl logs -n equiploan deploy/equiploan-backend` |
| BE `READY 0/1` และ log มี `[readyz] database not reachable` | DB ล่มหรือรหัสผ่านไม่ตรง → ดู `kubectl logs -n equiploan deploy/equiploan-db` |
| เปลี่ยนรหัสผ่านใน Secret แล้ว BE ต่อ DB ไม่ได้ | postgres ใช้รหัสผ่านจาก Secret **เฉพาะตอนสร้าง DB ครั้งแรก** บน PVC ว่าง → ใช้รหัสเดิม หรือลบ namespace แล้ว deploy ใหม่ (ข้อมูลหาย) |
| แก้ `db/init.sql` แล้วไม่มีผล | init.sql รันเฉพาะตอน PVC ว่าง → ลบ namespace แล้ว deploy ใหม่ |

ดู log ของแต่ละส่วน (ทุกส่วนเขียน log ออก stdout/stderr):

```powershell
kubectl logs -n equiploan deploy/equiploan-backend --tail 30
kubectl logs -n equiploan deploy/equiploan-frontend --tail 30
kubectl logs -n equiploan deploy/equiploan-db --tail 30
```

---

## 7. (ไม่บังคับ) รัน BE ในเครื่องโดยไม่ใช้ Kubernetes

ใช้ตอนพัฒนาโค้ด BE  รหัสผ่านด้านล่างเป็นค่าสมมติสำหรับเครื่องตัวเองเท่านั้น

```powershell
# DB ชั่วคราว
docker run -d --name equiploan-db -e POSTGRES_DB=equiploan -e POSTGRES_USER=equiploan `
  -e POSTGRES_PASSWORD=localdev-only -p 5432:5432 `
  -v "${PWD}/db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" postgres:16.4

# BE
cd backend
npm install
Copy-Item .env.example .env      # แล้วแก้ DB_PASSWORD=localdev-only  (.env ถูกกันใน .gitignore)
npm run dev                      # http://localhost:3000/healthz

# เลิกใช้
docker rm -f equiploan-db
```

## API (Backend)

| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/healthz` | แอปยังทำงาน (ไม่แตะ DB) ใช้กับ livenessProbe |
| GET | `/readyz` | เชื่อมต่อ DB ได้ (ไม่ได้ = 503) ใช้กับ readinessProbe |
| GET | `/api/equipment` | รายการอุปกรณ์ พร้อม `available` |
| POST | `/api/loans` | สร้างคำขอ `{equipment_id, borrower_name, borrower_contact?, purpose?}` |
| GET | `/api/loans?status=` | รายการคำขอ (กรองสถานะได้) |
| GET | `/api/loans/:id` | รายละเอียดคำขอ |
| POST | `/api/loans/:id/approve` | requested → approved |
| POST | `/api/loans/:id/reject` | requested → rejected `{reason?}` |
| POST | `/api/loans/:id/return` | approved → returned |
