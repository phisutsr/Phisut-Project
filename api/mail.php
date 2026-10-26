<?php
/*
 * ตัวส่งอีเมลสำหรับระบบลืมรหัสผ่าน
 *  - ถ้าตั้งค่า SMTP (host) จะส่งผ่าน SMTP โดยตรง (รองรับ Gmail, Outlook, Brevo, Mailgun ฯลฯ)
 *  - ถ้าไม่ได้ตั้งค่า จะใช้ฟังก์ชัน mail() ของ PHP (ต้องตั้ง sendmail ใน XAMPP เอง)
 *
 * ค่าตั้งอ่านจาก "ตัวแปรสภาพแวดล้อม" ก่อน (เหมาะกับ Railway) แล้วค่อยอ่านจากไฟล์ api/mail_config.php
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE (tls|ssl|none), SMTP_USER, SMTP_PASS,
 *   SMTP_FROM, SMTP_FROM_NAME, APP_URL, MAIL_DEBUG
 */

function mail_cfg() {
    static $cfg = null;
    if ($cfg !== null) return $cfg;

    $file = [];
    $f = __DIR__ . '/mail_config.php';
    if (is_file($f)) {
        $r = include $f;
        if (is_array($r)) $file = $r;
    }
    $pick = function ($envKey, $key, $def = '') use ($file) {
        $v = getenv($envKey);
        if ($v !== false && $v !== '') return $v;
        return $file[$key] ?? $def;
    };

    $cfg = [
        'host'      => trim((string) $pick('SMTP_HOST', 'host')),
        'port'      => (int) $pick('SMTP_PORT', 'port', 587),
        'secure'    => strtolower((string) $pick('SMTP_SECURE', 'secure', 'tls')),
        'user'      => (string) $pick('SMTP_USER', 'user'),
        'pass'      => (string) $pick('SMTP_PASS', 'pass'),
        'from'      => trim((string) $pick('SMTP_FROM', 'from')),
        'from_name' => (string) $pick('SMTP_FROM_NAME', 'from_name', 'Sakon Stay'),
        'app_url'   => trim((string) $pick('APP_URL', 'app_url')),
        'verify_tls'=> (function ($v) { return !($v === false || in_array(strtolower((string) $v), ['0', 'false', 'no'], true)); })($pick('SMTP_VERIFY_TLS', 'verify_tls', '1')),
        'debug'     => in_array(strtolower((string) $pick('MAIL_DEBUG', 'debug', '')), ['1', 'true', 'yes'], true),
    ];
    if ($cfg['from'] === '') $cfg['from'] = $cfg['user'];
    return $cfg;
}

function smtp_read($fp) {
    $data = '';
    while (($line = fgets($fp, 515)) !== false) {
        $data .= $line;
        // บรรทัดสุดท้ายของคำตอบ: ตัวอักษรที่ 4 เป็นช่องว่าง (ถ้าเป็น "-" แปลว่ายังมีต่อ)
        if (strlen($line) < 4 || $line[3] === ' ') break;
    }
    return $data;
}

function smtp_cmd($fp, $cmd, $expect) {
    if ($cmd !== null) fwrite($fp, $cmd . "\r\n");
    $resp = smtp_read($fp);
    if (!in_array(substr($resp, 0, 3), (array) $expect, true)) {
        throw new Exception('SMTP: ' . trim($resp));
    }
    return $resp;
}

/** ส่งอีเมล (html + text) สำเร็จคืน true ไม่สำเร็จ throw Exception */
function send_mail($to, $subject, $html, $text) {
    $cfg = mail_cfg();

    // กัน header injection: ต้องเป็นอีเมลที่ถูกต้องและไม่มีขึ้นบรรทัดใหม่
    if (!filter_var($to, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $to)) {
        throw new Exception('ที่อยู่อีเมลผู้รับไม่ถูกต้อง');
    }
    $subject = str_replace(["\r", "\n"], ' ', $subject);

    $boundary = 'b' . bin2hex(random_bytes(8));
    $fromName = '=?UTF-8?B?' . base64_encode(str_replace(["\r", "\n"], ' ', $cfg['from_name'])) . '?=';
    $encSubj  = '=?UTF-8?B?' . base64_encode($subject) . '?=';

    $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
          . chunk_split(base64_encode($text))
          . "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
          . chunk_split(base64_encode($html))
          . "--$boundary--\r\n";

    // ---------- ไม่ได้ตั้งค่า SMTP → ใช้ mail() ----------
    if ($cfg['host'] === '') {
        $from = $cfg['from'] !== '' ? $cfg['from'] : 'noreply@localhost';
        $headers = "From: $fromName <$from>\r\nMIME-Version: 1.0\r\n"
                 . "Content-Type: multipart/alternative; boundary=\"$boundary\"";
        if (!@mail($to, $encSubj, $body, $headers)) {
            throw new Exception('ฟังก์ชัน mail() ส่งไม่สำเร็จ (ยังไม่ได้ตั้งค่า SMTP ใน api/mail_config.php หรือ sendmail ของ XAMPP)');
        }
        return true;
    }

    // ---------- ส่งผ่าน SMTP ----------
    if ($cfg['from'] === '' || !filter_var($cfg['from'], FILTER_VALIDATE_EMAIL)) {
        throw new Exception('ยังไม่ได้ตั้งค่าอีเมลผู้ส่ง (SMTP_FROM)');
    }
    $scheme = $cfg['secure'] === 'ssl' ? 'ssl://' : 'tcp://';
    $ctx = stream_context_create(['ssl' => [
        'verify_peer'      => $cfg['verify_tls'],
        'verify_peer_name' => $cfg['verify_tls'],
    ]]);
    $fp = @stream_socket_client($scheme . $cfg['host'] . ':' . $cfg['port'], $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) throw new Exception("เชื่อมต่อ SMTP ไม่ได้: $errstr ($errno)");
    stream_set_timeout($fp, 15);

    try {
        smtp_cmd($fp, null, '220');
        smtp_cmd($fp, 'EHLO localhost', '250');
        if ($cfg['secure'] === 'tls') {
            smtp_cmd($fp, 'STARTTLS', '220');
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new Exception('เปิดการเข้ารหัส TLS กับเซิร์ฟเวอร์อีเมลไม่สำเร็จ');
            }
            smtp_cmd($fp, 'EHLO localhost', '250');
        }
        if ($cfg['user'] !== '') {
            smtp_cmd($fp, 'AUTH LOGIN', '334');
            smtp_cmd($fp, base64_encode($cfg['user']), '334');
            smtp_cmd($fp, base64_encode($cfg['pass']), '235');
        }
        smtp_cmd($fp, 'MAIL FROM:<' . $cfg['from'] . '>', '250');
        smtp_cmd($fp, 'RCPT TO:<' . $to . '>', ['250', '251']);
        smtp_cmd($fp, 'DATA', '354');

        $domain = substr(strrchr($cfg['from'], '@'), 1) ?: 'localhost';
        $msg = 'Date: ' . date('r') . "\r\n"
             . "From: $fromName <{$cfg['from']}>\r\n"
             . "To: <$to>\r\n"
             . "Subject: $encSubj\r\n"
             . 'Message-ID: <' . bin2hex(random_bytes(8)) . "@$domain>\r\n"
             . "MIME-Version: 1.0\r\n"
             . "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n\r\n"
             . $body;
        // dot-stuffing: บรรทัดที่ขึ้นต้นด้วย "." ต้องเติม "." เพิ่มตามมาตรฐาน SMTP
        $msg = preg_replace('/^\./m', '..', $msg);
        fwrite($fp, $msg . "\r\n.\r\n");
        smtp_cmd($fp, null, '250');
        @fwrite($fp, "QUIT\r\n");
    } finally {
        fclose($fp);
    }
    return true;
}
