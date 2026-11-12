# โปรเจกต์: ระบบยืม-คืนอุปกรณ์ของชมรม (equiploan) บน Kubernetes

โครงงานวิชา DGT01 3130 ต้องส่งมอบระบบ Three Tier ที่ deploy และทดสอบซ้ำได้ ทีมมี 4 คน
และทุกคนต้องอธิบายระบบได้ โค้ดจึงต้องเรียบง่าย อ่านง่าย มี comment สั้นๆ

## ระบบ
- FE: HTML + JavaScript ธรรมดา เสิร์ฟด้วย nginx
- BE: Node.js + Express (JavaScript ไม่ใช้ TypeScript)
- DB: PostgreSQL (image สำเร็จรูป) เก็บข้อมูลบน PVC
- Kubernetes: minikube บน Windows (ใช้คำสั่งแบบ PowerShell)
- Workflow: ขอยืม (requested) -> อนุมัติ/ปฏิเสธ (approved/rejected) -> คืน (returned)
- ข้อมูล 2 ตาราง: equipment และ loans ใช้ข้อมูลสมมติ ไม่มีระบบล็อกอิน

## กติกาที่ต้องทำตามเสมอ
- FE, BE, DB เป็น workload แยกกัน FE ติดต่อ DB ผ่าน BE เท่านั้น
- DB ไม่เปิดออกนอก cluster BE เป็น Service ภายใน cluster
- BE รับค่า DB ผ่าน environment variables ค่าทั่วไปใช้ ConfigMap ค่าลับใช้ Secret
- ห้ามฝังรหัสผ่านใน image และห้ามใส่ค่าลับจริงใน repository (ใช้ไฟล์ *.example ที่เป็นค่าสมมติ)
- BE มี /healthz (แอปยังทำงาน) และ /readyz (เชื่อมต่อ DB ได้) ถ้า DB ล่ม /readyz ต้องไม่ผ่านโดยไม่ทำให้ BE restart วน
- Log เขียนออก stdout/stderr
- FE/BE ต้องกำหนด CPU/memory requests และ limits
- ระบุเวอร์ชัน image ชัดเจน ห้ามใช้ tag latest
- README เขียนเป็นภาษาไทย มี prerequisites, build, deploy, test และ cleanup

## วิธีทำงาน
- ก่อนเขียนโค้ดทุกรอบ ให้สรุปแผนสั้นๆ แล้วรอฉันยืนยัน
- แสดงคำสั่งที่จะรันก่อนรัน และห้ามลบหรือแก้สิ่งที่ไม่ใช่ของโปรเจกต์นี้
- หลังจบแต่ละรอบ ให้เพิ่มบันทึกลงไฟล์ docs/ai-usage-log.md ว่าสร้างอะไร
  และมีอะไรที่มนุษย์ต้องตรวจ