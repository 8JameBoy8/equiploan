# Image ของ Backend (Node.js + Express)
# ระบุเวอร์ชัน base image ชัดเจน ห้ามใช้ latest
FROM node:22.12.0-alpine

WORKDIR /app

# ติดตั้ง dependency ก่อน (แยก layer เพื่อให้ build ซ้ำเร็วขึ้นเมื่อแก้แค่โค้ด)
# npm ci ติดตั้งตาม package-lock.json เป๊ะๆ และไม่เอา devDependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# โค้ดแอป (ไฟล์เป็นของ root  user ที่รันแอปจึงอ่านได้แต่แก้ไม่ได้)
COPY src ./src

# ค่าทั่วไปเท่านั้น  ค่า DB_* (รวมรหัสผ่าน) ส่งเข้ามาตอนรัน
# ผ่าน ConfigMap / Secret ของ Kubernetes  ห้ามใส่ไว้ใน image
ENV NODE_ENV=production \
    PORT=3000

# รันด้วย user "node" (uid 1000) ที่มีมาใน image  ไม่ใช่ root
USER node

EXPOSE 3000

# เรียก node ตรงๆ (ไม่ผ่าน npm) เพื่อให้ SIGTERM จาก k8s ถึงแอปโดยตรง
CMD ["node", "src/server.js"]
