/* ============================================================
   glass/script/glass.js — khúc xạ kính SVG (chỉ nhân Chromium) + công tắc Liquid / Cổ điển.
   Phụ thuộc shared/core.js (nạp trước).
   ============================================================ */

(function () {
  var root = document.documentElement;
  var R = window.RUII9326 || {};
  var stretch = R.stretch || function () {};
  var langListeners = { push: function (fn) { if (R.onLanguage) R.onLanguage(fn); } };
  var glassEngine = null; // bộ khúc xạ; công tắc Liquid / Cổ điển gọi refresh() của nó

  // ===== KHÚC XẠ Ở MÉP KÍNH (chỉ Chrome / Edge / Opera / Brave / Samsung / ColorOS) =====
  // Bộ lọc SVG feDisplacementMap bẻ cong phần nền nhìn xuyên qua mép kính như một thấu kính lồi.
  // Bản đồ độ dịch được vẽ bằng canvas (độ phân giải thấp, mịn như nhau) theo kích thước từng phần tử;
  // các phần tử cùng kích thước dùng chung một bộ lọc. Chỉ phần tử gần màn hình mới bật khúc xạ.
  // Safari / Firefox không hỗ trợ url() trong backdrop-filter nên giữ nguyên bản kính CSS.
  // Chế độ "Cổ điển" (html[data-glass-mode="classic"]) tắt hẳn khúc xạ và trả về kính CSS.
  (function () {
    if (!/Chrome\/\d+/.test(navigator.userAgent)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return;

    var SEL = '.mast-pill, .menu-toggle, .back-link-icon, .settings-popover, .now-card, .split-row, .emblem, .to-top, .toc-card, .about__text, .about__quote, .btn-primary, .btn-link';
    var BIG = '.mast-pill, .emblem, .settings-popover';   // nhóm này dùng --glass-blur, còn lại --glass-blur-sm
    var DISP = '.mast-pill, .menu-toggle, .settings-popover, .btn-primary';
    var DISP_AMOUNT = 0.1;                                  // 0 = tắt tán sắc (hết vệt cầu vồng); thử 0.02–0.06 để bật lại
    var REFRACT = 40;                                    // độ khúc xạ (px) — chỉnh số này để tăng/giảm
    var MAX_AREA = 900000;                                // bỏ qua phần tử quá lớn (px²)
    var MAP_PX = 300000;                                  // ngân sách điểm ảnh tối đa của bản đồ dịch (cao hơn = nét hơn, tốn hơn)
    var AA_BLUR = 0.5;                                    // khử răng cưa cho nền sau khi bẻ cong (px CSS); 0 = tắt, 0.4–0.9 là hợp lý
    var MAP_BLUR = 0.5;                                   // làm mịn bản đồ (px CSS): xóa bậc thang 8-bit; 0 = tắt
    function dprNow() { return Math.min(window.devicePixelRatio || 1, 3); }

    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    var defs = document.createElementNS(NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);

    var cache = {}, count = 0, uid = 0;
    var active = new Set();                               // phần tử đang gần màn hình
    function isOn() { return root.getAttribute('data-glass-mode') !== 'classic'; }

    function makeMap(w, h, r, bezel) {
      var k = Math.min(dprNow(), Math.sqrt(MAP_PX / (w * h)));   // theo devicePixelRatio, không còn bị ép ~28k điểm ảnh
      var cw = Math.max(2, Math.round(w * k)), ch = Math.max(2, Math.round(h * k));
      var c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      var ctx = c.getContext('2d');
      var img = ctx.createImageData(cw, ch), d = img.data;
      var hx = w / 2, hy = h / 2, rr = Math.min(r, hx, hy);
      for (var y = 0; y < ch; y++) {
        for (var x = 0; x < cw; x++) {
          var px = (x + 0.5) / k - hx, py = (y + 0.5) / k - hy;
          var qx = Math.abs(px) - (hx - rr), qy = Math.abs(py) - (hy - rr);
          var ox = Math.max(qx, 0), oy = Math.max(qy, 0), len = Math.sqrt(ox * ox + oy * oy);
          var depth = -(len + Math.min(Math.max(qx, qy), 0) - rr);      // khoảng cách vào trong từ mép
          var nx = 0, ny = 0, m = 0;                                    // pháp tuyến hướng ra ngoài
          if (len > 0) { nx = ox / len * Math.sign(px); ny = oy / len * Math.sign(py); }
          else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
          if (depth < bezel) m = Math.pow(1 - Math.max(depth, 0) / bezel, 1.5);
          var i = (y * cw + x) * 4;
          d[i] = 128 - nx * m * 127; d[i + 1] = 128 - ny * m * 127; d[i + 2] = 128; d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return c.toDataURL();
    }

    function dm(s, id) {
      return '<feDisplacementMap in="SourceGraphic" in2="mapS" scale="' + s + '" xChannelSelector="R" yChannelSelector="G" result="' + id + '"/>';
    }
    function only(inp, vals, id) {
      return '<feColorMatrix in="' + inp + '" type="matrix" values="' + vals + '" result="' + id + '"/>';
    }

    // phần tử cùng kích thước / thông số dùng chung một bộ lọc
    function filterFor(w, h, r, bezel, S, disp) {
      var key = [w, h, Math.round(r), Math.round(bezel), Math.round(S), disp, dprNow()].join('|');
      if (cache[key]) return cache[key].id;
      if (count > 60) prune();
      var id = 'lg-' + (++uid), f = document.createElementNS(NS, 'filter');
      f.setAttribute('id', id);
      f.setAttribute('filterUnits', 'userSpaceOnUse');
      f.setAttribute('color-interpolation-filters', 'sRGB');
      f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', w); f.setAttribute('height', h);
      f.innerHTML =
        '<feImage href="' + makeMap(w, h, r, bezel) + '" x="0" y="0" width="' + w + '" height="' + h + '" preserveAspectRatio="none" result="map"/>' +
        (MAP_BLUR > 0 ? '<feGaussianBlur in="map" stdDeviation="' + MAP_BLUR + '" result="mapS"/>'
                      : '<feOffset in="map" dx="0" dy="0" result="mapS"/>') +
        (disp > 0
          ? dm(S * (1 + disp), 'r0') + dm(S, 'g0') + dm(S * (1 - disp), 'b0') +
            only('r0', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', 'r') +
            only('g0', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', 'g') +
            only('b0', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', 'b') +
            '<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/>'
          : dm(S, 'out')) +
        (AA_BLUR > 0 ? '<feGaussianBlur stdDeviation="' + AA_BLUR + '" edgeMode="duplicate"/>' : '');   // khử răng cưa sau khi dịch
      defs.appendChild(f);
      cache[key] = { id: id, node: f }; count++;
      return id;
    }
    function prune() {                                   // bỏ bộ lọc không còn phần tử nào dùng
      var used = {};
      active.forEach(function (el) { if (el.__lgId) used[el.__lgId] = 1; });
      Object.keys(cache).forEach(function (k) {
        if (!used[cache[k].id]) { cache[k].node.remove(); delete cache[k]; count--; }
      });
    }

    function apply(el) {
      if (!isOn()) return;
      var w = el.offsetWidth, h = el.offsetHeight;       // không bị ảnh hưởng bởi animation scale
      if (w < 8 || h < 8 || w * h > MAX_AREA) return;
      var rs = getComputedStyle(el).borderTopLeftRadius;
      var r = /%/.test(rs) ? parseFloat(rs) / 100 * Math.min(w, h) : (parseFloat(rs) || h / 2);
      var bezel = Math.max(3, Math.min(Math.min(w, h) * 0.18, 18));
      var S = Math.min(parseFloat(el.getAttribute('data-refraction')) || REFRACT, Math.min(w, h) * 0.9);
      var disp = el.matches(DISP) ? DISP_AMOUNT : 0;
      var id = filterFor(w, h, r, bezel, S, disp);
      if (el.__lgId === id) return;
      el.__lgId = id;
      var v = 'url(#' + id + ') blur(' + (el.matches(BIG) ? 'var(--glass-blur)' : 'var(--glass-blur-sm)') + ') saturate(var(--glass-sat))';
      el.style.setProperty('backdrop-filter', v);
      el.style.setProperty('-webkit-backdrop-filter', v);
    }
    function release(el) {                               // trả về kính CSS gốc
      el.__lgId = null;
      el.style.removeProperty('backdrop-filter');
      el.style.removeProperty('-webkit-backdrop-filter');
    }

    var timer = null, timers = new WeakMap();
    function later() { clearTimeout(timer); timer = setTimeout(function () { active.forEach(apply); }, 120); }
    var ro = window.ResizeObserver ? new ResizeObserver(function (es) {
      es.forEach(function (e) {
        var el = e.target;
        if (!el.__lgId) { apply(el); return; }          // lần đầu: áp dụng ngay
        clearTimeout(timers.get(el));                   // đổi kích thước: gom lại, tránh tính liên tục
        timers.set(el, setTimeout(function () { apply(el); }, 120));
      });
    }) : null;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var el = e.target;
        if (e.isIntersecting) { if (!active.has(el)) { active.add(el); if (ro) ro.observe(el); else apply(el); } }
        else if (active.has(el)) { active.delete(el); if (ro) ro.unobserve(el); release(el); }
      });
    }, { rootMargin: '400px' });

    function near(el) { var r = el.getBoundingClientRect(); return r.bottom > -400 && r.top < window.innerHeight + 400; }
    document.querySelectorAll(SEL).forEach(function (el) {
      if (near(el)) { active.add(el); if (ro) ro.observe(el); try { apply(el); } catch (e) {} }  // phần tử đang thấy: bật ngay, không nháy
      io.observe(el);
    });
    window.addEventListener('resize', later);
    langListeners.push(later);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
    window.addEventListener('load', later);

    glassEngine = {
      refresh: function () {
        var on = isOn();
        root.classList.toggle('refract', on);
        active.forEach(function (el) { if (on) apply(el); else release(el); });
      }
    };
    if (isOn()) root.classList.add('refract');
  })();

  // ===== GLASS SWITCHER (Liquid / Cổ điển) =====
  // Cùng cơ chế với công tắc Sáng/Tối: lớp .classic dời thanh trượt, .sliding chạy hiệu ứng co giãn.
  // Chuyển chế độ: trạng thái mới loang ra như giọt nước từ chính nút vừa bấm (View Transitions, nếu có).
  (function () {
    var switcher = document.getElementById('glassSwitcher');
    if (!switcher) return;
    var buttons = switcher.querySelectorAll('.glass-btn');

    function setGlass(mode, save) {
      root.setAttribute('data-glass-mode', mode);
      buttons.forEach(function (button) {
        var active = button.getAttribute('data-glass-choice') === mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      switcher.classList.toggle('classic', mode === 'classic');
      if (glassEngine) glassEngine.refresh();
      if (save) { try { localStorage.setItem('ruii9326-glass', mode); } catch (e) {} }
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        var mode = button.getAttribute('data-glass-choice');
        if (root.getAttribute('data-glass-mode') === mode) return;
        stretch(switcher);
        var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!document.startViewTransition || still) { setGlass(mode, true); return; }
        var r = button.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        var rad = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
        root.classList.add('lg-vt');
        var vt = document.startViewTransition(function () { setGlass(mode, true); });
        vt.ready.then(function () {
          root.animate(
            { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + rad + 'px at ' + x + 'px ' + y + 'px)'] },
            { duration: 750, easing: 'cubic-bezier(.22,1,.36,1)', pseudoElement: '::view-transition-new(root)' }
          );
        }).catch(function () {});
        vt.finished.then(function () { root.classList.remove('lg-vt'); }, function () { root.classList.remove('lg-vt'); });
      });
    });

    setGlass(root.getAttribute('data-glass-mode') === 'classic' ? 'classic' : 'liquid', false);
  })();
})();
