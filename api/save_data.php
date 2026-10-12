<?php
require __DIR__ . '/config.php';

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง (ต้องเป็น JSON)'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo->beginTransaction();

    foreach (['Review', 'Booking', 'Room', 'Accommodation', 'News'] as $t) {
        $pdo->exec("DELETE FROM `$t`");
    }
    foreach (['User', 'Property_Owner', 'Admin'] as $t) {
        $pdo->exec("DELETE FROM `$t`");
    }
    // หมายเหตุ: ห้ามใช้ ALTER TABLE ... AUTO_INCREMENT ภายใน transaction เพราะเป็นคำสั่ง DDL
    // ที่ MySQL จะ commit ให้ทันที ทำให้ตอน commit() ท้ายไฟล์เกิด "There is no active transaction"

    $ownerMap = []; $userMap = []; $accMap = []; $roomMap = []; $bookingMap = []; $accName = [];

    $stAdmin = $pdo->prepare('INSERT INTO Admin (admin_email, first_name, last_name, password, phone_number, username, public_id) VALUES (?,?,?,?,?,?,?)');
    $stOwner = $pdo->prepare('INSERT INTO Property_Owner (owner_email, contact_info, owner_name, username, password, public_id) VALUES (?,?,?,?,?,?)');
    $stUser  = $pdo->prepare('INSERT INTO User (first_name, last_name, phone_number, password, payment, username, email, address, public_id) VALUES (?,?,?,?,?,?,?,?,?)');

    foreach (($data['users'] ?? []) as $u) {
        $parts = preg_split('/\s+/', trim($u['name'] ?? ''), 2);
        $first = $parts[0] ?? ''; $last = $parts[1] ?? '';
        $role  = $u['role'] ?? 'guest';

        if ($role === 'admin') {
            $stAdmin->execute([
                $u['email'] ?? ('admin+' . $u['id'] . '@sakonstay.th'), $first, $last,
                $u['password'] ?? '', $u['phone'] ?? null, $u['username'], $u['id'],
            ]);
        } elseif ($role === 'owner') {
            $stOwner->execute([
                $u['email'] ?? ($u['username'] . '@sakonstay.th'), $u['address'] ?? null,
                $u['name'] ?? '', $u['username'], $u['password'] ?? '', $u['id'],
            ]);
            $ownerMap[$u['id']] = (int) $pdo->lastInsertId();
        } else {
            $stUser->execute([
                $first, $last, $u['phone'] ?? null, $u['password'] ?? '', 0,
                $u['username'], $u['email'] ?? null, $u['address'] ?? null, $u['id'],
            ]);
            $userMap[$u['id']] = (int) $pdo->lastInsertId();
        }
    }

    $stAcc = $pdo->prepare('INSERT INTO Accommodation
        (owner_id, accommodation_name, address, price, description, type, district, phone_number, review_status, review_note, amenities, photos, promptpay_id, public_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    foreach (($data['properties'] ?? []) as $p) {
        $ownerInt = $ownerMap[$p['ownerId']] ?? null;
        if ($ownerInt === null) continue;
        $stAcc->execute([
            $ownerInt, $p['name'], $p['address'] ?? null, 0, $p['desc'] ?? null,
            $p['type'], $p['district'] ?? 'เมืองสกลนคร', $p['phone'] ?? null,
            $p['status'] ?? 'pending', $p['note'] ?? null,
            json_encode($p['amenities'] ?? [], JSON_UNESCAPED_UNICODE),
            json_encode($p['photos'] ?? [], JSON_UNESCAPED_UNICODE),
            preg_replace('/\D/', '', (string) ($p['promptpay'] ?? '')) ?: null,
            $p['id'],
        ]);
        $accMap[$p['id']]  = (int) $pdo->lastInsertId();
        $accName[$p['id']] = $p['name'];
    }

    $stRoom = $pdo->prepare('INSERT INTO Room
        (accommodation_id, accommodation_name, type, price, capacity, room_count, bed_detail, room_size, status, amenities, photos, public_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    foreach (($data['rooms'] ?? []) as $r) {
        $accInt = $accMap[$r['propertyId']] ?? null;
        if ($accInt === null) continue;
        $stRoom->execute([
            $accInt, $accName[$r['propertyId']] ?? null, $r['type'], $r['price'] ?? 0,
            $r['capacity'] ?? 2, $r['qty'] ?? 1, $r['beds'] ?? null, $r['size'] ?? null,
            $r['status'] ?? 'available',
            json_encode($r['amenities'] ?? [], JSON_UNESCAPED_UNICODE),
            json_encode($r['photos'] ?? [], JSON_UNESCAPED_UNICODE),
            $r['id'],
        ]);
        $roomMap[$r['id']] = (int) $pdo->lastInsertId();
    }

    // อัปเดตราคาเริ่มต้นของที่พักให้เท่ากับราคาห้องที่ถูกที่สุด
    $pdo->exec('UPDATE Accommodation a SET price = (SELECT MIN(price) FROM Room r WHERE r.accommodation_id = a.accommodation_id)');

    $statusMapIn = [
        'pending' => 'Pending', 'confirmed' => 'Confirmed', 'checkedin' => 'CheckedIn',
        'completed' => 'Completed', 'cancelled' => 'Cancelled',
    ];
    $stBook = $pdo->prepare('INSERT INTO Booking
        (booking_code, user_id, accommodation_id, room_id, booking_status, check_in_date, check_out_date, room_qty, total_price, accommodation_name, pay_method, pay_status, slip_path, guest_note, created_at, public_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    foreach (($data['bookings'] ?? []) as $b) {
        $userInt = $userMap[$b['userId']] ?? null;
        $accInt  = $accMap[$b['propertyId']] ?? null;
        $roomInt = $roomMap[$b['roomId']] ?? null;
        if ($userInt === null || $accInt === null || $roomInt === null) continue;
        $stBook->execute([
            $b['code'] ?? ('SKN-' . random_int(100000, 999999)), $userInt, $accInt, $roomInt,
            $statusMapIn[$b['status'] ?? 'pending'] ?? 'Pending', $b['checkIn'], $b['checkOut'],
            $b['qty'] ?? 1, $b['total'] ?? 0, $accName[$b['propertyId']] ?? null,
            $b['payMethod'] ?? 'QR code', $b['payStatus'] ?? 'unpaid', $b['slip'] ?? null,
            $b['note'] ?? null, ($b['createdAt'] ?? date('Y-m-d')) . ' 00:00:00', $b['id'],
        ]);
        $bookingMap[$b['id']] = (int) $pdo->lastInsertId();
    }

    $stRev = $pdo->prepare('INSERT INTO Review (member_id, accommodation_id, booking_id, stars, comment, review_date, public_id) VALUES (?,?,?,?,?,?,?)');
    foreach (($data['reviews'] ?? []) as $v) {
        $userInt = $userMap[$v['userId']] ?? null;
        $accInt  = $accMap[$v['propertyId']] ?? null;
        $bookInt = !empty($v['bookingId']) ? ($bookingMap[$v['bookingId']] ?? null) : null;
        if ($userInt === null || $accInt === null) continue;
        $stars = max(1, min(5, (int) round((float) ($v['rating'] ?? 5))));   // ดาวต้องอยู่ระหว่าง 1–5 เสมอ
        $stRev->execute([$userInt, $accInt, $bookInt, $stars, $v['comment'] ?? '', $v['date'] ?? date('Y-m-d'), $v['id']]);
    }

    $stNews = $pdo->prepare('INSERT INTO News (title, content, category, publish_date, is_active, public_id) VALUES (?,?,?,?,?,?)');
    foreach (($data['news'] ?? []) as $n) {
        $stNews->execute([$n['title'], $n['body'] ?? '', $n['type'] ?? 'ข่าวสาร', $n['date'] ?? date('Y-m-d'), !empty($n['active']) ? 1 : 0, $n['id']]);
    }

    // บันทึกข้อมูลหน้าเว็บไซต์ (แอดมินแก้ไขในแท็บ "ข้อมูลหน้าเว็บไซต์")
    $stSite = $pdo->prepare('REPLACE INTO Site_Setting (setting_key, setting_value) VALUES (?, ?)');
    foreach (['name', 'heroTitle', 'phone', 'email', 'about'] as $k) {
        if (isset($data['site'][$k]) && is_string($data['site'][$k])) $stSite->execute([$k, $data['site'][$k]]);
    }

    // คำนวณดาวเฉลี่ยและจำนวนรีวิวของแต่ละที่พัก
    $pdo->exec('UPDATE Accommodation a SET
        rating_avg   = COALESCE((SELECT ROUND(AVG(r.stars), 2) FROM Review r WHERE r.accommodation_id = a.accommodation_id), 0),
        review_count = (SELECT COUNT(*) FROM Review r WHERE r.accommodation_id = a.accommodation_id)');

    // ห้องคงเหลือ = ห้องทั้งหมด − ห้องที่ชำระเงินแล้ว/รอตรวจสลิป (เฉพาะการจองที่ยังไม่ยกเลิกหรือเสร็จสิ้น)
    $pdo->exec("UPDATE Room r SET room_available = GREATEST(0, r.room_count - COALESCE((
        SELECT SUM(b.room_qty) FROM Booking b
        WHERE b.room_id = r.room_id
          AND b.booking_status IN ('Pending','Confirmed','CheckedIn')
          AND b.pay_status IN ('waiting','paid')
          AND b.check_out_date > CURDATE()), 0))");

    if ($pdo->inTransaction()) $pdo->commit();
    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
