<?php
/*
 * POST { "email": "..." }
 * สร้างโทเคนใช้ครั้งเดียว (อายุ 30 นาที) แล้วส่งลิงก์ไปที่อีเมลนั้น
 * ตอบกลับข้อความเดิมเสมอ ไม่ว่าจะมีอีเมลนี้ในระบบหรือไม่ เพื่อกันคนเดาอีเมลสมาชิก
 */
require __DIR__ . '/config.php';
require __DIR__ . '/mail.php';

function out($arr, $code = 200) {
    http_response_code($code);
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}

$in    = json_decode(file_get_contents('php://input'), true);
$email = is_array($in) ? strtolower(trim((string) ($in['email'] ?? ''))) : '';
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    out(['ok' => false, 'error' => 'รูปแบบอีเมลไม่ถูกต้อง'], 400);
}

$generic = ['ok' => true, 'message' => 'หากอีเมลนี้มีในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว'];
$cfg     = mail_cfg();

try {
    // จำกัดการขอซ้ำ: ห่างกันอย่างน้อย 60 วินาที และไม่เกิน ~6 รายการต่อชั่วโมงต่ออีเมล
    $st = $pdo->prepare('SELECT COUNT(*) FROM Password_Reset WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND)');
    $st->execute([$email]);
    if ((int) $st->fetchColumn() > 0) out($generic);

    $st = $pdo->prepare('SELECT COUNT(*) FROM Password_Reset WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)');
    $st->execute([$email]);
    if ((int) $st->fetchColumn() >= 6) out($generic);

    // หาบัญชีที่ใช้อีเมลนี้ (สมาชิก / เจ้าของที่พัก / แอดมิน)
    $lookups = [
        ['guest', 'SELECT public_id, username FROM `User` WHERE LOWER(email) = ?'],
        ['owner', 'SELECT public_id, username FROM Property_Owner WHERE LOWER(owner_email) = ?'],
        ['admin', 'SELECT public_id, username FROM Admin WHERE LOWER(admin_email) = ?'],
    ];
    $roleTh   = ['guest' => 'ผู้เข้าพัก', 'owner' => 'เจ้าของที่พัก', 'admin' => 'ผู้ดูแลระบบ'];
    $accounts = [];
    foreach ($lookups as [$role, $sql]) {
        $q = $pdo->prepare($sql);
        $q->execute([$email]);
        foreach ($q->fetchAll() as $r) {
            $accounts[] = ['role' => $role, 'pid' => $r['public_id'], 'username' => $r['username']];
        }
    }
    if (!$accounts) out($generic);

    // ที่อยู่เว็บสำหรับสร้างลิงก์: ใช้ APP_URL ถ้าตั้งไว้ ไม่งั้นอนุมานจากคำขอ
    $base = rtrim($cfg['app_url'], '/');
    if ($base === '') {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
              || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $dir   = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/forgot.php'))), '/');
        $base  = ($https ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $dir;
    }

    $revoke = $pdo->prepare('UPDATE Password_Reset SET used_at = NOW() WHERE account_role = ? AND account_public_id = ? AND used_at IS NULL');
    $insert = $pdo->prepare('INSERT INTO Password_Reset (token_hash, account_role, account_public_id, email, expires_at)
                             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))');

    $items = [];
    foreach ($accounts as $a) {
        $token = bin2hex(random_bytes(32));                 // โทเคนจริง ส่งทางอีเมลเท่านั้น
        $revoke->execute([$a['role'], $a['pid']]);          // ลิงก์เก่าของบัญชีนี้ใช้ไม่ได้อีก
        $insert->execute([hash('sha256', $token), $a['role'], $a['pid'], $email]);  // ฐานข้อมูลเก็บแค่ค่าแฮช
        $items[] = ['role' => $a['role'], 'username' => $a['username'], 'link' => $base . '/#/reset?token=' . $token];
    }

    // เขียนอีเมล
    $text = "สวัสดี\n\nเราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ ลิงก์ใช้ได้ภายใน 30 นาที และใช้ได้ครั้งเดียว\n\n";
    $html = '<div style="font-family:Tahoma,Arial,sans-serif;line-height:1.7;color:#222">'
          . '<p>สวัสดี</p><p>เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ ลิงก์ใช้ได้ภายใน <b>30 นาที</b> และใช้ได้ครั้งเดียว</p>';
    foreach ($items as $it) {
        $label = $roleTh[$it['role']] . ' · ชื่อผู้ใช้ ' . $it['username'];
        $text .= "$label\n{$it['link']}\n\n";
        $html .= '<p style="margin:18px 0 4px"><b>' . htmlspecialchars($label, ENT_QUOTES, 'UTF-8') . '</b></p>'
               . '<p style="margin:0"><a href="' . htmlspecialchars($it['link'], ENT_QUOTES, 'UTF-8') . '" '
               . 'style="display:inline-block;background:#1f6f5c;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">ตั้งรหัสผ่านใหม่</a></p>'
               . '<p style="margin:6px 0 0;font-size:12px;color:#666;word-break:break-all">หรือคัดลอกลิงก์: '
               . htmlspecialchars($it['link'], ENT_QUOTES, 'UTF-8') . '</p>';
    }
    $text .= "หากคุณไม่ได้เป็นผู้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมของคุณยังใช้ได้ตามปกติ\n";
    $html .= '<p style="margin-top:24px;color:#666;font-size:13px">หากคุณไม่ได้เป็นผู้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมของคุณยังใช้ได้ตามปกติ</p></div>';

    $resp = $generic;
    try {
        send_mail($email, 'ตั้งรหัสผ่านใหม่ - Sakon Stay', $html, $text);
    } catch (Throwable $e) {
        error_log('[forgot.php] ส่งอีเมลไม่สำเร็จ: ' . $e->getMessage());
        // ไม่บอกผู้ใช้ทั่วไป (กันเดาอีเมล) แต่ถ้าเปิด MAIL_DEBUG จะแนบสาเหตุไว้ให้ผู้พัฒนา
        if ($cfg['debug']) $resp['debug'] = $e->getMessage();
    }
    out($resp);
} catch (Throwable $e) {
    error_log('[forgot.php] ' . $e->getMessage());
    out(['ok' => false, 'error' => 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง'], 500);
}
