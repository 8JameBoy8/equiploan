# แผนการทดสอบและผลการทดสอบ (equiploan)

ทดสอบระบบที่ deploy บน minikube ตามขั้นตอนใน [README.md](../README.md) โดยทำซ้ำได้ด้วยคำสั่งในเอกสารนี้

| รายการ | ค่า |
|---|---|
| วันที่ทดสอบ (คอลัมน์ Actual) | 2026-11-12 |
| สภาพแวดล้อม | Windows 10, Docker 29.9.3, minikube v1.39.0 (driver docker, Kubernetes v1.37.0), kubectl v1.36.1 |
| Image | `equiploan-backend:0.1.0`, `equiploan-frontend:0.1.0`, `postgres:16.4` |
| สถานะเริ่มต้น | deploy ใหม่ใน namespace ว่าง (PVC ว่าง มีอุปกรณ์สมมติ 10 ชิ้น ยังไม่มีคำขอ) |

> ผลใน Actual อ้างอิงลำดับการรันในเอกสารนี้ ถ้ารันซ้ำบนข้อมูลที่ไม่ว่าง Record ID และหมายเลขอุปกรณ์อาจต่างไป
> ให้ใช้ ID ที่ได้จริงแทน

## 0. เตรียมตัว

1. Deploy ตาม README ข้อ 1–3 ให้ Pod ทั้ง 3 เป็น `Running 1/1`
2. เปิดหน้าต่าง PowerShell ที่ 1 รัน `minikube service equiploan-frontend -n equiploan --url` แล้วเปิดค้างไว้
3. เปิดหน้าต่าง PowerShell ที่ 2 ตั้งตัวแปร (เปลี่ยนพอร์ตตาม URL ที่ได้):

```powershell
$URL = "http://127.0.0.1:53483"
$NS  = "equiploan"
```

**หมายเหตุสำหรับ PowerShell 5.1**
- ใช้ `curl.exe` (มีใน Windows 10 แล้ว) ไม่ใช่ `curl` ซึ่งเป็น alias ของ `Invoke-WebRequest`
- JSON ใน `-d` ต้องเขียนแบบ `'{\"key\":\"value\"}'` และค่าไม่ควรมีช่องว่าง
- `-w "`n%{http_code}"` พิมพ์ HTTP status code ต่อท้าย response

---

## 1. Workflow ขอยืม → อนุมัติ/ปฏิเสธ → คืน

| ID | Input | Expected | Actual | ผล |
|---|---|---|---|---|
| T01 | `curl.exe -s "$URL/api/equipment"` | ได้อุปกรณ์ 10 รายการ ทุกชิ้น `available: true` | 10 รายการ, available 10 ชิ้น | ✅ |
| T02 | `curl.exe -s -w "`n%{http_code}" -X POST "$URL/api/loans" -H "Content-Type: application/json" -d '{\"equipment_id\":1,\"borrower_name\":\"TesterA\",\"purpose\":\"workflow\"}'` | `201` และ `status: "requested"` | `201` `{"id":1,...,"status":"requested"}` | ✅ |
| T03 | `curl.exe -s -w "`n%{http_code}" -X POST "$URL/api/loans/1/approve"` แล้วดู `/api/equipment` | `200` `status: "approved"` และอุปกรณ์ #1 `available: false` | `200` `"status":"approved"`, อุปกรณ์ #1 `available=False` | ✅ |
| T04 | `curl.exe -s -w "`n%{http_code}" -X POST "$URL/api/loans/1/return"` แล้วดู `/api/equipment` | `200` `status: "returned"` และอุปกรณ์ #1 `available: true` | `200` `"status":"returned"`, อุปกรณ์ #1 `available=True` | ✅ |
| T05 | สร้างคำขอ `equipment_id:3` แล้ว `curl.exe -s -w "`n%{http_code}" -X POST "$URL/api/loans/2/reject" -H "Content-Type: application/json" -d '{\"reason\":\"busy\"}'` | `200` `status: "rejected"` และ `reject_reason: "busy"` | `201` (id 2) แล้ว `200` `"status":"rejected","reject_reason":"busy"` | ✅ |

## 2. กฎห้ามยืมซ้ำ และคืนได้เฉพาะที่อนุมัติแล้ว

| ID | Input | Expected | Actual | ผล |
|---|---|---|---|---|
| T06 | สร้างคำขอ `equipment_id:2` (id 3) → `POST /api/loans/3/approve` → สร้างคำขอ `equipment_id:2` อีกครั้ง | ครั้งที่ 2 ได้ `409` "อุปกรณ์นี้ถูกยืมอยู่ ยังขอยืมไม่ได้" | `201` → `200` → `409` `{"error":"อุปกรณ์นี้ถูกยืมอยู่ ยังขอยืมไม่ได้"}` | ✅ |
| T07 | สร้างคำขอ `equipment_id:4` สองรายการ (id 4, 5) ขณะยังว่าง → approve 4 → approve 5 | approve 4 ได้ `200`, approve 5 ได้ `409` (DB unique index กันไว้) | `201`, `201` → `200` → `409` `{"error":"อุปกรณ์นี้ถูกยืมอยู่แล้ว อนุมัติซ้ำไม่ได้"}` | ✅ |
| T08 | `curl.exe -s -w "`n%{http_code}" -X POST "$URL/api/loans/5/return"` (id 5 ยังเป็น requested) | `409` คืนได้เฉพาะที่ approved | `409` "สถานะปัจจุบันคือ requested (ต้องเป็น approved)" | ✅ |
| T09 | `curl.exe -s -w "`n%{http_code}" -X POST "$URL/api/loans/1/return"` (คืนซ้ำ) | `409` | `409` "สถานะปัจจุบันคือ returned (ต้องเป็น approved)" | ✅ |
| T10 | ไม่ส่ง `borrower_name` / `equipment_id:99` / `GET /api/loans/999` | `400` / `404` / `404` | `400` "ต้องระบุ borrower_name…" / `404` "ไม่พบอุปกรณ์นี้" / `404` "ไม่พบคำขอนี้" | ✅ |

## 3. ค่า configuration ผ่าน ConfigMap / Secret

| ID | Input | Expected | Actual | ผล |
|---|---|---|---|---|
| T11 | `kubectl get configmap equiploan-config -n $NS -o jsonpath="{.data}"` | มี `DB_HOST`, `DB_PORT`, `DB_NAME`, `BACKEND_HOST`, `BACKEND_PORT` และไม่มีรหัสผ่าน | `{"BACKEND_HOST":"equiploan-backend","BACKEND_PORT":"3000","DB_HOST":"equiploan-db","DB_NAME":"equiploan","DB_PORT":"5432"}` | ✅ |
| T12 | `kubectl exec -n $NS deploy/equiploan-backend -- printenv DB_HOST DB_PORT DB_NAME` | ค่าใน Pod ตรงกับ ConfigMap | `equiploan-db 5432 equiploan` | ✅ |
| T13 | `kubectl describe secret equiploan-db-secret -n $NS` และ `kubectl exec -n $NS deploy/equiploan-backend -- sh -c 'test -n "$DB_PASSWORD" && echo DB_PASSWORD=set'` และ `kubectl get deploy equiploan-backend -n $NS -o jsonpath="{.spec.template.spec.containers[0].env[?(@.name=='DB_PASSWORD')].valueFrom}"` | Secret มี key `DB_USER`, `DB_PASSWORD` (ไม่แสดงค่า), Pod มีค่า `DB_PASSWORD`, manifest อ้างผ่าน `secretKeyRef` (ไม่มีค่าใน manifest) | `DB_PASSWORD: 24 bytes ; DB_USER: 9 bytes`, `DB_PASSWORD=set`, `{"secretKeyRef":{"key":"DB_PASSWORD","name":"equiploan-db-secret"}}` | ✅ |
| T14 | ยืนยันว่า BE อ่านค่าจาก ConfigMap จริง: `kubectl patch configmap equiploan-config -n $NS --type merge -p '{\"data\":{\"DB_HOST\":\"wrong-db\"}}'` → `kubectl rollout restart deploy/equiploan-backend -n $NS` → รอ 25 วินาที → `kubectl get pods -n $NS -l app=equiploan-backend` และ `kubectl logs` ของ Pod ใหม่ | Pod ใหม่มี `DB_HOST=wrong-db`, `READY 0/1`, log มี `[readyz] database not reachable`  Pod เก่ายังให้บริการต่อ (rolling update ไม่ปลด Pod เก่าจนกว่า Pod ใหม่จะ Ready) | Pod ใหม่ `0/1`, `printenv DB_HOST` ได้ `wrong-db`, log `[readyz] database not reachable: Connection terminated due to connection timeout` / `GET /readyz 503`  Pod เก่า `1/1` หน้าเว็บ `/api/equipment` ยังได้ `200` | ✅ |
| T14b | แก้กลับ: `kubectl patch configmap equiploan-config -n $NS --type merge -p '{\"data\":{\"DB_HOST\":\"equiploan-db\"}}'` → `kubectl rollout restart deploy/equiploan-backend -n $NS` → `kubectl rollout status deploy/equiploan-backend -n $NS` | rollout สำเร็จ Pod ใหม่ `1/1` | `successfully rolled out`, Pod ใหม่ `1/1 Running` | ✅ |
| T15 | `kubectl get svc -n $NS` | `equiploan-db` และ `equiploan-backend` เป็น `ClusterIP` (ไม่เปิดนอก cluster), `equiploan-frontend` เป็น `NodePort 30080` | db `ClusterIP 5432`, backend `ClusterIP 3000`, frontend `NodePort 80:30080` | ✅ |

> ConfigMap ที่แก้แล้วจะไม่มีผลกับ Pod ที่รันอยู่ ต้อง `rollout restart` เพราะ env อ่านค่าตอน Pod เริ่มเท่านั้น

## 4. `/healthz` และ `/readyz` (ภาวะปกติ)

เรียกจากใน Pod ของ BE เอง (`localhost`) เพราะ BE เป็น ClusterIP และถ้า Pod ไม่ Ready Service จะไม่ส่ง traffic ไปให้

| ID | Input | Expected | Actual | ผล |
|---|---|---|---|---|
| T16 | `kubectl exec -n $NS deploy/equiploan-backend -- wget -qO- http://localhost:3000/healthz` | `{"status":"ok"}` | `{"status":"ok"}` | ✅ |
| T17 | `kubectl exec -n $NS deploy/equiploan-backend -- wget -qO- http://localhost:3000/readyz` | `{"status":"ready"}` | `{"status":"ready"}` | ✅ |
| T17b | ผ่าน Service ภายใน cluster: `kubectl exec -n $NS deploy/equiploan-frontend -- wget -qO- http://equiploan-backend:3000/readyz` | `{"status":"ready"}` | `{"status":"ready"}` | ✅ |

## 5. DB ขัดข้อง: `/readyz` ไม่ผ่าน และ BE ไม่ restart วน

ขั้นตอน:

```powershell
# จด RESTARTS ของ BE ก่อนทดสอบ
kubectl get pods -n $NS -l app=equiploan-backend
# ทำให้ DB ล่ม (Deployment ยังอยู่ PVC ยังอยู่)
kubectl scale deploy/equiploan-db -n $NS --replicas=0
# รอ 45 วินาที (นานกว่า liveness 3 รอบ = 30 วินาที) แล้วตรวจ
kubectl get pods -n $NS
kubectl exec -n $NS deploy/equiploan-backend -- sh -c "wget -S -qO- http://localhost:3000/readyz 2>&1 | head -1"
kubectl exec -n $NS deploy/equiploan-backend -- wget -qO- http://localhost:3000/healthz
kubectl logs -n $NS deploy/equiploan-backend --tail 10
kubectl describe pod -n $NS -l app=equiploan-backend | Select-String "Unhealthy"
# คืนสภาพ
kubectl scale deploy/equiploan-db -n $NS --replicas=1
kubectl wait --for=condition=Ready pod -l app=equiploan-backend -n $NS --timeout=60s
```

| ID | Input | Expected | Actual | ผล |
|---|---|---|---|---|
| T18 | `kubectl get pods` ก่อนทดสอบ | BE `1/1`, RESTARTS = 0 | `ready=true restarts=0` | ✅ |
| T19 | scale DB = 0 แล้วรอ 45 วินาที → `kubectl get pods` | BE `READY 0/1`, STATUS `Running`, **RESTARTS ไม่เพิ่ม** | `ready=false restarts=0` | ✅ |
| T20 | `/readyz` ใน Pod ของ BE | `HTTP/1.1 503 Service Unavailable` | `HTTP/1.1 503 Service Unavailable` | ✅ |
| T21 | `/healthz` ใน Pod ของ BE | `{"status":"ok"}` (liveness ผ่าน จึงไม่ถูก restart) | `{"status":"ok"}` | ✅ |
| T22 | `kubectl logs -n $NS deploy/equiploan-backend --tail 10` | มีบรรทัด `[readyz] database not reachable` และ `GET /readyz 503` | `[readyz] database not reachable: connect ECONNREFUSED 10.110.80.110:5432` / `GET /readyz 503 2ms` | ✅ |
| T23 | `kubectl describe pod ... \| Select-String "Unhealthy"` | event `Readiness probe failed ... statuscode: 503` และไม่มี event Liveness probe failed | `Readiness probe failed: HTTP probe failed with statuscode: 503` (x25 over 2m10s) ไม่มี liveness failed | ✅ |
| T24 | scale DB = 1 แล้วรอ | BE กลับมา `1/1` เอง RESTARTS ยังเป็น 0 | `ready=true restarts=0` | ✅ |

> ระหว่าง BE ไม่ Ready, Service `equiploan-backend` จะไม่มี endpoint ที่พร้อม การเรียก `http://equiploan-backend:3000`
> จะได้ connection refused และหน้าเว็บจะขึ้น "โหลดข้อมูลไม่สำเร็จ (HTTP 502)" ซึ่งเป็นพฤติกรรมที่ถูกต้องของ readiness probe

## 6. Persistence: ลบ DB Pod โดยคง PVC แล้วข้อมูลยังอยู่

ขั้นตอน:

```powershell
# 1) สร้างคำขอและจด Record ID
$r = curl.exe -s -X POST "$URL/api/loans" -H "Content-Type: application/json" -d '{\"equipment_id\":6,\"borrower_name\":\"PersistTest\",\"purpose\":\"pvc\"}' | ConvertFrom-Json
$ID = $r.id; "Record ID = $ID"
curl.exe -s -X POST "$URL/api/loans/$ID/approve"
# 2) จดชื่อ/UID ของ DB Pod และ volume ของ PVC
kubectl get pod -n $NS -l app=equiploan-db -o jsonpath="{.items[0].metadata.name} {.items[0].metadata.uid}"
kubectl get pvc equiploan-db-data -n $NS -o jsonpath="{.spec.volumeName} {.status.phase}"
# 3) ลบ DB Pod (ไม่ลบ PVC)  Deployment จะสร้าง Pod ใหม่ให้
kubectl delete pod -n $NS -l app=equiploan-db
kubectl wait --for=condition=Ready pod -l app=equiploan-db -n $NS --timeout=120s
kubectl wait --for=condition=Ready pod -l app=equiploan-backend -n $NS --timeout=60s
# 4) ตรวจ Pod ใหม่ และอ่าน Record ID เดิม
kubectl get pod -n $NS -l app=equiploan-db -o jsonpath="{.items[0].metadata.name} {.items[0].metadata.uid}"
curl.exe -s -w "`n%{http_code}" "$URL/api/loans/$ID"
```

| ID | Input | Expected | Actual | ผล |
|---|---|---|---|---|
| T25 | สร้างคำขอ + approve | ได้ Record ID และ `status: approved` | Record ID = **6**, approve `200` | ✅ |
| T26 | DB Pod / PVC ก่อนลบ | PVC `Bound` | Pod `equiploan-db-5db9fdb647-nftnk` (uid `0c7ef7d8…`), PVC volume `pvc-d883fbf3…` `Bound` | ✅ |
| T27 | `kubectl delete pod -l app=equiploan-db` แล้วรอ | ได้ Pod ใหม่ (ชื่อ/UID ใหม่) ที่ `1/1`, PVC เป็น volume เดิม | Pod `equiploan-db-5db9fdb647-zl4dc` (uid `11217974…`) `1/1`, PVC `pvc-d883fbf3…` `Bound` (เดิม) | ✅ |
| T28 | `curl.exe -s -w "`n%{http_code}" "$URL/api/loans/6"` | `200` และข้อมูลเดิมครบ (`PersistTest`, `approved`) | `200` `{"id":6,...,"borrower_name":"PersistTest","purpose":"pvc","status":"approved",...}` คำขอทั้งหมดยังอยู่ครบ 6 รายการ | ✅ |

## 7. ใช้งานผ่าน Browser

| ID | Input | Expected | Actual | ผล |
|---|---|---|---|---|
| T29 | เปิด `$URL` ใน browser | เห็นตารางอุปกรณ์ 10 ชิ้น, ฟอร์มขอยืม, ตารางคำขอ ไม่มีข้อความ error | อุปกรณ์ 10 แถว (ถูกยืม 3 ชิ้น: #2 #4 #6), คำขอ 6 แถว, ไม่มีแถบ error | ✅ |
| T30 | กดปุ่มตามสถานะในตารางคำขอ | requested มีปุ่ม อนุมัติ/ปฏิเสธ, approved มีปุ่ม คืน, rejected/returned ไม่มีปุ่ม | ปุ่มที่แสดง: คืน (6), อนุมัติ/ปฏิเสธ (5), คืน (4), คืน (3); id 1, 2 ไม่มีปุ่ม | ✅ |
| T31 | ขอยืม → อนุมัติ → คืน ผ่านหน้าเว็บ (ทดสอบในรอบที่ 2 และ 4) | ข้อความสำเร็จ และสถานะอุปกรณ์เปลี่ยนตาม | ทำงานครบ (ดู `docs/ai-usage-log.md` รอบที่ 2, 4) | ✅ |

## สรุป

ผ่าน 33/33 กรณี (T01–T31 รวม T14b และ T17b)

ข้อสังเกตจากการทดสอบ:
- การเรียก `/readyz` ผ่าน Service ระหว่างที่ BE ไม่ Ready จะได้ connection refused ไม่ใช่ 503
  เพราะ Service ตัด Pod ที่ไม่ Ready ออก จึงต้องทดสอบที่ `localhost` ใน Pod ของ BE
- การแก้ ConfigMap ต้อง `rollout restart` จึงจะมีผล และถ้าค่าผิด Pod เก่าจะยังให้บริการต่อ
