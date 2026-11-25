/* ============================================================
   shared/route.js — chọn phiên bản của trang: glass/ (Chromium, khúc xạ SVG) hay webgl/ (Safari, Firefox, iPhone/iPad).

   Dùng ở 2 nơi:
   - Trang điều hướng ở gốc (data-role="router"): chọn phiên bản rồi location.replace sang đó (nút Back không bị kẹt).
   - Đầu mỗi trang phiên bản (data-role="page" data-version="glass|webgl"): bảo vệ khi ai đó mở thẳng link /glass/... bằng
     trình duyệt không hợp, và nhớ lựa chọn khi người xem bấm "đổi phiên bản".

   Quy tắc: lựa chọn thủ công đã lưu (localStorage 'ruii9326-version') > tự nhận theo NHÂN trình duyệt.
   Nhân Chromium (Chrome, Edge, Brave, Opera, Samsung...) -> glass. Còn lại (Safari, Firefox, mọi trình duyệt trên iPhone/iPad,
   vì đều là WebKit) -> webgl. Trình duyệt không có WebGL -> glass (kính CSS thường, vẫn đọc tốt).
   Đường dẫn con được giữ nguyên: /theworldofninecontinents/#magic -> /webgl/theworldofninecontinents/#magic
   ============================================================ */
(function () {
  var KEY = 'ruii9326-version', STACK = 'ruii9326-nav-stack';
  var me = document.currentScript;
  var role = (me && me.getAttribute('data-role')) || 'router';
  var here = me && me.getAttribute('data-version');
  var ua = navigator.userAgent || '';

  // iPhone / iPad (kể cả iPadOS xin "trang máy tính" -> UA tự xưng là Macintosh nhưng có cảm ứng): luôn WebKit
  function isIOS() { return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); }
  // nhân Chromium: ưu tiên User-Agent Client Hints, dự phòng bằng chuỗi UA. Chrome iOS ("CriOS") không có "Chrome/" nên không lọt vào đây.
  function isChromium() {
    if (isIOS()) return false;
    var d = navigator.userAgentData;
    if (d && d.brands && d.brands.some(function (b) { return /Chromium/i.test(b.brand); })) return true;
    return /\b(?:Chrome|Chromium)\/\d+/.test(ua) && !/\sEdge\/\d/.test(ua);   // Edge cũ (EdgeHTML) không tính
  }
  function hasWebGL() {
    try { var c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); }
    catch (e) { return false; }
  }
  function saved() {
    try { var v = localStorage.getItem(KEY); return v === 'glass' || v === 'webgl' ? v : null; } catch (e) { return null; }
  }
  function auto() { return isChromium() ? 'glass' : (hasWebGL() ? 'webgl' : 'glass'); }

  // /theworldofninecontinents/ , /glass/theworldofninecontinents/ ... -> /<phiên bản>/theworldofninecontinents/ (giữ ?query và #hash)
  function target(v) {
    var p = location.pathname.replace(/^\/(?:glass|webgl)(?=\/|$)/, '').replace(/index\.html$/, '');
    if (p.charAt(0) !== '/') p = '/' + p;
    if (!/\/$/.test(p) && !/\.[a-z0-9]+$/i.test(p)) p += '/';
    return '/' + v + p + location.search + location.hash;
  }

  window.RUII9326_ROUTE = { isIOS: isIOS, isChromium: isChromium, hasWebGL: hasWebGL, saved: saved, auto: auto, target: target };

  // bấm công tắc "đổi phiên bản" (hoặc lựa chọn ở trang điều hướng): nhớ lại, và bỏ ngăn xếp "Quay lại" của phiên bản kia
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-switch-to]');
    if (!a) return;
    try { localStorage.setItem(KEY, a.getAttribute('data-switch-to')); sessionStorage.removeItem(STACK); } catch (err) {}
  });

  if (role === 'router') {
    location.replace(target(saved() || auto()));
    return;
  }
  var s = saved();
  if (s && s !== here) location.replace(target(s));                              // người xem đã chọn bản kia
  else if (!s && here === 'glass' && auto() === 'webgl') location.replace(target('webgl'));   // mở thẳng link glass bằng trình duyệt không hợp
})();
