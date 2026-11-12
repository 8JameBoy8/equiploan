// จุดเริ่มต้นของ Backend (Express)
const express = require('express');
const pool = require('./db');
const equipmentRoutes = require('./routes/equipment');
const loanRoutes = require('./routes/loans');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());

// log ทุก request ออก stdout (ดูได้ด้วย kubectl logs)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// /healthz : แอปยังทำงานอยู่ไหม (ไม่แตะ DB)
// ใช้กับ livenessProbe  -> DB ล่มแล้ว BE จะไม่ถูก restart วน
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// /readyz : พร้อมรับงานไหม (เชื่อมต่อ DB ได้)
// ใช้กับ readinessProbe -> DB ล่ม = 503 และ k8s จะหยุดส่ง traffic มาชั่วคราว
app.get('/readyz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (err) {
    console.error('[readyz] database not reachable:', err.message);
    res.status(503).json({ status: 'not ready', error: 'database not reachable' });
  }
});

app.use('/api/equipment', equipmentRoutes);
app.use('/api/loans', loanRoutes);

// ไม่พบเส้นทาง
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// จัดการ error กลาง: log ออก stderr แล้วตอบ JSON
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON ไม่ถูกต้อง' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`equiploan backend listening on port ${PORT}`);
});

// ปิดอย่างนุ่มนวลเมื่อ k8s ส่ง SIGTERM (เช่นตอน rollout)
function shutdown(signal) {
  console.log(`received ${signal}, shutting down`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
