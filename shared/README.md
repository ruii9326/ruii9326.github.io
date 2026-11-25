# Cấu trúc trang

- `index.html`, `theworldofninecontinents/index.html` (ở gốc): trang điều hướng nhỏ, đưa người xem sang đúng phiên bản.
- `shared/`: dùng chung cho mọi phiên bản
  - `i18n.js`: chữ + bản dịch VI/EN (sửa chữ ở đây)
  - `tokens.css`: biến màu, chế độ sáng/tối
  - `core.js`: ngôn ngữ, sáng/tối, menu cài đặt, nút Quay lại, cuộn mượt, hiệu ứng nhấn
- `glass/`: bản Chromium (khúc xạ thật bằng bộ lọc SVG)
- `webgl/`: bản Safari / Firefox / iPhone / iPad (đang làm)
