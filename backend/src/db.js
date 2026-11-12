// การเชื่อมต่อ PostgreSQL: อ่านค่าทั้งหมดจาก environment variables
// (ใน Kubernetes ค่าทั่วไปมาจาก ConfigMap ส่วน DB_PASSWORD มาจาก Secret)
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,
  connectionTimeoutMillis: 2000, // ถ้า DB ไม่ตอบ ให้ error เร็ว ไม่ค้าง
});

// ถ้า connection ที่ว่างอยู่ใน pool หลุด (เช่น DB restart) ให้แค่ log ไว้
// ไม่ให้แอป crash  เพราะ BE ต้องอยู่รอดได้แม้ DB ล่ม
pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

module.exports = pool;
