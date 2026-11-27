# Cấu trúc trang

Kính Liquid hoàn toàn bằng CSS + một bộ lọc SVG dùng chung, không còn WebGL, canvas hay script chọn phiên bản.

- `index.html`: Trang Chủ
- `theworldofninecontinents/index.html`: trang The World of Nine Continents
- `style/site.css`: toàn bộ kiểu dáng dùng chung (kính, nền, menu, chuyển động). Phần "CHẾ ĐỘ KÍNH" ở cuối file: chỉnh `--lg-blur` / `--lg-sat` để đổi độ mờ của kính Liquid
- `shared/tokens.css`: biến màu, kính, chuyển động, chế độ sáng/tối
- `shared/i18n.js`: chữ + bản dịch VI/EN (sửa chữ ở đây)
- `shared/core.js`: ngôn ngữ, sáng/tối, công tắc kính, menu cài đặt, nút Quay lại, cuộn mượt, hiệu ứng nhấn

Cách hoạt động của kính:
- Mọi trình duyệt: `backdrop-filter: blur(14px) saturate(160%)` (kính mờ CSS).
- Nhân Chromium + chế độ Liquid: `@supports` bật `backdrop-filter: url(#liquid-glass) blur(10px) saturate(175%)`; bộ lọc `#liquid-glass` nằm ở cuối `<body>` mỗi trang.
- Safari / Firefox: công tắc Liquid / Cổ điển được ẩn vì chỉ có một kiểu kính.
