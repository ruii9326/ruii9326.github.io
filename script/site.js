/* ============================================================
   ruii9326 — shared site script · Liquid Glass
   Dùng bởi: index.html (Trang Chủ) và theworldofninecontinents/

   Mỗi trang đặt window.RUII9326_PAGE = { titleVi, titleEn, descVi, descEn }
   trong <script> inline TRƯỚC khi nạp file này.

   Không có phần nào ở đây đi theo vị trí con trỏ: không vệt sáng, không điểm sáng trong thẻ.
   ============================================================ */

(function () {
  var page = window.RUII9326_PAGE || {};
  var root = document.documentElement;
  root.classList.add('js');

  var langListeners = [];
  var glassEngine = null; // bộ khúc xạ (đặt ở cuối file); công tắc Liquid / Cổ điển gọi refresh() của nó
  window.RUII9326 = window.RUII9326 || {};

  // công tắc ngôn ngữ / giao diện: thanh trượt co giãn như giọt kính khi chạy
  function stretch(sw) {
    if (!sw) return;
    sw.classList.remove('sliding');
    void sw.offsetWidth;
    sw.classList.add('sliding');
    setTimeout(function () { sw.classList.remove('sliding'); }, 700);
  }

  // ===== LANGUAGE SWITCHER =====
  (function () {
    var switcher = document.getElementById('languageSwitcher');
    if (!switcher) return;
    var buttons = switcher.querySelectorAll('.lang-btn');
    var translatable = document.querySelectorAll('[data-i18n]');
    var ariaEls = document.querySelectorAll('[data-aria-vi]');

    function applyLanguage(lang, save) {
      document.documentElement.lang = lang;

      translatable.forEach(function (el) {
        var value = el.getAttribute('data-' + lang);
        if (value !== null) el.innerHTML = value;
      });

      ariaEls.forEach(function (el) {
        var value = el.getAttribute('data-aria-' + lang);
        if (value !== null) el.setAttribute('aria-label', value);
      });

      buttons.forEach(function (button) {
        var active = button.getAttribute('data-lang') === lang;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      switcher.classList.toggle('en', lang === 'en');

      if (page.titleVi && page.titleEn) {
        document.title = lang === 'en' ? page.titleEn : page.titleVi;
      }

      var description = document.querySelector('meta[name="description"]');
      if (description && page.descVi && page.descEn) {
        description.setAttribute('content', lang === 'en' ? page.descEn : page.descVi);
      }

      if (typeof page.onLanguageChange === 'function') {
        page.onLanguageChange(lang);
      }
      langListeners.forEach(function (fn) { try { fn(lang); } catch (e) {} });
      if (save) {
        try { localStorage.setItem('ruii9326-language', lang); } catch (e) {}
      }
    }

    // Used when the user actively switches language: brief fade so the
    // swap doesn't feel abrupt.
    window.setLanguage = function (lang, save) {
      document.body.classList.add('language-changing');
      setTimeout(function () {
        applyLanguage(lang, save);
        document.body.classList.remove('language-changing');
      }, 90);
    };

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        var lang = button.getAttribute('data-lang');
        if (document.documentElement.lang !== lang) { stretch(switcher); window.setLanguage(lang, true); }
      });
    });

    var saved = null;
    try { saved = localStorage.getItem('ruii9326-language'); } catch (e) {}
    // Always apply on load, even with no saved preference, and do it
    // immediately (no fade/delay). This guarantees [data-i18n] elements
    // get their innerHTML applied (escaped markup in data-vi/data-en
    // parsed into real tags) on every first-time visit, not just when a
    // prior localStorage value exists. Without this, first-time visitors
    // (e.g. via in-app browsers that don't share cookies/localStorage
    // with a normal browser session) would see raw escaped HTML as plain
    // text instead of rendered links.
    applyLanguage(saved === 'en' ? 'en' : 'vi', false);
  })();

  // ===== THEME SWITCHER (light / dark) =====
  (function () {
    var switcher = document.getElementById('themeSwitcher');
    if (!switcher) return;
    var buttons = switcher.querySelectorAll('.theme-btn');

    window.setTheme = function (theme, save) {
      document.documentElement.setAttribute('data-theme', theme);

      buttons.forEach(function (button) {
        var active = button.getAttribute('data-theme-choice') === theme;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      switcher.classList.toggle('dark', theme === 'dark');

      if (save) {
        try { localStorage.setItem('ruii9326-theme', theme); } catch (e) {}
      }
    };

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        var theme = button.getAttribute('data-theme-choice');
        if (document.documentElement.getAttribute('data-theme') !== theme) {
          stretch(switcher);
          window.setTheme(theme, true);
        }
      });
    });

    // Sync the pill to whatever theme the early-init inline script already
    // applied (it runs before this file loads, to avoid a light-mode flash).
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    window.setTheme(current, false);
  })();

  // ===== SETTINGS MENU (hamburger → popover with language + theme) =====
  (function () {
    var menu = document.getElementById('settingsMenu');
    var toggle = document.getElementById('settingsMenuToggle');
    if (!menu || !toggle) return;

    function closeMenu() {
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
      menu.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
    }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.classList.contains('open')) closeMenu(); else openMenu();
    });

    document.addEventListener('click', function (e) {
      if (menu.classList.contains('open') && !menu.contains(e.target)) closeMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        closeMenu();
        toggle.focus();
      }
    });
  })();

// ===== "Quay lại" & "Trang Chủ" =====
(function () {
  var backLink = document.getElementById('backLink');
  var gateLink = document.getElementById('gateLink');

  // Ngăn xếp điều hướng tự quản lý (sessionStorage, theo từng tab) thay
  // vì dựa vào window.history.back() / document.referrer của trình
  // duyệt. Cả hai thứ đó không đáng tin khi lùi NHIỀU bước liên tiếp:
  // giá trị referrer bị làm mới/ghi đè ở mỗi lần điều hướng, còn
  // history.back() thực tế có thể bị GitHub Pages hoặc trình duyệt chen
  // thêm entry (canonical URL, bfcache miss...) khiến chuỗi lùi bị lặp
  // qua lại giữa 2 trang thay vì lùi tiếp về trang trước đó nữa. Ngăn
  // xếp này do chính mình ghi và đọc nên luôn đúng.
  var STACK_KEY = 'ruii9326-nav-stack';
  var here = window.location.href;
  var stack = [];
  try { stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || '[]'); } catch (e) { stack = []; }
  if (!stack.length || stack[stack.length - 1] !== here) {
    stack.push(here);
    try { sessionStorage.setItem(STACK_KEY, JSON.stringify(stack)); } catch (e) {}
  }

  var referrer = document.referrer || '';
  var isInternal = false;
  var ref = null;
  try {
    if (referrer) {
      ref = new URL(referrer);
      isInternal = ref.hostname === 'ruii9326.github.io';
    }
  } catch (e) {}

  // Trang sẽ thật sự quay về nếu bấm "Quay lại" ngay bây giờ.
  var prevUrl = null;
  if (stack.length > 1) {
    prevUrl = stack[stack.length - 2];
  } else if (isInternal) {
    // Không có ngăn xếp của chính mình (tab/WebView hoàn toàn mới, ví dụ
    // in-app browser của FB/Zalo), nhưng referrer nội bộ vẫn cho biết
    // đúng trang đã dẫn tới đây.
    prevUrl = referrer || (backLink && backLink.getAttribute('data-fallback')) || null;
  }

  // Trang trước đó (nếu quay lại ngay bây giờ) có phải là Trang Chủ không.
  var goingHome = false;
  if (prevUrl) {
    try {
      var prevPath = new URL(prevUrl, window.location.href).pathname;
      goingHome = prevPath === '/' || prevPath === '/index.html';
    } catch (e) {}
  }

  if (backLink) {
    // Ẩn nút "Quay lại" khi: không có nơi để quay về (truy cập trực tiếp
    // qua link), HOẶC nơi quay về chính là Trang Chủ — xử lý giống hệt
    // trường hợp truy cập trực tiếp, để nút "Trang Chủ" (gateLink, nếu
    // trang có) đảm nhiệm thay vì hiện cả hai nút cùng trỏ về một chỗ.
    if (prevUrl && !goingHome) {
      backLink.addEventListener('click', function (e) {
        e.preventDefault();
        stack.pop();
        if (stack.length) stack.pop();
        try { sessionStorage.setItem(STACK_KEY, JSON.stringify(stack)); } catch (err) {}
        window.location.href = prevUrl;
      });
    } else {
      backLink.style.display = 'none';
    }
  }

  if (gateLink) {
    var backLinkHidden = backLink && backLink.style.display === 'none';
    if (goingHome && !backLinkHidden) {
      gateLink.style.display = 'none';
    }
  }
})();


  // ===== CUỘN MƯỢT BẰNG JS =====
  // Không dựa vào CSS scroll-behavior: nhiều máy Windows bật "giảm chuyển động" làm cuộn mượt
  // của CSS bị tắt, trong khi đây là chuyển động do chính người dùng bấm nên vẫn cần chạy.
  var rafId = null;
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function jump(y) {
    try { window.scrollTo({ top: y, behavior: 'instant' }); } catch (e) { window.scrollTo(0, y); }
  }
  function currentY() { return window.pageYOffset || root.scrollTop || document.body.scrollTop || 0; }
  function cancelScroll() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    root.style.scrollBehavior = '';
  }
  function scrollToY(target, done) {
    cancelScroll();
    var start = currentY();
    var max = Math.max(0, root.scrollHeight - window.innerHeight);
    target = Math.max(0, Math.min(target, max));
    var dist = target - start;
    if (Math.abs(dist) < 2) { if (done) done(); return; }
    var dur = Math.min(1100, Math.max(450, Math.abs(dist) * 0.3));
    var t0 = null;
    root.style.scrollBehavior = 'auto';
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      jump(start + dist * ease(p));
      if (p < 1) { rafId = requestAnimationFrame(step); return; }
      rafId = null;
      jump(target);
      root.style.scrollBehavior = '';
      if (done) done();
    }
    rafId = requestAnimationFrame(step);
  }
  ['wheel', 'touchmove'].forEach(function (ev) {
    window.addEventListener(ev, function () { if (rafId !== null) cancelScroll(); }, { passive: true });
  });
  function setHash(hash) {
    try { history.replaceState(null, '', hash || (location.pathname + location.search)); } catch (e) {}
  }
  window.RUII9326.scrollToY = scrollToY;
  window.RUII9326.currentY = currentY;
  window.RUII9326.setHash = setHash;

  // mọi liên kết neo trong trang (thanh điều hướng, mục lục...) đều cuộn mượt, chừa chỗ cho thanh kính
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    var offset = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    scrollToY(el.getBoundingClientRect().top + currentY() - offset, function () { setHash('#' + id); });
  });

  // ===== KÍNH LỎNG: NHẤN LÀ ÉP, THẢ LÀ NẢY =====
  // Chỉ phần tử trong cùng được ép (không dùng :active vì :active lan lên cả các phần tử cha).
  // Hiệu ứng nằm trọn trong CSS (.is-pressed); JS chỉ bật/tắt lớp này khi nhấn / thả / hủy.
  var LIQUID = [
    '.now-card', 'a.split-row__link', '.split-row--solo', '.haunt', '.btn-primary', '.btn-link',
    '.menu-toggle', '.back-link-icon', '.to-top', '.toc-link', '.emblem', '.mast-line a', '.story-toggle'
  ].join(',');

  var pressedEl = null;
  function release() {
    if (pressedEl) { pressedEl.classList.remove('is-pressed'); pressedEl = null; }
  }
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var el = e.target.closest && e.target.closest(LIQUID);
    release();
    if (!el) return;
    pressedEl = el;
    el.classList.add('is-pressed');
  }, { passive: true });
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', release);
  document.addEventListener('contextmenu', release);

  // thẻ tác phẩm là liên kết thật: chờ một nhịp ngắn để thấy kính nảy lại rồi mới chuyển trang
  document.querySelectorAll('a.split-row__link').forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var href = card.getAttribute('href');
      if (!href) return;
      e.preventDefault();
      card.classList.add('is-launch');
      setTimeout(function () { window.location.href = href; }, 260);
    });
  });
  // quay lại bằng nút Back của trình duyệt (bfcache): bỏ trạng thái đang chuyển trang
  window.addEventListener('pageshow', function () {
    document.querySelectorAll('.is-launch').forEach(function (el) { el.classList.remove('is-launch'); });
    release();
  });

  // ===== THANH ĐIỀU HƯỚNG: "THẤU KÍNH" TRƯỢT GIỮA CÁC MỤC + THEO DÕI MỤC ĐANG ĐỌC =====
  (function () {
    var nav = document.querySelector('.mast-nav');
    if (!nav) return;
    var links = [].slice.call(nav.querySelectorAll('a[href^="#"]'));
    if (!links.length) return;

    var lens = document.createElement('span');
    lens.className = 'mast-lens';
    lens.setAttribute('aria-hidden', 'true');
    nav.insertBefore(lens, nav.firstChild);

    var active = null, hovered = null;

    function place(el) {
      if (!el) { lens.classList.remove('on'); return; }
      var n = nav.getBoundingClientRect(), r = el.getBoundingClientRect();
      var first = !lens.classList.contains('on');
      if (first) lens.classList.add('snap');           // lần đầu hiện: đặt thẳng vào chỗ, không trượt từ góc
      lens.style.setProperty('--lx', (r.left - n.left) + 'px');
      lens.style.setProperty('--lw', r.width + 'px');
      if (first) { void lens.offsetWidth; lens.classList.remove('snap'); lens.classList.add('on'); }
    }
    function rest() { place(hovered || active); }

    links.forEach(function (l) {
      l.addEventListener('pointerenter', function () { hovered = l; place(l); });
      l.addEventListener('focus', function () { hovered = l; place(l); });
      l.addEventListener('blur', function () { hovered = null; rest(); });
    });
    nav.addEventListener('pointerleave', function () { hovered = null; rest(); });
    nav.addEventListener('pointerdown', function () { lens.classList.add('pressed'); }, { passive: true });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      window.addEventListener(ev, function () { lens.classList.remove('pressed'); }, true);
    });

    var ticking = false;
    function updateActive() {
      ticking = false;
      var line = window.innerHeight * 0.38, cur = null;
      links.forEach(function (l) {
        var t = document.getElementById(l.getAttribute('href').slice(1));
        if (t && t.getBoundingClientRect().top <= line) cur = l;
      });
      if (window.innerHeight + currentY() >= root.scrollHeight - 4) cur = links[links.length - 1];
      if (cur !== active) {
        active = cur;
        links.forEach(function (l) {
          l.classList.toggle('is-active', l === cur);
          if (l === cur) l.setAttribute('aria-current', 'location'); else l.removeAttribute('aria-current');
        });
        if (!hovered) place(active);
      }
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(updateActive); }
    }, { passive: true });
    window.addEventListener('resize', function () { rest(); updateActive(); });
    langListeners.push(function () { requestAnimationFrame(function () { requestAnimationFrame(rest); }); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { rest(); });
    window.addEventListener('load', function () { rest(); updateActive(); });
    updateActive();
  })();

  // ===== KHÚC XẠ Ở MÉP KÍNH (chỉ Chrome / Edge / Opera / Brave / Samsung / ColorOS) =====
  // Bộ lọc SVG feDisplacementMap bẻ cong phần nền nhìn xuyên qua mép kính như một thấu kính lồi.
  // Bản đồ độ dịch được vẽ bằng canvas (độ phân giải thấp, mịn như nhau) theo kích thước từng phần tử;
  // các phần tử cùng kích thước dùng chung một bộ lọc. Chỉ phần tử gần màn hình mới bật khúc xạ.
  // Safari / Firefox không hỗ trợ url() trong backdrop-filter nên giữ nguyên bản kính CSS.
  // Chế độ "Cổ điển" (html[data-glass-mode="classic"]) tắt hẳn khúc xạ và trả về kính CSS.
  (function () {
    if (!root.classList.contains('lg-can')) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return;

    var SEL = '.mast-pill, .menu-toggle, .back-link-icon, .settings-popover, .now-card, .split-row, .emblem, .to-top, .toc-card, .about__text, .about__quote, .btn-primary, .btn-link, .story-toggle';
    var BIG = '.mast-pill, .emblem, .settings-popover';   // nhóm này dùng --glass-blur, còn lại --glass-blur-sm
    var DISP = '.menu-toggle, .settings-popover, .btn-primary';
    var DISP_AMOUNT = 0.035;                                // tán sắc nhẹ trên nút/hộp nhỏ; .mast-pill dùng 1 pass để giữ 120fps khi cuộn
    var REFRACT = 40;                                    // độ khúc xạ (px) — chỉnh số này để tăng/giảm
    var MAX_AREA = 900000;                                // bỏ qua phần tử quá lớn (px²)
    var MAP_PX = 80000;                                   // ngân sách điểm ảnh bản đồ dịch (đủ mịn với bilinear + MAP_BLUR, nhanh hơn ~4x)
    var AA_BLUR = 0;                                      // khử răng cưa chuyển sang CSS backdrop-filter GPU (--glass-blur)
    var MAP_BLUR = 0.4;                                   // làm mịn bản đồ (px CSS): xóa bậc thang 8-bit; 0 = tắt
    function dprNow() { return Math.min(window.devicePixelRatio || 1, 2); }

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
      var edgeX = hx - rr - bezel, edgeY = hy - rr - bezel;
      for (var y = 0; y < ch; y++) {
        var py = (y + 0.5) / k - hy;
        var apy = py < 0 ? -py : py;
        var qy = apy - (hy - rr);
        var inY = apy <= edgeY;
        for (var x = 0; x < cw; x++) {
          var i = (y * cw + x) * 4;
          var px = (x + 0.5) / k - hx;
          var apx = px < 0 ? -px : px;
          if (inY && apx <= edgeX) {
            d[i] = 128; d[i + 1] = 128; d[i + 2] = 128; d[i + 3] = 255;
            continue;
          }
          var qx = apx - (hx - rr);
          var ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0;
          var len = ox || oy ? Math.sqrt(ox * ox + oy * oy) : 0;
          var depth = -(len + (qx > qy ? (qx < 0 ? qx : 0) : (qy < 0 ? qy : 0)) - rr);
          if (depth >= bezel) {
            d[i] = 128; d[i + 1] = 128; d[i + 2] = 128; d[i + 3] = 255;
            continue;
          }
          var nx = 0, ny = 0;
          if (len > 0) { nx = (ox / len) * (px < 0 ? -1 : 1); ny = (oy / len) * (py < 0 ? -1 : 1); }
          else if (qx > qy) nx = px < 0 ? -1 : 1;
          else ny = py < 0 ? -1 : 1;
          var m = Math.pow(1 - (depth > 0 ? depth : 0) / bezel, 1.5);
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
    }, { rootMargin: '250px' });

    function near(el) { var r = el.getBoundingClientRect(); return r.bottom > -250 && r.top < window.innerHeight + 250; }
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
    if (!root.classList.contains('lg-can')) {
      root.setAttribute('data-glass-mode', 'classic');
      return;
    }
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

  // ===== NÚT VỀ MỤC LỤC (#toTop -> #toc) =====
  (function () {
    var toTop = document.getElementById('toTop');
    var tocEl = document.getElementById('toc');
    if (!toTop || !tocEl) return;
    var ticking = false;
    function update() {
      ticking = false;
      toTop.classList.toggle('show', tocEl.getBoundingClientRect().bottom < 0);
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
    toTop.addEventListener('click', function () {
      var offset = parseFloat(getComputedStyle(tocEl).scrollMarginTop) || 0;
      var y = tocEl.getBoundingClientRect().top + currentY() - offset;
      scrollToY(y, function () { setHash('#toc'); });
    });
  })();

  // ===== ĐÓNG / MỞ MỤC TRUYỆN NGẮN TRÊN TRANG CHỦ =====
  (function () {
    var btn = document.getElementById('storyToggle');
    var drawer = document.getElementById('storyDrawer');
    if (!btn || !drawer) return;

    function sync(open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      drawer.classList.toggle('is-open', open);
      drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      if ('inert' in drawer) drawer.inert = !open;
    }

    sync(false);
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      sync(open);
      if (open && glassEngine) {
        setTimeout(function () { glassEngine.refresh(); }, 60);
      }
    });
  })();
})();
