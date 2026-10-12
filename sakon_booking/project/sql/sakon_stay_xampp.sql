-- =========================================================================
--  ระบบจองที่พักสกลนคร (ครามสเตย์ สกลนคร) — เวอร์ชันสำหรับเชื่อมกับเว็บผ่าน XAMPP
--  ฐานข้อมูลเดิม 8 ตาราง (User / Admin / Property_Owner / Accommodation /
--  Room / Booking / News / Review) + คอลัมน์เสริมที่จำเป็นสำหรับ api/*.php
--
--  คอลัมน์ที่เพิ่มจาก sql/sakon_stay.sql เดิม (ทำเครื่องหมาย "เสริม-xampp")
--   - `public_id`  ทุกตาราง : รหัสที่ฝั่งเว็บ (js/app.js) ใช้อ้างอิงแถวนั้น ๆ
--                  เพราะหน้าเว็บสร้างไอดีเองตอนเพิ่มข้อมูลใหม่ (เช่น "B-a1b2c3")
--                  ฝั่ง PHP จึงต้องมีคอลัมน์นี้ไว้จับคู่กับ primary key ตัวเลขภายใน
--   - `Accommodation.amenities`, `Accommodation.photos`  : เก็บเป็น JSON (TEXT)
--   - `Room.amenities`, `Room.photos`                    : เก็บเป็น JSON (TEXT)
--
--  Engine : MySQL 8 / MariaDB 10.4+ (ตามที่มากับ XAMPP)   Charset : utf8mb4
--  วิธีนำเข้า : เปิด phpMyAdmin ของ XAMPP > แท็บ Import > เลือกไฟล์นี้ > Go
--            หรือ   mysql -u root -p < sakon_stay_xampp.sql
-- =========================================================================

DROP DATABASE IF EXISTS sakon_booking;
CREATE DATABASE sakon_booking
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sakon_booking;

CREATE TABLE User (
    member_id     INT(6)        PRIMARY KEY AUTO_INCREMENT,
    first_name    VARCHAR(50)   NOT NULL,
    last_name     VARCHAR(50)   NOT NULL,
    phone_number  VARCHAR(10),
    password      VARCHAR(20)   NOT NULL,
    payment       DECIMAL(10,2),
    username      VARCHAR(50)   NOT NULL UNIQUE,
    email         VARCHAR(120)  UNIQUE,
    address       VARCHAR(255),
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    public_id     VARCHAR(30)   NOT NULL UNIQUE          -- เสริม-xampp
) ENGINE=InnoDB;

CREATE TABLE Admin (
    admin_email   VARCHAR(50)   PRIMARY KEY,
    first_name    VARCHAR(50)   NOT NULL,
    last_name     VARCHAR(50)   NOT NULL,
    password      VARCHAR(20)   NOT NULL,
    phone_number  VARCHAR(10),
    username      VARCHAR(50)   NOT NULL UNIQUE,
    public_id     VARCHAR(30)   NOT NULL UNIQUE          -- เสริม-xampp
) ENGINE=InnoDB;

CREATE TABLE Property_Owner (
    owner_id      INT(6)        PRIMARY KEY AUTO_INCREMENT,
    owner_email   VARCHAR(50)   NOT NULL UNIQUE,
    contact_info  VARCHAR(255),
    owner_name    VARCHAR(50)   NOT NULL,
    username      VARCHAR(50)   NOT NULL UNIQUE,
    password      VARCHAR(20)   NOT NULL,
    public_id     VARCHAR(30)   NOT NULL UNIQUE          -- เสริม-xampp
) ENGINE=InnoDB;

CREATE TABLE Accommodation (
    accommodation_id    INT(3)        PRIMARY KEY AUTO_INCREMENT,
    owner_id            INT(6)        NOT NULL,
    accommodation_name  VARCHAR(100)  NOT NULL,
    address             TEXT,
    price               DECIMAL(10,2),
    description         TEXT,
    type                ENUM('โรงแรม','อพาร์ทเม้น','หอพัก','รีสอร์ท') NOT NULL,
    district            VARCHAR(60)   NOT NULL DEFAULT 'เมืองสกลนคร',
    phone_number        VARCHAR(20),
    review_status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    review_note         TEXT,
    amenities           TEXT,                             -- เสริม-xampp : JSON array
    photos              MEDIUMTEXT,                       -- เสริม-xampp : JSON array (data URI)
    promptpay_id        VARCHAR(20),                      -- เสริม : เลขพร้อมเพย์สำหรับสร้าง QR รับเงินจริง
    rating_avg          DECIMAL(3,2)  NOT NULL DEFAULT 0, -- เสริม : ดาวเฉลี่ย 0–5
    review_count        INT           NOT NULL DEFAULT 0, -- เสริม : จำนวนรีวิว
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    public_id           VARCHAR(30)   NOT NULL UNIQUE,    -- เสริม-xampp
    FOREIGN KEY (owner_id) REFERENCES Property_Owner(owner_id) ON DELETE CASCADE,
    CONSTRAINT chk_acc_district CHECK (district = 'เมืองสกลนคร'),
    INDEX idx_acc_type (type),
    INDEX idx_acc_status (review_status)
) ENGINE=InnoDB;

CREATE TABLE Room (
    room_id             INT(6)        PRIMARY KEY AUTO_INCREMENT,
    accommodation_id    INT(3)        NOT NULL,
    accommodation_name  VARCHAR(100),
    type                VARCHAR(120)  NOT NULL,
    price               DECIMAL(10,2) NOT NULL,
    capacity            INT(6)        NOT NULL DEFAULT 2,
    room_count          INT           NOT NULL DEFAULT 1,
    bed_detail          VARCHAR(120),
    room_size           INT,
    status              ENUM('available','unavailable','maintenance') NOT NULL DEFAULT 'available',
    amenities           TEXT,                             -- เสริม-xampp : JSON array
    photos              MEDIUMTEXT,                       -- เสริม-xampp : JSON array (data URI)
    room_available      INT           NOT NULL DEFAULT 0, -- เสริม : ห้องคงเหลือ (หักเมื่อชำระเงินแล้ว)
    public_id           VARCHAR(30)   NOT NULL UNIQUE,    -- เสริม-xampp
    FOREIGN KEY (accommodation_id) REFERENCES Accommodation(accommodation_id) ON DELETE CASCADE,
    CHECK (price >= 0 AND room_count >= 0)
) ENGINE=InnoDB;

CREATE TABLE Booking (
    booking_id          INT(6)        PRIMARY KEY AUTO_INCREMENT,
    booking_code        VARCHAR(20)   NOT NULL UNIQUE,
    user_id             INT(6)        NOT NULL,
    accommodation_id    INT(3)        NOT NULL,
    room_id             INT(6)        NOT NULL,
    booking_status      ENUM('Pending','Confirmed','CheckedIn','Completed','Cancelled')
                        NOT NULL DEFAULT 'Pending',
    check_in_date       DATE          NOT NULL,
    check_out_date      DATE          NOT NULL,
    room_qty            INT           NOT NULL DEFAULT 1,
    total_price         DECIMAL(10,2),
    accommodation_name  VARCHAR(100),
    pay_method          ENUM('QR code') NOT NULL DEFAULT 'QR code',
    pay_status          ENUM('unpaid','waiting','paid','rejected') NOT NULL DEFAULT 'unpaid',
    slip_path           MEDIUMTEXT,
    guest_note          TEXT,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    public_id           VARCHAR(30)   NOT NULL UNIQUE,    -- เสริม-xampp
    FOREIGN KEY (user_id)          REFERENCES User(member_id),
    FOREIGN KEY (accommodation_id) REFERENCES Accommodation(accommodation_id),
    FOREIGN KEY (room_id)          REFERENCES Room(room_id),
    CHECK (check_out_date > check_in_date)
) ENGINE=InnoDB;

CREATE TABLE News (
    news_id       INT(6)        PRIMARY KEY AUTO_INCREMENT,
    title         VARCHAR(200)  NOT NULL,
    content       TEXT,
    category      ENUM('ข่าวสาร','โปรโมชั่น','ประกาศ') NOT NULL DEFAULT 'ข่าวสาร',
    publish_date  DATE          NOT NULL DEFAULT (CURRENT_DATE),
    is_active     TINYINT(1)    NOT NULL DEFAULT 1,
    public_id     VARCHAR(30)   NOT NULL UNIQUE           -- เสริม-xampp
) ENGINE=InnoDB;

CREATE TABLE Site_Setting (
    setting_key   VARCHAR(40) PRIMARY KEY,   -- เสริม : ข้อมูลหน้าเว็บไซต์ที่แอดมินแก้ไข
    setting_value TEXT
) ENGINE=InnoDB;

CREATE TABLE Review (
    review_id         INT(6)    PRIMARY KEY AUTO_INCREMENT,
    member_id         INT(6)    NOT NULL,
    accommodation_id  INT(3)    NOT NULL,
    booking_id        INT(6)    UNIQUE,
    stars             TINYINT   CHECK (stars BETWEEN 1 AND 5),
    comment           TEXT,
    review_date       DATE      NOT NULL DEFAULT (CURRENT_DATE),
    public_id         VARCHAR(30) NOT NULL UNIQUE,        -- เสริม-xampp
    FOREIGN KEY (member_id)        REFERENCES User(member_id),
    FOREIGN KEY (accommodation_id) REFERENCES Accommodation(accommodation_id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id)       REFERENCES Booking(booking_id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- =========================================================================
--  ข้อมูลตัวอย่าง (ต้องตรงกับ public_id ที่ api/get_data.php อ่านออกไปแสดง)
-- =========================================================================

INSERT INTO Admin (admin_email, first_name, last_name, password, phone_number, username, public_id) VALUES
('admin@sakonstay.th', 'ผู้ดูแล', 'ระบบ', '1234', '042711000', 'admin', 'ADM1');

INSERT INTO Property_Owner (owner_id, owner_email, contact_info, owner_name, username, password, public_id) VALUES
(1, 'owner@sakonstay.th',  '081-234-5678 · ต.ธาตุเชิงชุม อ.เมืองสกลนคร', 'สมหญิง ครามงาม', 'owner',  '1234', 'OWN1'),
(2, 'owner2@sakonstay.th', '089-876-5432 · ต.ธาตุนาเวง อ.เมืองสกลนคร',  'ประยูร เมืองสกล', 'owner2', '1234', 'OWN2');

INSERT INTO User (member_id, first_name, last_name, phone_number, password, payment, username, email, address, public_id) VALUES
(1, 'กมล', 'ใจดี', '0825551212', '1234', 0.00, 'user', 'user@mail.th', 'ต.ธาตุเชิงชุม อ.เมืองสกลนคร', 'USR1');

INSERT INTO Accommodation
  (accommodation_id, owner_id, accommodation_name, address, price, description, type, district, phone_number, review_status, amenities, photos, public_id) VALUES
(1, 1, 'หนองหาร เลควิว โฮเทล',
    '188 ถ.สุขเกษม ต.ธาตุเชิงชุม อ.เมืองสกลนคร จ.สกลนคร 47000', 690.00,
    'โรงแรมริมหนองหาร เดิน 5 นาทีถึงวัดพระธาตุเชิงชุม ห้องพักมองเห็นวิวทะเลสาบ',
    'โรงแรม', 'เมืองสกลนคร', '081-234-5678', 'approved',
    '["แอร์","Wi-Fi ฟรี","ที่จอดรถ","อาหารเช้า","ลิฟต์","กล้องวงจรปิด"]', '[]', 'P1'),
(2, 2, 'สวนคราม รีสอร์ท สกลนคร',
    '99 หมู่ 4 ต.ฮางโฮง อ.เมืองสกลนคร จ.สกลนคร 47000', 1500.00,
    'รีสอร์ทบ้านพักหลังเดี่ยวในสวน ห่างจากตัวเมือง 6 กิโลเมตร เหมาะกับครอบครัว',
    'รีสอร์ท', 'เมืองสกลนคร', '089-876-5432', 'approved',
    '["แอร์","Wi-Fi ฟรี","ที่จอดรถ","ตู้เย็น","ครัวส่วนตัว","เครื่องทำน้ำอุ่น"]', '[]', 'P2'),
(3, 1, 'หอพักเรือนคราม',
    '12 ซ.ผ้าคราม ถ.รัฐพัฒนา ต.ธาตุเชิงชุม อ.เมืองสกลนคร จ.สกลนคร 47000', 450.00,
    'หอพักเรือนไม้สองชั้น ใกล้มหาวิทยาลัยและถนนคนเดิน รับทั้งรายวันและรายเดือน',
    'หอพัก', 'เมืองสกลนคร', '081-234-5678', 'approved',
    '["แอร์","Wi-Fi ฟรี","ทีวี","ซักรีด","ที่จอดรถ"]', '[]', 'P3'),
(4, 2, 'สกลเพลส อพาร์ทเม้น',
    '55/2 ถ.นิตโย ต.ธาตุนาเวง อ.เมืองสกลนคร จ.สกลนคร 47000', 590.00,
    'อพาร์ทเม้นห้องสตูดิโอ รายวัน-รายเดือน ใกล้ตลาดและโรงพยาบาลศูนย์สกลนคร',
    'อพาร์ทเม้น', 'เมืองสกลนคร', '089-876-5432', 'approved',
    '["แอร์","Wi-Fi ฟรี","ที่จอดรถ"]', '[]', 'P4'),
(5, 2, 'พระธาตุ แกรนด์ โฮเทล',
    '7 ถ.เรืองสวัสดิ์ ต.ธาตุเชิงชุม อ.เมืองสกลนคร จ.สกลนคร 47000', 980.00,
    'โรงแรมกลางเมืองใกล้พระธาตุเชิงชุม มีห้องประชุมและที่จอดรถในอาคาร',
    'โรงแรม', 'เมืองสกลนคร', '042-712-345', 'pending',
    '["แอร์","Wi-Fi ฟรี","ที่จอดรถ","ทีวี"]', '[]', 'P5');

INSERT INTO Room
  (room_id, accommodation_id, accommodation_name, type, price, capacity, room_count, bed_detail, room_size, status, amenities, photos, public_id) VALUES
(1, 1, 'หนองหาร เลควิว โฮเทล', 'ห้องเตียงเดี่ยว วิวเมือง',   690.00, 2,  8, 'เตียงเดี่ยว 1 เตียง', 24, 'available', '["แอร์","Wi-Fi ฟรี","ทีวี"]', '[]', 'R1'),
(2, 1, 'หนองหาร เลควิว โฮเทล', 'ห้องเตียงคู่ วิวหนองหาร',   1290.00, 3,  5, 'เตียงคู่ 2 เตียง',    32, 'available', '["แอร์","Wi-Fi ฟรี","ทีวี"]', '[]', 'R2'),
(3, 2, 'สวนคราม รีสอร์ท สกลนคร', 'บ้านพักหลังเล็ก 2 ท่าน',  1500.00, 2,  4, 'เตียงใหญ่ 1 เตียง',  36, 'available', '["แอร์","ตู้เย็น"]', '[]', 'R3'),
(4, 2, 'สวนคราม รีสอร์ท สกลนคร', 'บ้านพักครอบครัว 6 ท่าน',  3200.00, 6,  2, 'เตียงใหญ่ 2 + เดี่ยว 2', 68, 'maintenance', '["แอร์","ตู้เย็น","ครัวส่วนตัว"]', '[]', 'R4'),
(5, 3, 'หอพักเรือนคราม',        'ห้องพัดลม ชั้นบน',          450.00, 2,  6, 'เตียงเดี่ยว 2 เตียง', 18, 'available', '["ทีวี"]', '[]', 'R5'),
(6, 3, 'หอพักเรือนคราม',        'ห้องแอร์ เรือนคราม',        790.00, 2,  4, 'เตียงใหญ่ 1 เตียง',  26, 'unavailable', '["แอร์","ทีวี"]', '[]', 'R6'),
(7, 4, 'สกลเพลส อพาร์ทเม้น',    'สตูดิโอรายวัน',             590.00, 2, 10, 'เตียงใหญ่ 1 เตียง',  28, 'available', '["แอร์","Wi-Fi ฟรี"]', '[]', 'R7'),
(8, 4, 'สกลเพลส อพาร์ทเม้น',    'สตูดิโอ ระเบียงกว้าง',      850.00, 2,  6, 'เตียงใหญ่ 1 เตียง',  34, 'available', '["แอร์","Wi-Fi ฟรี"]', '[]', 'R8'),
(9, 5, 'พระธาตุ แกรนด์ โฮเทล',  'ห้องมาตรฐาน เตียงคู่',      980.00, 2, 12, 'เตียงเดี่ยว 2 เตียง', 27, 'available', '["แอร์","Wi-Fi ฟรี","ทีวี"]', '[]', 'R9');

INSERT INTO Booking
  (booking_id, booking_code, user_id, accommodation_id, room_id, booking_status,
   check_in_date, check_out_date, room_qty, total_price, accommodation_name, pay_method, pay_status, public_id) VALUES
(1, 'SKN-240118', 1, 1, 2, 'Completed', '2026-09-02', '2026-09-04', 1, 2580.00, 'หนองหาร เลควิว โฮเทล', 'QR code', 'paid', 'B1'),
(2, 'SKN-240402', 1, 2, 3, 'Pending',   '2026-09-22', '2026-09-24', 1, 3000.00, 'สวนคราม รีสอร์ท สกลนคร', 'QR code', 'waiting', 'B2');

INSERT INTO Review (member_id, accommodation_id, booking_id, stars, comment, review_date, public_id) VALUES
(1, 1, 1, 5, 'วิวหนองหารสวยมาก ห้องสะอาด เจ้าของใจดี เดินไปพระธาตุเชิงชุมได้สบาย', '2026-09-05', 'V1');

INSERT INTO News (title, content, category, publish_date, is_active, public_id) VALUES
('จองล่วงหน้า 7 วัน ลด 10%',
 'สำหรับที่พักทุกประเภทในเขตอำเภอเมืองสกลนคร ใช้ได้กับการจ่ายเต็มจำนวนผ่าน QR code',
 'โปรโมชั่น', '2026-09-16', 1, 'N1'),
('เทศกาลแห่ปราสาทผึ้ง ออกพรรษา',
 'ช่วงออกพรรษามีขบวนแห่ปราสาทผึ้งและแข่งเรือยาวหนองหาร แนะนำให้จองที่พักล่วงหน้าอย่างน้อย 3 สัปดาห์',
 'ข่าวสาร', '2026-09-13', 1, 'N2'),
('ระบบรับเฉพาะที่พัก 4 ประเภท ในเขตอำเภอเมืองสกลนคร',
 'ระบบเปิดรับลงทะเบียนเฉพาะ โรงแรม อพาร์ทเม้น หอพัก และรีสอร์ท ที่ตั้งอยู่ในเขตอำเภอเมืองสกลนครเท่านั้น',
 'ประกาศ', '2026-09-08', 1, 'N3');
