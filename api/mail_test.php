<?php
/*
 * ตัวทดสอบการส่งอีเมล: เปิด  http://localhost/project/api/mail_test.php  ในเบราว์เซอร์
 * จะส่งอีเมลทดสอบไปที่อีเมลผู้ส่ง (SMTP_FROM) ของตัวเอง แล้วแสดงผลว่าสำเร็จหรือติดปัญหาอะไร
 * ใช้ได้เฉพาะตอนเปิด debug เท่านั้น — ปิดใช้งานเองเมื่อตั้ง debug เป็น false (ตอนขึ้นเว็บจริง)
 */
header('Content-Type: text/plain; charset=utf-8');
require __DIR__ . '/mail.php';
$cfg = mail_cfg();

if (!$cfg['debug']) { http_response_code(403); exit("ปิดอยู่: ตั้ง 'debug' => true ใน api/mail_config.php (หรือ MAIL_DEBUG=1) ก่อนจึงจะทดสอบได้\n"); }

echo "โหมดส่ง : " . ($cfg['host'] === '' ? 'mail() ของ PHP (ยังไม่ได้ตั้งค่า SMTP)' : "SMTP {$cfg['host']}:{$cfg['port']} ({$cfg['secure']})") . "\n";
echo "ผู้ส่ง   : " . ($cfg['from'] ?: '(ว่าง)') . "\n";
echo "ผู้ใช้   : " . ($cfg['user'] ?: '(ว่าง)') . "\n";
echo "รหัสผ่าน: " . ($cfg['pass'] !== '' ? str_repeat('*', 8) . ' (ตั้งไว้แล้ว)' : '(ว่าง)') . "\n\n";

$to = $cfg['from'];
if (!filter_var($to, FILTER_VALIDATE_EMAIL)) exit("ยังไม่ได้ตั้งอีเมลผู้ส่ง (from)\n");

try {
    send_mail($to, 'ทดสอบส่งอีเมล - Sakon Stay', '<p>ถ้าคุณเห็นอีเมลนี้ แปลว่าระบบส่งอีเมลใช้งานได้แล้ว ✅</p>', "ถ้าคุณเห็นอีเมลนี้ แปลว่าระบบส่งอีเมลใช้งานได้แล้ว");
    echo "✅ ส่งสำเร็จ → ไปดูกล่องจดหมายของ $to (เช็กอีเมลขยะด้วย)\n";
} catch (Throwable $e) {
    echo "❌ ส่งไม่สำเร็จ: " . $e->getMessage() . "\n";
}
