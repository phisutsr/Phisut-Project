<?php
require __DIR__ . '/config.php';

function out($arr, $code = 200) {
    http_response_code($code);
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}

const BAD_LINK = 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่';

function valid_token($t) {
    return is_string($t) && preg_match('/^[a-f0-9]{64}$/', $t);
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $token = $_GET['token'] ?? '';
        if (!valid_token($token)) out(['ok' => false, 'error' => BAD_LINK]);
        $st = $pdo->prepare('SELECT 1 FROM Password_Reset WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()');
        $st->execute([hash('sha256', $token)]);
        if (!$st->fetchColumn()) out(['ok' => false, 'error' => BAD_LINK]);
        out(['ok' => true]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => false, 'error' => 'วิธีเรียกใช้ไม่ถูกต้อง'], 405);

    $in    = json_decode(file_get_contents('php://input'), true);
    $token = is_array($in) ? ($in['token'] ?? '') : '';
    $pass  = is_array($in) ? (string) ($in['password'] ?? '') : '';

    if (!valid_token($token)) out(['ok' => false, 'error' => BAD_LINK], 400);
    if (mb_strlen($pass) < 6)   out(['ok' => false, 'error' => 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'], 400);
    if (mb_strlen($pass) > 100) out(['ok' => false, 'error' => 'รหัสผ่านยาวเกินไป'], 400);

    $tables = ['guest' => '`User`', 'owner' => 'Property_Owner', 'admin' => 'Admin'];

    $pdo->beginTransaction();
    // FOR UPDATE: กันสองคำขอใช้โทเคนเดียวกันพร้อมกัน
    $st = $pdo->prepare('SELECT account_role, account_public_id FROM Password_Reset
                         WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() FOR UPDATE');
    $st->execute([hash('sha256', $token)]);
    $row = $st->fetch();
    if (!$row || !isset($tables[$row['account_role']])) {
        $pdo->rollBack();
        out(['ok' => false, 'error' => BAD_LINK], 400);
    }

    // หมายเหตุ: ระบบเดิมเก็บและเทียบรหัสผ่านแบบข้อความธรรมดา จึงเขียนในรูปแบบเดียวกันเพื่อให้ล็อกอินได้
    $up = $pdo->prepare('UPDATE ' . $tables[$row['account_role']] . ' SET password = ? WHERE public_id = ?');
    $up->execute([$pass, $row['account_public_id']]);

    // ทำให้ทุกลิงก์ที่ค้างอยู่ของบัญชีนี้ใช้ไม่ได้อีก
    $used = $pdo->prepare('UPDATE Password_Reset SET used_at = NOW() WHERE account_role = ? AND account_public_id = ? AND used_at IS NULL');
    $used->execute([$row['account_role'], $row['account_public_id']]);

    $pdo->commit();
    out(['ok' => true]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('[reset.php] ' . $e->getMessage());
    out(['ok' => false, 'error' => 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง'], 500);
}
