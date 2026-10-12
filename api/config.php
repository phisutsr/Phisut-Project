<?php
/**
 * การตั้งค่าการเชื่อมต่อฐานข้อมูล MySQL ผ่าน XAMPP
 * ---------------------------------------------------------------
 * ค่าเริ่มต้นด้านล่างตรงกับค่าเริ่มต้นของ XAMPP (root ไม่มีรหัสผ่าน)
 * ถ้าเครื่องของคุณตั้งรหัสผ่าน root ไว้ ให้แก้ $DB_PASS ตรงนี้
 */
// ------------------------------------------------------------
// ค่าเชื่อมต่อฐานข้อมูล (แก้ที่นี่ที่เดียวเมื่อย้ายเครื่อง/ตั้งรหัสผ่าน MySQL)
//   $DB_HOST/$DB_PORT = ที่อยู่และพอร์ต MySQL | $DB_NAME = ชื่อฐานข้อมูล (ต้องตรงกับที่ Import จาก sql/sakon_stay_xampp.sql)
//   $DB_USER/$DB_PASS = ผู้ใช้/รหัสผ่าน (XAMPP ค่าเริ่มต้นคือ root และไม่มีรหัสผ่าน)
// ------------------------------------------------------------
// อ่านจาก Environment Variable ก่อน (ใช้บน Railway: MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE)
// ถ้าไม่มีตัวแปรเหล่านี้ (รันบน XAMPP) จะใช้ค่าเริ่มต้นของ XAMPP แทนโดยอัตโนมัติ
$DB_HOST = getenv('MYSQLHOST')     ?: '127.0.0.1';
$DB_NAME = getenv('MYSQLDATABASE') ?: 'sakon_booking';
$DB_USER = getenv('MYSQLUSER')     ?: 'root';
$DB_PASS = getenv('MYSQLPASSWORD') !== false ? getenv('MYSQLPASSWORD') : '';
$DB_PORT = getenv('MYSQLPORT')     ?: '3306';

// ------------------------------------------------------------
// ส่ง header ให้ตอบกลับเป็น JSON และอนุญาต CORS
//   ทุกไฟล์ใน api/ require ไฟล์นี้ จึงได้ header เหมือนกันหมด
//   Access-Control-Allow-Origin: * = เปิดให้เว็บโดเมนไหนเรียกก็ได้ (สะดวกตอนพัฒนา ตอนใช้งานจริงควรระบุโดเมนของเว็บเอง)
// ------------------------------------------------------------
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// ------------------------------------------------------------
// ตอบ OPTIONS ทันที
//   เบราว์เซอร์อาจส่งคำขอ OPTIONS (preflight) มาก่อน POST ตอบ 204 แล้วจบ ไม่ต้องทำงานต่อ
// ------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ------------------------------------------------------------
// เชื่อมต่อฐานข้อมูลด้วย PDO
//   ERRMODE_EXCEPTION = ถ้า SQL ผิดจะ throw exception (ให้ try/catch ในแต่ละ API จับได้)
//   FETCH_ASSOC = ผลลัพธ์เป็น array แบบชื่อคอลัมน์ เชื่อมต่อไม่ได้จะตอบ HTTP 500 พร้อมข้อความช่วยแก้ปัญหาแล้วหยุดทันที
//   ตัวแปร $pdo ที่สร้างตรงนี้ถูกใช้ต่อใน get_data.php และ save_data.php
// ------------------------------------------------------------
try {
    $pdo = new PDO(
        "mysql:host=$DB_HOST;port=$DB_PORT;dbname=$DB_NAME;charset=utf8mb4",
        $DB_USER,
        $DB_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'ok'    => false,
        'error' => 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ: ' . $e->getMessage() .
                    ' — ตรวจสอบว่าเปิด Apache และ MySQL ใน XAMPP Control Panel แล้ว ' .
                    'และนำเข้าไฟล์ sql/sakon_stay_xampp.sql เข้า phpMyAdmin แล้วหรือยัง',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * ปรับสคีมาให้อัตโนมัติ (ไม่ต้องรัน SQL เพิ่มเอง ถ้า import ฐานข้อมูลรุ่นเก่าไว้แล้ว)
 * - Accommodation.promptpay_id  : เลขพร้อมเพย์ของเจ้าของที่พัก ใช้สร้าง QR รับเงินจริง
 * - Accommodation.rating_avg / review_count : ดาวเฉลี่ยและจำนวนรีวิว
 * - Room.room_available : จำนวนห้องคงเหลือ (หักเมื่อชำระเงินแล้ว)
 * - รูปภาพ/สลิป เปลี่ยนเป็น MEDIUMTEXT เพราะรูปแบบ base64 ยาวเกิน TEXT (64KB)
 */
try {
    // ------------------------------------------------------------
    // ส่วนปรับสคีมาอัตโนมัติ — ขั้นที่ 1: ตรวจว่าตาราง/คอลัมน์ใดมีอยู่แล้ว
    //   ค้น INFORMATION_SCHEMA ว่าคอลัมน์ promptpay_id, rating_avg, review_count, room_available, photos, slip_path มีไหม และชนิดอะไร
    //   ทำงานทุกครั้งที่มีการเรียก API (เบามาก เพราะเช็กแค่ไม่กี่คอลัมน์)
    // ------------------------------------------------------------
    $have = [];
    $q = $pdo->query("SELECT LOWER(TABLE_NAME) t, COLUMN_NAME c, DATA_TYPE d FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND (
          (LOWER(TABLE_NAME)='accommodation' AND COLUMN_NAME IN ('promptpay_id','rating_avg','review_count','photos')) OR
          (LOWER(TABLE_NAME)='room' AND COLUMN_NAME IN ('room_available','photos')) OR
          (LOWER(TABLE_NAME)='booking' AND COLUMN_NAME='slip_path'))");
    foreach ($q->fetchAll() as $r) { $have[$r['t'] . '.' . $r['c']] = strtolower($r['d']); }
    // ------------------------------------------------------------
    // ขั้นที่ 2: เพิ่มคอลัมน์ที่ยังไม่มี
    //   สำหรับคนที่ Import SQL รุ่นเก่าไว้ ไม่ต้องรัน SQL เพิ่มเอง ถ้าจะเพิ่มคอลัมน์ใหม่ในอนาคต: เพิ่มชื่อใน SELECT ด้านบน + เพิ่มคำสั่ง ALTER ในรายการนี้
    //   (คำสั่ง ALTER ทำงานในไฟล์นี้ได้เพราะอยู่นอก transaction ของ save_data.php)
    // ------------------------------------------------------------
    $add = [
        'accommodation.promptpay_id' => 'ALTER TABLE Accommodation ADD COLUMN promptpay_id VARCHAR(20) NULL',
        'accommodation.rating_avg'   => 'ALTER TABLE Accommodation ADD COLUMN rating_avg DECIMAL(3,2) NOT NULL DEFAULT 0',
        'accommodation.review_count' => 'ALTER TABLE Accommodation ADD COLUMN review_count INT NOT NULL DEFAULT 0',
        'room.room_available'        => 'ALTER TABLE Room ADD COLUMN room_available INT NOT NULL DEFAULT 0',
    ];
    foreach ($add as $k => $sql) { if (!isset($have[$k])) $pdo->exec($sql); }
    // ------------------------------------------------------------
    // ขั้นที่ 3: ขยายคอลัมน์รูปภาพ/สลิปจาก TEXT (64KB) เป็น MEDIUMTEXT (16MB)
    //   เพราะรูปถูกเก็บเป็น base64 ซึ่งยาวกว่าไฟล์จริงประมาณ 33%
    // ------------------------------------------------------------
    $big = [
        'accommodation.photos' => 'ALTER TABLE Accommodation MODIFY photos MEDIUMTEXT',
        'room.photos'          => 'ALTER TABLE Room MODIFY photos MEDIUMTEXT',
        'booking.slip_path'    => 'ALTER TABLE Booking MODIFY slip_path MEDIUMTEXT',
    ];
    foreach ($big as $k => $sql) { if (($have[$k] ?? '') === 'text') $pdo->exec($sql); }
    // ตารางเก็บข้อมูลหน้าเว็บไซต์ที่แอดมินแก้ไข (ชื่อเว็บ ข้อความหน้าแรก เบอร์โทร ฯลฯ)
    $pdo->exec("CREATE TABLE IF NOT EXISTS Site_Setting (
        setting_key   VARCHAR(40) PRIMARY KEY,
        setting_value TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (PDOException $e) {
    // ถ้าปรับไม่ได้ (เช่น สิทธิ์ไม่พอ) ให้ไป Import sql/sakon_stay_xampp.sql ใหม่
}
