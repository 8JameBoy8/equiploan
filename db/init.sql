-- โครงสร้างฐานข้อมูลระบบยืม-คืนอุปกรณ์ของชมรม (equiploan)
-- ไฟล์นี้รันอัตโนมัติครั้งแรกที่ PostgreSQL สร้าง data directory ใหม่
-- (เมื่อวางไว้ใน /docker-entrypoint-initdb.d/)

-- ตารางอุปกรณ์: ไม่มีคอลัมน์สถานะ เพราะสถานะ "ว่าง/ถูกยืม" คำนวณจากตาราง loans
CREATE TABLE IF NOT EXISTS equipment (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    category    VARCHAR(50),
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ตารางคำขอยืม: requested -> approved/rejected -> returned
CREATE TABLE IF NOT EXISTS loans (
    id               SERIAL PRIMARY KEY,
    equipment_id     INT NOT NULL REFERENCES equipment(id),
    borrower_name    VARCHAR(100) NOT NULL,
    borrower_contact VARCHAR(100),
    purpose          TEXT,
    status           VARCHAR(20) NOT NULL DEFAULT 'requested'
                     CHECK (status IN ('requested', 'approved', 'rejected', 'returned')),
    reject_reason    TEXT,
    requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at       TIMESTAMPTZ,  -- เวลาที่อนุมัติหรือปฏิเสธ
    returned_at      TIMESTAMPTZ
);

-- กฎสำคัญ: อุปกรณ์ 1 ชิ้นมีคำขอที่ "approved" (ยังไม่คืน) ได้แค่ 1 รายการ
-- บังคับที่ระดับ DB เพื่อกันกรณีมีคนกดอนุมัติพร้อมกัน
CREATE UNIQUE INDEX IF NOT EXISTS one_active_loan_per_equipment
    ON loans (equipment_id)
    WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS loans_status_idx ON loans (status);

-- ข้อมูลสมมติ: อุปกรณ์ 10 ชิ้น
INSERT INTO equipment (name, category, description) VALUES
    ('กล้อง DSLR Canon EOS 200D',   'กล้อง',     'พร้อมเลนส์ kit 18-55mm และแบตเตอรี่ 2 ก้อน'),
    ('ขาตั้งกล้อง Tripod',          'กล้อง',     'ปรับความสูงได้ถึง 160 ซม.'),
    ('ไมโครโฟนไร้สาย',              'เสียง',     'ชุดไมค์ลอย 2 ตัว พร้อมตัวรับสัญญาณ'),
    ('ลำโพงบลูทูธพกพา',             'เสียง',     'แบตเตอรี่ใช้งานได้ประมาณ 8 ชั่วโมง'),
    ('โปรเจกเตอร์',                 'นำเสนอ',    'ความสว่าง 3000 lumens พร้อมสาย HDMI'),
    ('จอรับภาพแบบตั้งพื้น',          'นำเสนอ',    'ขนาด 100 นิ้ว'),
    ('ลูกฟุตบอล',                   'กีฬา',      'เบอร์ 5'),
    ('ชุดไม้แบดมินตัน',              'กีฬา',      'ไม้ 4 อัน พร้อมลูกขนไก่ 1 หลอด'),
    ('เต็นท์พับ 3x3 เมตร',           'กิจกรรม',   'สำหรับจัดบูธกิจกรรมกลางแจ้ง'),
    ('ปลั๊กพ่วง 10 เมตร',            'อุปกรณ์ไฟฟ้า', '4 ช่อง มีสวิตช์แยก');
