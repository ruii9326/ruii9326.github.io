/* liquid-glass.js — by ruii9326 (Nguyễn Duy Anh)
   Tạo khúc xạ thật cho .glass / [data-glass] bằng SVG feDisplacementMap.
   Tuỳ chỉnh từng phần tử:
     data-refraction="60"   độ khúc xạ (px, mặc định 120; iOS rõ ~ 100–160)
     data-bezel="40"        độ dày vùng mép bị bẻ cong (px)
     data-dispersion="0.06" tán sắc màu nhẹ (0 = tắt)
   Chỉ chạy trên trình duyệt Chromium (Chrome, Edge, Samsung, ColorOS...).
   Safari/Firefox không hỗ trợ SVG trong backdrop-filter → dùng CSS dự phòng. */
(() => {
  const ua = navigator.userAgent;
  if (!/Chrome\//.test(ua) || /CriOS|FxiOS|EdgiOS/.test(ua)) return;

  const NS = 'http://www.w3.org/2000/svg';
  const SEL = '.glass, [data-glass]';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;pointer-events:none';
  const defs = document.createElementNS(NS, 'defs');
  svg.appendChild(defs);

  let uid = 0;

  // Bản đồ dịch chuyển: mép bị kéo vào trong, tâm giữ nguyên.
  function makeMap(w, h, r, bezel) {
    const k = Math.min(1, Math.sqrt(250000 / (w * h)));
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
        const depth = -(len + Math.min(Math.max(qx, qy), 0) - r); // khoảng cách vào trong từ mép
        let nx = 0, ny = 0;                                        // pháp tuyến hướng ra ngoài
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

  function apply(el) {
    const b = el.getBoundingClientRect();
    const w = Math.round(b.width), h = Math.round(b.height);
    if (w < 8 || h < 8) return;
    const S = Math.min(parseFloat(el.dataset.refraction) || 120, Math.min(w, h) * 0.9);
    const disp = el.dataset.dispersion !== undefined ? parseFloat(el.dataset.dispersion) : 0.08;
    const bezel = Math.min(parseFloat(el.dataset.bezel) || Math.min(w, h) * 0.42, Math.min(w, h) / 2);
    const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;

    let f = el._lg;
    if (!f) {
      f = el._lg = document.createElementNS(NS, 'filter');
      f.id = 'lg' + (uid++);
      f.setAttribute('filterUnits', 'userSpaceOnUse');
      f.setAttribute('color-interpolation-filters', 'sRGB');
      defs.appendChild(f);
    }
    f.setAttribute('x', 0); f.setAttribute('y', 0);
    f.setAttribute('width', w); f.setAttribute('height', h);

    const dm = (s, id) =>
      `<feDisplacementMap in="SourceGraphic" in2="m" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="${id}"/>`;
    const only = (inp, vals, id) =>
      `<feColorMatrix in="${inp}" type="matrix" values="${vals}" result="${id}"/>`;

    f.innerHTML =
      `<feImage href="${makeMap(w, h, rad, bezel)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/>` +
      (disp > 0
        ? dm(S * (1 + disp), 'r0') + dm(S, 'g0') + dm(S * (1 - disp), 'b0') +
          only('r0', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', 'r') +
          only('g0', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', 'g') +
          only('b0', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', 'b') +
          `<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/>`
        : dm(S, 'out'));

    el.style.setProperty('-webkit-backdrop-filter',
      `url(#${f.id}) blur(var(--lg-blur,0.8px)) saturate(var(--lg-saturate,1.7)) brightness(var(--lg-bright,1.06))`);
    el.style.setProperty('backdrop-filter',
      `url(#${f.id}) blur(var(--lg-blur,0.8px)) saturate(var(--lg-saturate,1.7)) brightness(var(--lg-bright,1.06))`);
  }

  const ro = new ResizeObserver((es) => es.forEach((e) => apply(e.target)));
  const seen = new WeakSet();
  function scan() {
    document.querySelectorAll(SEL).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el); ro.observe(el);
    });
  }

  function start() {
    document.body.appendChild(svg);
    scan();
    let q = 0;
    new MutationObserver(() => { cancelAnimationFrame(q); q = requestAnimationFrame(scan); })
      .observe(document.body, { childList: true, subtree: true });
  }
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', start) : start();
})();
