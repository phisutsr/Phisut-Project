<?php
/**
 * api/get_data.php
 * อ่านข้อมูลทั้งหมดจากฐานข้อมูล MySQL (sakon_booking) แล้วประกอบเป็น JSON
 * รูปแบบเดียวกับ data/seed.json เพื่อให้ js/app.js ใช้งานได้โดยแทบไม่ต้องแก้โครงสร้าง
 * เรียกด้วย GET
 */
require __DIR__ . '/config.php';

// ------------------------------------------------------------
// jarr($text) — แปลงข้อความ JSON ในคอลัมน์เป็น array
//   ใช้กับคอลัมน์ amenities และ photos (เก็บเป็น JSON ข้อความ) ถ้าว่างหรือแปลงไม่ได้ คืน array ว่าง
// ------------------------------------------------------------
function jarr($text) {
    if (!$text) return [];
    $d = json_decode($text, true);
    return is_array($d) ? $d : [];
}

// ------------------------------------------------------------
// โครงสร้างข้อมูลที่จะส่งให้ js/app.js (ตัวแปร DB ฝั่งเว็บ)
//   site = ข้อมูลหน้าเว็บ (ค่าเริ่มต้น จะถูกทับด้วยค่าใน Site_Setting ท้ายไฟล์) | districts, types = ค่าคงที่
//   ที่เหลือเป็นอาร์เรย์ว่างที่จะถูกเติมจากตารางต่าง ๆ ด้านล่าง | resets ปล่อยว่างเสมอ (รหัสรีเซ็ตรหัสผ่านไม่ได้เก็บใน DB)
//   ถ้าจะส่งข้อมูลก้อนใหม่ให้หน้าเว็บ: เพิ่มคีย์ที่นี่ แล้วเติมข้อมูลด้านล่าง และต้องเพิ่มใน save_data.php ถ้าต้องการให้บันทึกกลับ
// ------------------------------------------------------------
$out = [
    'site' => [
        'name'      => 'ครามสเตย์ สกลนคร',
        'heroTitle' => 'ที่พักในเขตอำเภอเมืองสกลนคร จองจบในที่เดียว',
        'phone'     => '042-711-000',
        'email'     => 'contact@sakonstay.th',
        'about'     => 'ระบบกลางสำหรับรวบรวมที่พักในเขตอำเภอเมืองสกลนคร เชื่อมเจ้าของที่พักกับผู้เข้าพักโดยตรง รับเฉพาะที่พัก 4 ประเภท ได้แก่ โรงแรม อพาร์ทเม้น หอพัก และรีสอร์ท',
    ],
    'districts' => ['เมืองสกลนคร'],
    'types'     => ['โรงแรม', 'อพาร์ทเม้น', 'บ้าน'],
    'users'     => [],
    'properties'=> [],
    'rooms'     => [],
    'bookings'  => [],
    'reviews'   => [],
    'news'      => [],
    'resets'    => [],
];

// ------------------------------------------------------------
// ดึงข้อมูลทีละตาราง แล้วแปลงเป็นรูปแบบที่หน้าเว็บใช้
//   หลักการ: id ตัวเลขใน MySQL (AUTO_INCREMENT) ไม่ส่งออกไป แต่ส่ง public_id แทน และแปลงคีย์นอกด้วยแผนที่ $ownerPub/$accPub/$userPub/$roomPub/$bookingPub
// ------------------------------------------------------------
try {
    // ------------------------------------------------------------
    // ผู้ใช้ 3 ตาราง -> รวมเป็น users เดียว ใส่ role กำกับ
    //   Admin -> role 'admin' | Property_Owner -> 'owner' | User -> 'guest' (ชื่อ = first_name + last_name)
    //   *** password ถูกส่งไปในรูปข้อความธรรมดา ผู้ใช้ที่เปิด DevTools จะเห็น ***
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // แผนที่ owner_id (ตัวเลข) -> public_id ใช้เติม ownerId ให้ที่พัก
    // ------------------------------------------------------------
    $ownerPub = [];
    foreach ($pdo->query('SELECT owner_id, public_id FROM Property_Owner') as $r) {
        $ownerPub[$r['owner_id']] = $r['public_id'];
    }

    // ------------------------------------------------------------
    // ที่พัก (Accommodation -> properties)
    //   ฟิลด์ที่เปลี่ยนชื่อ: accommodation_name->name, review_status->status, review_note->note, promptpay_id->promptpay, rating_avg->ratingAvg
    //   amenities/photos ถูกแปลงจาก JSON ข้อความเป็น array
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // แผนที่ accommodation_id -> public_id (ใช้กับห้อง การจอง รีวิว)
    // ------------------------------------------------------------
    $accPub = [];
    foreach ($pdo->query('SELECT accommodation_id, public_id FROM Accommodation') as $r) {
        $accPub[$r['accommodation_id']] = $r['public_id'];
    }

    // ------------------------------------------------------------
    // ห้องพัก (Room -> rooms)
    //   type->type, price->price, room_count->qty, room_available->available, bed_detail->beds, room_size->size
    //   หมายเหตุ: หน้าเว็บคำนวณห้องว่างเอง (freeQty) ไม่ได้ใช้ค่า available นี้โดยตรง
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // แผนที่ member_id -> public_id (ผู้จอง) และ room_id -> public_id (ห้อง)
    // ------------------------------------------------------------
    $userPub = [];
    foreach ($pdo->query('SELECT member_id, public_id FROM User') as $r) {
        $userPub[$r['member_id']] = $r['public_id'];
    }
    $roomPub = [];
    foreach ($pdo->query('SELECT room_id, public_id FROM Room') as $r) {
        $roomPub[$r['room_id']] = $r['public_id'];
    }

    // ------------------------------------------------------------
    // แปลงสถานะการจองจากรูปแบบฐานข้อมูล (ตัวใหญ่นำหน้า) เป็นรูปแบบหน้าเว็บ (ตัวพิมพ์เล็ก)
    //   ถ้าเพิ่มสถานะใหม่: ต้องเพิ่มที่นี่ + $statusMapIn ใน save_data.php + ENUM ใน SQL + ST ใน app.js
    // ------------------------------------------------------------
    $statusMapOut = [
        'Pending' => 'pending', 'Confirmed' => 'confirmed', 'CheckedIn' => 'checkedin',
        'Completed' => 'completed', 'Cancelled' => 'cancelled',
    ];

    // ------------------------------------------------------------
    // การจอง (Booking -> bookings)
    //   booking_code->code, check_in_date->checkIn, check_out_date->checkOut, room_qty->qty, total_price->total
    //   pay_status->payStatus, slip_path->slip (รูปสลิป base64), guest_note->note, created_at ตัดเหลือแค่วันที่ (10 ตัวอักษรแรก)
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // แผนที่ booking_id -> public_id (ใช้ผูกรีวิวกับการจอง)
    // ------------------------------------------------------------
    $bookingPub = [];
    foreach ($pdo->query('SELECT booking_id, public_id FROM Booking') as $r) {
        $bookingPub[$r['booking_id']] = $r['public_id'];
    }

    // ------------------------------------------------------------
    // รีวิว (Review -> reviews)
    //   stars->rating, member_id->userId (แปลงเป็น public_id), booking_id อาจเป็น null (รีวิวที่ไม่ผูกกับการจอง)
    // ------------------------------------------------------------
    foreach ($pdo->query('SELECT * FROM Review') as $v) {
        $out['reviews'][] = [
            'id' => $v['public_id'],
            'bookingId' => $v['booking_id'] !== null ? ($bookingPub[$v['booking_id']] ?? null) : null,
            'propertyId' => $accPub[$v['accommodation_id']] ?? null, 'userId' => $userPub[$v['member_id']] ?? null,
            'rating' => (int) $v['stars'], 'comment' => $v['comment'], 'date' => $v['review_date'],
        ];
    }

    // ------------------------------------------------------------
    // ข่าว/โปรโมชั่น/ประกาศ (News -> news)
    //   category->type, content->body, publish_date->date, is_active->active (แปลงเป็น boolean)
    // ------------------------------------------------------------
    foreach ($pdo->query('SELECT * FROM News') as $n) {
        $out['news'][] = [
            'id' => $n['public_id'], 'type' => $n['category'], 'title' => $n['title'],
            'body' => $n['content'], 'date' => $n['publish_date'], 'active' => (bool) $n['is_active'],
        ];
    }

    // ------------------------------------------------------------
    // ค่าหน้าเว็บที่แอดมินแก้ (Site_Setting)
    //   ทับเฉพาะคีย์ที่มีอยู่ใน $out['site'] (name, heroTitle, phone, email, about) คีย์แปลกปลอมจะถูกเมินเพื่อความปลอดภัย
    // ------------------------------------------------------------
    foreach ($pdo->query('SELECT setting_key, setting_value FROM Site_Setting') as $r) {
        // ชื่อเว็บและพาดหัวหน้าแรก ใช้ค่าจาก $out['site'] ด้านบนเสมอ (แก้ในโค้ดแล้วเปลี่ยนทันที ไม่ถูกค่าใน DB ทับ)
        // *** ผลข้างเคียง: ช่อง 'ชื่อเว็บ' และ 'พาดหัวหน้าแรก' ในหน้าแอดมินจะไม่มีผลอีกต่อไป ***
        // ถ้าอยากให้แอดมินแก้ได้อีก ให้ลบบรรทัด continue ด้านล่างนี้
        if (in_array($r['setting_key'], ['name', 'heroTitle'], true)) continue;
        if (array_key_exists($r['setting_key'], $out['site'])) $out['site'][$r['setting_key']] = $r['setting_value'];
    }

    // ------------------------------------------------------------
    // ส่งผลลัพธ์ JSON ให้หน้าเว็บ
    //   JSON_UNESCAPED_UNICODE ให้ภาษาไทยอ่านออกได้ ไม่เป็นรหัส \uXXXX
    // ------------------------------------------------------------
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
// ------------------------------------------------------------
// ถ้าผิดพลาด ตอบ HTTP 500 + {ok:false,error:...}
//   หน้าเว็บ (fetchSeed) จะจับ ok:false แล้วแสดงหน้า 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ'
// ------------------------------------------------------------
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
