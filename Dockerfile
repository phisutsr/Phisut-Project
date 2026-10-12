# Dockerfile สำหรับ Railway: ให้รันเว็บนี้ด้วย PHP (ไม่ใช่เสิร์ฟเป็นไฟล์ static)
# วางไฟล์นี้ในโฟลเดอร์เดียวกับ index.html และโฟลเดอร์ api/
FROM php:8.2-cli

# ติดตั้งตัวเชื่อมต่อ MySQL ให้ PHP (config.php ใช้ PDO + pdo_mysql)
RUN docker-php-ext-install pdo pdo_mysql

WORKDIR /app
COPY . /app

# ให้เซิร์ฟเวอร์ PHP รองรับหลายคำขอพร้อมกัน
ENV PHP_CLI_SERVER_WORKERS=4

# Railway กำหนดพอร์ตผ่านตัวแปร PORT
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-8080} -t /app"]
