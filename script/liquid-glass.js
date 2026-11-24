/* liquid-glass.js — by ruii9326 (Nguyễn Duy Anh)  [bản tối ưu hiệu năng]
   Tạo khúc xạ thật cho .glass / [data-glass] (+ selector riêng qua data-selector
   trên thẻ <script>) bằng SVG feDisplacementMap.
   Tuỳ chỉnh từng phần tử:
     data-refraction="120"  độ khúc xạ (px, mặc định 120)
     data-bezel="40"        độ dày vùng mép bị bẻ cong (px)
     data-dispersion="0.06" tán sắc màu (mặc định 0 = tắt cho nhẹ máy)
   Chỉ chạy trên Chromium (Chrome, Edge, Samsung, ColorOS...).
   Safari/Firefox dùng CSS dự phòng sẵn có của trang.
   Tối ưu: phần tử cùng kích thước dùng chung 1 filter, bản đồ độ phân giải thấp,
   chỉ bật khúc xạ cho phần tử gần màn hình, không quét lại DOM vô ích. */
(() => {
  const ua = navigator.userAgent;
  if (!/Chrome\//.test(ua) || /CriOS|FxiOS|EdgiOS/.test(ua)) return;

  const NS = 'http://www.w3.org/2000/svg';
  const extra = document.currentScript && document.currentScript.dataset.selector;
  const SEL = '.glass, [data-glass]' + (extra ? ', ' + extra : '');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;pointer-events:none';
  const defs = document.createElementNS(NS, 'defs');
  svg.appendChild(defs);

  const cache = new Map();   // khoá kích thước → { id, node }
  const active = new Set();  // phần tử đang bật khúc xạ
  let uid = 0;

  // Bản đồ dịch chuyển: mép kéo vào trong, tâm giữ nguyên. Độ phân giải thấp là đủ (mịn).
  function makeMap(w, h, r, bezel) {
    const k = Math.min(1, Math.sqrt(28000 / (w * h)));
    const cw = Math.max(2, Math.round(w * k)), ch = Math.max(2, Math.round(h * k));
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    const img = g.createImageData(cw, ch), d = img.data;
    const hx = w / 2, hy = h / 2;
    r = Math.min(r, hx, hy);
    for (let j = 0; j < ch; j++) {
      for (let i = 0; i < cw; i++) {
        const px = (i + .5) / k - hx, py = (j + .5) / k - hy;
        const qx = Math.abs(px) - (hx - r), qy = Math.abs(py) - (hy - r);
        const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
        const len = Math.hypot(ox, oy);
        const depth = -(len + Math.min(Math.max(qx, qy), 0) - r);
        let nx = 0, ny = 0;
        if (len > 0) { nx = ox / len * Math.sign(px); ny = oy / len * Math.sign(py); }
        else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
        let m = 0;
        if (depth < bezel) m = Math.pow(1 - Math.max(depth, 0) / bezel, 1.5);
        const o = (j * cw + i) * 4;
        d[o] = 128 - nx * m * 127;
        d[o + 1] = 128 - ny * m * 127;
        d[o + 2] = 128; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  const dm = (s, id) =>
    `<feDisplacementMap in="SourceGraphic" in2="m" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="${id}"/>`;
  const only = (inp, vals, id) =>
    `<feColorMatrix in="${inp}" type="matrix" values="${vals}" result="${id}"/>`;

  // Phần tử cùng kích thước/thông số → dùng chung một filter.
  function filterFor(w, h, rad, bezel, S, disp) {
    const key = [w, h, Math.round(rad), Math.round(bezel), Math.round(S), disp].join('|');
    const hit = cache.get(key);
    if (hit) return hit.id;
    if (cache.size > 60) prune();
    const f = document.createElementNS(NS, 'filter');
    const id = 'lg' + (uid++);
    f.id = id;
    f.setAttribute('filterUnits', 'userSpaceOnUse');
    f.setAttribute('color-interpolation-filters', 'sRGB');
    f.setAttribute('x', 0); f.setAttribute('y', 0);
    f.setAttribute('width', w); f.setAttribute('height', h);
    f.innerHTML =
      `<feImage href="${makeMap(w, h, rad, bezel)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/>` +
      (disp > 0
        ? dm(S * (1 + disp), 'r0') + dm(S, 'g0') + dm(S * (1 - disp), 'b0') +
          only('r0', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', 'r') +
          only('g0', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', 'g') +
          only('b0', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', 'b') +
          `<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/>`
        : dm(S, 'out'));
    defs.appendChild(f);
    cache.set(key, { id, node: f });
    return id;
  }

  function prune() { // xoá filter không còn phần tử nào dùng
    const used = new Set([...active].map((e) => e._lg));
    cache.forEach((v, k) => { if (!used.has(v.id)) { v.node.remove(); cache.delete(k); } });
  }

  function apply(el) {
    const w = el.offsetWidth, h = el.offsetHeight; // không bị ảnh hưởng bởi animation scale
    if (w < 8 || h < 8) return;
    const S = Math.min(parseFloat(el.dataset.refraction) || 120, Math.min(w, h) * 0.9);
    const disp = el.dataset.dispersion !== undefined ? parseFloat(el.dataset.dispersion) || 0 : 0;
    const bezel = Math.min(parseFloat(el.dataset.bezel) || Math.min(w, h) * 0.42, Math.min(w, h) / 2);
    const rs = getComputedStyle(el).borderTopLeftRadius;
    const rad = rs.includes('%') ? parseFloat(rs) / 100 * Math.min(w, h) : (parseFloat(rs) || 0);
    const id = filterFor(w, h, rad, bezel, S, disp);
    if (el._lg === id) return;
    el._lg = id;
    const v = `url(#${id}) blur(var(--lg-blur,0.8px)) saturate(var(--lg-saturate,1.7)) brightness(var(--lg-bright,1.06))`;
    el.style.setProperty('-webkit-backdrop-filter', v);
    el.style.setProperty('backdrop-filter', v);
  }

  function release(el) { // ra xa màn hình → trả về CSS gốc của trang
    el._lg = null;
    el.style.removeProperty('-webkit-backdrop-filter');
    el.style.removeProperty('backdrop-filter');
  }

  const timers = new WeakMap();
  const ro = new ResizeObserver((es) => es.forEach((e) => {
    const el = e.target;
    if (!el._lg) return apply(el);            // lần đầu: áp dụng ngay
    clearTimeout(timers.get(el));             // đổi kích thước: gom lại, tránh tính liên tục
    timers.set(el, setTimeout(() => apply(el), 120));
  }));

  const io = new IntersectionObserver((es) => es.forEach((e) => {
    const el = e.target;
    if (e.isIntersecting) {
      if (!active.has(el)) { active.add(el); ro.observe(el); }
    } else if (active.has(el)) {
      active.delete(el); ro.unobserve(el); release(el);
    }
  }), { rootMargin: '400px' });

  const seen = new WeakSet();
  function scan() {
    document.querySelectorAll(SEL).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el); io.observe(el);
    });
  }

  function start() {
    document.body.appendChild(svg);
    scan();
    let q = 0;
    // chỉ quét lại khi có phần tử kính mới (bỏ qua tia lửa, gợn sóng... do site.js tạo)
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL))) {
          cancelAnimationFrame(q); q = requestAnimationFrame(scan); return;
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', start) : start();
})();
