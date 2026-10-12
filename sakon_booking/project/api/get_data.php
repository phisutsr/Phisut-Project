<?php
require __DIR__ . '/config.php';

function jarr($text) {
    if (!$text) return [];
    $d = json_decode($text, true);
    return is_array($d) ? $d : [];
}

$out = [
    'site' => [
        'name'      => 'ครามสเตย์ สกลนคร',
        'heroTitle' => 'ที่พักในเขตอำเภอเมืองสกลนคร จองจบในที่เดียว',
        'phone'     => '042-711-000',
        'email'     => 'contact@sakonstay.th',
        'about'     => 'ระบบกลางสำหรับรวบรวมที่พักในเขตอำเภอเมืองสกลนคร เชื่อมเจ้าของที่พักกับผู้เข้าพักโดยตรง รับเฉพาะที่พัก 4 ประเภท ได้แก่ โรงแรม อพาร์ทเม้น หอพัก และรีสอร์ท',
    ],
    'districts' => ['เมืองสกลนคร'],
    'types'     => ['โรงแรม', 'อพาร์ทเม้น', 'หอพัก', 'รีสอร์ท'],
    'users'     => [],
    'properties'=> [],
    'rooms'     => [],
    'bookings'  => [],
    'reviews'   => [],
    'news'      => [],
    'resets'    => [],
];

try {
    foreach ($pdo->query('SELECT * FROM Admin') as $a) {
        $out['users'][] = [
            'id' => $a['public_id'], 'role' => 'admin', 'username' => $a['username'],
            'password' => $a['password'], 'name' => trim($a['first_name'] . ' ' . $a['last_name']),
            'phone' => $a['phone_number'], 'email' => $a['admin_email'], 'address' => '',
        ];
    }
    foreach ($pdo->query('SELECT * FROM Property_Owner') as $o) {
        $out['users'][] = [
            'id' => $o['public_id'], 'role' => 'owner', 'username' => $o['username'],
            'password' => $o['password'], 'name' => $o['owner_name'], 'phone' => '',
            'email' => $o['owner_email'], 'address' => $o['contact_info'],
        ];
    }
    foreach ($pdo->query('SELECT * FROM User') as $u) {
        $out['users'][] = [
            'id' => $u['public_id'], 'role' => 'guest', 'username' => $u['username'],
            'password' => $u['password'], 'name' => trim($u['first_name'] . ' ' . $u['last_name']),
            'phone' => $u['phone_number'], 'email' => $u['email'], 'address' => $u['address'],
        ];
    }

    $ownerPub = [];
    foreach ($pdo->query('SELECT owner_id, public_id FROM Property_Owner') as $r) {
        $ownerPub[$r['owner_id']] = $r['public_id'];
    }

    foreach ($pdo->query('SELECT * FROM Accommodation') as $p) {
        $out['properties'][] = [
            'id' => $p['public_id'], 'ownerId' => $ownerPub[$p['owner_id']] ?? null,
            'name' => $p['accommodation_name'], 'type' => $p['type'], 'district' => $p['district'],
            'address' => $p['address'], 'phone' => $p['phone_number'], 'desc' => $p['description'],
            'amenities' => jarr($p['amenities']), 'photos' => jarr($p['photos']),
            'status' => $p['review_status'], 'note' => $p['review_note'],
            'promptpay' => $p['promptpay_id'], 'ratingAvg' => (float) $p['rating_avg'], 'ratingCount' => (int) $p['review_count'],
        ];
    }

    $accPub = [];
    foreach ($pdo->query('SELECT accommodation_id, public_id FROM Accommodation') as $r) {
        $accPub[$r['accommodation_id']] = $r['public_id'];
    }

    foreach ($pdo->query('SELECT * FROM Room') as $r) {
        $out['rooms'][] = [
            'id' => $r['public_id'], 'propertyId' => $accPub[$r['accommodation_id']] ?? null,
            'type' => $r['type'], 'price' => (float) $r['price'], 'qty' => (int) $r['room_count'],
            'capacity' => (int) $r['capacity'], 'beds' => $r['bed_detail'],
            'size' => $r['room_size'] !== null ? (int) $r['room_size'] : null,
            'amenities' => jarr($r['amenities']), 'status' => $r['status'], 'photos' => jarr($r['photos']),
            'available' => (int) $r['room_available'],
        ];
    }

    $userPub = [];
    foreach ($pdo->query('SELECT member_id, public_id FROM User') as $r) {
        $userPub[$r['member_id']] = $r['public_id'];
    }
    $roomPub = [];
    foreach ($pdo->query('SELECT room_id, public_id FROM Room') as $r) {
        $roomPub[$r['room_id']] = $r['public_id'];
    }

    $statusMapOut = [
        'Pending' => 'pending', 'Confirmed' => 'confirmed', 'CheckedIn' => 'checkedin',
        'Completed' => 'completed', 'Cancelled' => 'cancelled',
    ];

    foreach ($pdo->query('SELECT * FROM Booking') as $b) {
        $out['bookings'][] = [
            'id' => $b['public_id'], 'code' => $b['booking_code'], 'userId' => $userPub[$b['user_id']] ?? null,
            'propertyId' => $accPub[$b['accommodation_id']] ?? null, 'roomId' => $roomPub[$b['room_id']] ?? null,
            'checkIn' => $b['check_in_date'], 'checkOut' => $b['check_out_date'], 'qty' => (int) $b['room_qty'],
            'total' => (float) $b['total_price'],
            'status' => $statusMapOut[$b['booking_status']] ?? strtolower($b['booking_status']),
            'payStatus' => $b['pay_status'], 'slip' => $b['slip_path'], 'payMethod' => $b['pay_method'],
            'createdAt' => substr($b['created_at'], 0, 10), 'note' => $b['guest_note'],
        ];
    }

    $bookingPub = [];
    foreach ($pdo->query('SELECT booking_id, public_id FROM Booking') as $r) {
        $bookingPub[$r['booking_id']] = $r['public_id'];
    }

    foreach ($pdo->query('SELECT * FROM Review') as $v) {
        $out['reviews'][] = [
            'id' => $v['public_id'],
            'bookingId' => $v['booking_id'] !== null ? ($bookingPub[$v['booking_id']] ?? null) : null,
            'propertyId' => $accPub[$v['accommodation_id']] ?? null, 'userId' => $userPub[$v['member_id']] ?? null,
            'rating' => (int) $v['stars'], 'comment' => $v['comment'], 'date' => $v['review_date'],
        ];
    }

    foreach ($pdo->query('SELECT * FROM News') as $n) {
        $out['news'][] = [
            'id' => $n['public_id'], 'type' => $n['category'], 'title' => $n['title'],
            'body' => $n['content'], 'date' => $n['publish_date'], 'active' => (bool) $n['is_active'],
        ];
    }

    foreach ($pdo->query('SELECT setting_key, setting_value FROM Site_Setting') as $r) {
        if (array_key_exists($r['setting_key'], $out['site'])) $out['site'][$r['setting_key']] = $r['setting_value'];
    }

    echo json_encode($out, JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
