/* liquid-glass.js — by ruii9326 (Nguyễn Duy Anh)
   1) Khúc xạ thật cho mọi phần tử kính (tự phát hiện phần tử có backdrop-filter,
      cộng thêm .glass / [data-glass] / data-selector).
   2) Nền "bản đồ sao" tĩnh phía sau để kính luôn có thứ để bẻ cong.
   3) Nút Liquid / Cổ điển trong menu (#glassSwitcher), nhớ lựa chọn bằng localStorage.
   Thuộc tính trên thẻ <script>:
     data-selector="..."             thêm selector kính ngoài phần tự phát hiện
     data-dispersion-selector="..."  các phần tử có tán sắc màu nhẹ (mặc định tắt cho nhẹ máy)
     data-ambient="off"              không tạo nền bản đồ sao
   Thuộc tính trên phần tử: data-refraction (px, mặc định 120), data-bezel, data-dispersion.
   Khúc xạ chỉ chạy trên Chromium; Safari/Firefox vẫn có nền + nút chuyển, dùng CSS kính sẵn có. */
(() => {
  const root = document.documentElement;
  const ds = (document.currentScript && document.currentScript.dataset) || {};
  const KEY = 'rui9326-glass';
  const ua = navigator.userAgent;
  const chromium = /Chrome\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);

  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  };
  if (!root.getAttribute('data-glass-mode'))
    root.setAttribute('data-glass-mode', store.get() === 'classic' ? 'classic' : 'liquid');
  const isLiquid = () => root.getAttribute('data-glass-mode') !== 'classic';

  /* ---------- CSS: nền bản đồ sao + giảm mờ cho trình duyệt không có khúc xạ ---------- */
  const css = document.createElement('style');
  css.textContent = `
.lg-ambient{position:fixed;inset:0;z-index:-1;pointer-events:none;
  --lg-star:color-mix(in srgb,var(--color-ink,#999) 42%,transparent);
  --lg-line:color-mix(in srgb,var(--color-ink,#999) 6%,transparent);
  --lg-glow:var(--color-accent,#c8963e);
  background:
    radial-gradient(42vmax 42vmax at 12% 14%,color-mix(in srgb,var(--lg-glow) 22%,transparent),transparent 70%),
    radial-gradient(38vmax 38vmax at 88% 58%,color-mix(in srgb,var(--lg-glow) 16%,transparent),transparent 70%),
    radial-gradient(30vmax 30vmax at 30% 96%,color-mix(in srgb,var(--lg-glow) 12%,transparent),transparent 70%),
    radial-gradient(circle at 23px 41px,var(--lg-star) 1px,transparent 1.7px) 0 0/151px 163px,
    radial-gradient(circle at 87px 109px,var(--lg-star) 1.3px,transparent 2px) 0 0/233px 197px,
    radial-gradient(circle at 51px 17px,var(--lg-star) .8px,transparent 1.5px) 0 0/89px 107px,
    linear-gradient(var(--lg-line) 1px,transparent 1px) 0 0/72px 72px,
    linear-gradient(90deg,var(--lg-line) 1px,transparent 1px) 0 0/72px 72px}
.lg-ambient{transition:opacity .6s ease,visibility 0s}
html[data-glass-mode="classic"] .lg-ambient{opacity:0;visibility:hidden;transition:opacity .6s ease,visibility 0s .6s}
html.lg-vt .lg-ambient{transition:none}
html.lg-vt::view-transition-old(root),html.lg-vt::view-transition-new(root){animation:none;mix-blend-mode:normal}
html.lg-vt::view-transition-old(root){z-index:1}
html.lg-vt::view-transition-new(root){z-index:2}
#glassSwitcher{position:relative}
#glassSwitcher .theme-btn{position:relative;z-index:1;transition:color .35s ease !important}
#glassSwitcher .theme-btn.active{background:none !important;box-shadow:none !important;border-color:transparent !important;-webkit-backdrop-filter:none !important;backdrop-filter:none !important}
#glassSwitcher .lg-thumb{position:absolute;top:0;left:0;z-index:0;pointer-events:none;box-sizing:border-box;will-change:transform}
html[data-glass-mode="liquid"][data-theme]{--glass-blur:3px;--glass-blur-sm:3px;--glass-blur-md:4px;--glass-blur-lg:5px}`;
  document.head.appendChild(css);

  function ui() {
    if (ds.ambient !== 'off' && !document.querySelector('.lg-ambient')) {
      const a = document.createElement('div');
      a.className = 'lg-ambient'; a.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(a, document.body.firstChild);
    }
    const sw = document.getElementById('glassSwitcher');
    if (!sw) return;
    // thanh trượt: ô nền của nút đang chọn trượt qua lại giữa hai nút, nảy nhẹ như giọt kính
    const thumb = document.createElement('span');
    thumb.className = 'lg-thumb'; thumb.setAttribute('aria-hidden', 'true');
    sw.insertBefore(thumb, sw.firstChild);
    const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    function place(animate) {
      const b = sw.querySelector('[data-glass-choice].active');
      if (!b || !b.offsetWidth) return;
      animate = animate && !calm();
      const ease = 'cubic-bezier(.34,1.45,.64,1)';
      thumb.style.transition = animate ? `transform .55s ${ease},width .55s ${ease},height .55s ease` : 'none';
      thumb.style.width = b.offsetWidth + 'px'; thumb.style.height = b.offsetHeight + 'px';
      thumb.style.transform = `translate(${b.offsetLeft}px,${b.offsetTop}px)`;
      if (animate) thumb.animate([{ scale: '1 1' }, { scale: '1.22 .86', offset: .4 }, { scale: '1 1' }],
        { duration: 550, easing: 'ease-out' });
    }
    // lấy đúng màu/viền/bóng của nút "đang chọn" bên nhóm Sáng/Tối để ô trượt giống hệt
    function skin() {
      const ref = document.querySelector('#themeSwitcher .theme-btn.active') ||
        document.querySelector('.theme-btn.active:not([data-glass-choice])');
      const t = thumb.style;
      if (!ref) { t.background = 'var(--color-accent,#c8963e)'; t.borderRadius = '999px'; return; }
      const c = getComputedStyle(ref);
      t.backgroundColor = c.backgroundColor; t.backgroundImage = c.backgroundImage;
      t.boxShadow = c.boxShadow; t.borderRadius = c.borderTopLeftRadius;
      t.borderStyle = c.borderTopStyle; t.borderWidth = c.borderTopWidth; t.borderColor = c.borderTopColor;
    }
    const sync = (animate) => {
      sw.querySelectorAll('[data-glass-choice]').forEach((b) => {
        const on = b.getAttribute('data-glass-choice') === root.getAttribute('data-glass-mode');
        b.classList.toggle('active', on); b.setAttribute('aria-pressed', on);
      });
      place(animate === true);
    };
    function setMode(mode, btn) {
      if (mode === root.getAttribute('data-glass-mode')) return;
      const change = () => {
        root.setAttribute('data-glass-mode', mode);
        store.set(mode); sync(true);
        if (engine) engine.refresh();
      };
      // nút nảy nhẹ khi bấm
      btn.animate([{ transform: 'scale(.88)' }, { transform: 'scale(1.07)', offset: .55 }, { transform: 'scale(1)' }],
        { duration: 450, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return change();
      // hiệu ứng: trạng thái mới loang ra như giọt nước từ chính nút vừa bấm
      const r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      root.classList.add('lg-vt');
      const vt = document.startViewTransition(change);
      vt.ready.then(() => root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
        { duration: 750, easing: 'cubic-bezier(.22,1,.36,1)', pseudoElement: '::view-transition-new(root)' }
      )).catch(() => {});
      vt.finished.finally(() => root.classList.remove('lg-vt'));
    }
    // pha capture: chặn mọi trình xử lý nút giao diện sáng/tối có sẵn của site
    sw.addEventListener('click', (e) => {
      const b = e.target.closest('[data-glass-choice]');
      if (!b) return;
      e.stopPropagation();
      setMode(b.getAttribute('data-glass-choice'), b);
    }, true);
    // site.js có thể tô lại class .active của .theme-btn khi đổi sáng/tối hoặc ngôn ngữ
    new MutationObserver(() => {
      sync(false); skin();
      setTimeout(() => { skin(); place(false); }, 450); // chờ site chạy xong hiệu ứng đổi màu
    }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'lang'] });
    // menu vừa mở / đổi ngôn ngữ làm nút đổi kích thước → đặt lại ô trượt, không hoạt ảnh
    const ro = new ResizeObserver(() => { skin(); place(false); });
    ro.observe(sw); sw.querySelectorAll('[data-glass-choice]').forEach((b) => ro.observe(b));
    sync(false); skin();
  }

  /* ---------- Engine khúc xạ (Chromium) ---------- */
  let engine = null;
  function makeEngine() {
    const NS = 'http://www.w3.org/2000/svg';
    const SEL = '.glass, [data-glass]' + (ds.selector ? ', ' + ds.selector : '');
    const disp = ds.dispersionSelector || '';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;pointer-events:none';
    const defs = document.createElementNS(NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);

    const cache = new Map();   // khoá kích thước → { id, node }
    const active = new Set();  // phần tử đang gần màn hình
    let uid = 0, on = isLiquid();

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
          d[o] = 128 - nx * m * 127; d[o + 1] = 128 - ny * m * 127; d[o + 2] = 128; d[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return c.toDataURL();
    }
    const dm = (s, id) =>
      `<feDisplacementMap in="SourceGraphic" in2="m" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="${id}"/>`;
    const only = (inp, vals, id) => `<feColorMatrix in="${inp}" type="matrix" values="${vals}" result="${id}"/>`;

    function filterFor(w, h, rad, bezel, S, dsp) {
      const key = [w, h, Math.round(rad), Math.round(bezel), Math.round(S), dsp].join('|');
      const hit = cache.get(key);
      if (hit) return hit.id;
      if (cache.size > 60) prune();
      const f = document.createElementNS(NS, 'filter'), id = 'lg' + (uid++);
      f.id = id;
      f.setAttribute('filterUnits', 'userSpaceOnUse');
      f.setAttribute('color-interpolation-filters', 'sRGB');
      f.setAttribute('x', 0); f.setAttribute('y', 0); f.setAttribute('width', w); f.setAttribute('height', h);
      f.innerHTML =
        `<feImage href="${makeMap(w, h, rad, bezel)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/>` +
        (dsp > 0
          ? dm(S * (1 + dsp), 'r0') + dm(S, 'g0') + dm(S * (1 - dsp), 'b0') +
            only('r0', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', 'r') +
            only('g0', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', 'g') +
            only('b0', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', 'b') +
            `<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/>`
          : dm(S, 'out'));
      defs.appendChild(f);
      cache.set(key, { id, node: f });
      return id;
    }
    function prune() {
      const used = new Set([...active].map((e) => e._lg));
      cache.forEach((v, k) => { if (!used.has(v.id)) { v.node.remove(); cache.delete(k); } });
    }

    function apply(el) {
      if (!on) return;
      const w = el.offsetWidth, h = el.offsetHeight;
      if (w < 8 || h < 8) return;
      if (w >= innerWidth - 2 && h >= innerHeight * 0.5) return; // lớp phủ toàn màn hình: bỏ qua
      const S = Math.min(parseFloat(el.dataset.refraction) || 120, Math.min(w, h) * 0.9);
      const dsp = el.dataset.dispersion !== undefined ? parseFloat(el.dataset.dispersion) || 0
        : (disp && el.matches(disp) ? 0.06 : 0);
      const bezel = Math.min(parseFloat(el.dataset.bezel) || Math.min(w, h) * 0.42, Math.min(w, h) / 2);
      const rs = getComputedStyle(el).borderTopLeftRadius;
      const rad = rs.includes('%') ? parseFloat(rs) / 100 * Math.min(w, h) : (parseFloat(rs) || 0);
      const id = filterFor(w, h, rad, bezel, S, dsp);
      if (el._lg === id) return;
      el._lg = id;
      const v = `url(#${id}) blur(var(--lg-blur,0.8px)) saturate(var(--lg-saturate,1.7)) brightness(var(--lg-bright,1.06))`;
      el.style.setProperty('-webkit-backdrop-filter', v);
      el.style.setProperty('backdrop-filter', v);
    }
    function release(el) {
      el._lg = null;
      el.style.removeProperty('-webkit-backdrop-filter');
      el.style.removeProperty('backdrop-filter');
    }

    const timers = new WeakMap();
    const ro = new ResizeObserver((es) => es.forEach((e) => {
      const el = e.target;
      if (!el._lg) return apply(el);
      clearTimeout(timers.get(el));
      timers.set(el, setTimeout(() => apply(el), 120));
    }));
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const el = e.target;
      if (e.isIntersecting) { if (!active.has(el)) { active.add(el); ro.observe(el); } }
      else if (active.has(el)) { active.delete(el); ro.unobserve(el); release(el); }
    }), { rootMargin: '400px' });

    const seen = new WeakSet();
    const watch = (el) => { if (!seen.has(el)) { seen.add(el); io.observe(el); } };
    const scan = () => document.querySelectorAll(SEL).forEach(watch);
    // tự phát hiện mọi phần tử đang dùng backdrop-filter trong CSS của trang
    function detect() {
      document.body.querySelectorAll('*').forEach((el) => {
        if (seen.has(el) || el instanceof SVGElement) return;
        const cs = getComputedStyle(el), bf = cs.backdropFilter || cs.webkitBackdropFilter;
        if (bf && bf !== 'none') watch(el);
      });
    }

    scan();
    (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(detect, { timeout: 1500 });
    addEventListener('load', () => setTimeout(detect, 300));
    let q = 0;
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL))) {
          cancelAnimationFrame(q); q = requestAnimationFrame(scan); return;
        }
      }
    }).observe(document.body, { childList: true, subtree: true });

    return { refresh() { on = isLiquid(); active.forEach((el) => (on ? apply(el) : release(el))); } };
  }

  const start = () => { ui(); if (chromium) engine = makeEngine(); };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', start) : start();
})();
