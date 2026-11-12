# Image ของ Frontend: nginx เสิร์ฟไฟล์ static และส่งต่อ /api ไปยัง BE
# ระบุเวอร์ชันชัดเจน ห้ามใช้ latest
FROM nginx:1.27.3-alpine

# ค่าเริ่มต้นของปลายทาง BE (เปลี่ยนได้ตอนรันด้วย -e หรือ env ใน k8s)
ENV BACKEND_HOST=backend \
    BACKEND_PORT=3000

# template จะถูกแปลงเป็น /etc/nginx/conf.d/default.conf ตอน container เริ่ม
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

# ไฟล์หน้าเว็บ
COPY index.html app.js style.css /usr/share/nginx/html/

EXPOSE 80
# ใช้ CMD เดิมของ image nginx (log ออก stdout/stderr อยู่แล้ว)
