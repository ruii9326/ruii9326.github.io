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
    '.menu-toggle', '.back-link-icon', '.to-top', '.toc-link', '.emblem', '.mast-line a'
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

  // ===== KHÚC XẠ Ở MÉP KÍNH (chỉ Chrome / Edge / Opera / Brave) =====
  // Bộ lọc SVG feDisplacementMap bẻ cong phần nền nhìn xuyên qua mép kính như một thấu kính lồi.
  // Bản đồ độ dịch được vẽ bằng canvas theo đúng kích thước từng phần tử. Safari / Firefox không hỗ trợ
  // url() trong backdrop-filter nên giữ nguyên bản kính CSS. Không phụ thuộc vị trí con trỏ.
  (function () {
    if (!/Chrome\/\d+/.test(navigator.userAgent)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
    var SEL = '.mast-pill, .emblem, .btn-primary, .btn-link, .menu-toggle, .back-link-icon, .to-top, .settings-popover';
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    var defs = document.createElementNS(NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
    var n = 0;

    function makeMap(w, h, r, bezel) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      var img = ctx.createImageData(w, h), d = img.data;
      var hx = w / 2, hy = h / 2, rr = Math.min(r, hx, hy);
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var px = x + 0.5 - hx, py = y + 0.5 - hy;
          var qx = Math.abs(px) - (hx - rr), qy = Math.abs(py) - (hy - rr);
          var ox = Math.max(qx, 0), oy = Math.max(qy, 0);
          var sd = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - rr; // <0 bên trong
          var depth = -sd, i = (y * w + x) * 4, R = 128, G = 128;
          if (depth < bezel && depth > -2) {
            var t = Math.max(0, depth) / bezel, m = Math.pow(1 - t, 2.2);
            // pháp tuyến hướng ra ngoài; điểm lấy mẫu dịch vào trong (thấu kính lồi)
            var nx, ny;
            if (qx > 0 || qy > 0) { var L = Math.sqrt(ox * ox + oy * oy) || 1; nx = ox / L * Math.sign(px); ny = oy / L * Math.sign(py); }
            else if (qx > qy) { nx = Math.sign(px); ny = 0; } else { nx = 0; ny = Math.sign(py); }
            R = Math.round(128 - nx * m * 127); G = Math.round(128 - ny * m * 127);
          }
          d[i] = R; d[i + 1] = G; d[i + 2] = 128; d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return c.toDataURL();
    }

    function setup(el) {
      var w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
      if (w < 8 || h < 8 || w * h > 260000) return;
      var r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || h / 2;
      if (/%/.test(getComputedStyle(el).borderTopLeftRadius)) r = Math.min(w, h) / 2;
      var key = w + 'x' + h;
      if (el.__lgKey === key) return;
      el.__lgKey = key;
      var id = el.__lgId || (el.__lgId = 'lg-' + (++n));
      var f = document.getElementById(id);
      if (!f) {
        f = document.createElementNS(NS, 'filter');
        f.setAttribute('id', id);
        f.setAttribute('filterUnits', 'userSpaceOnUse');
        f.setAttribute('color-interpolation-filters', 'sRGB');
        f.innerHTML = '<feImage result="map" preserveAspectRatio="none"/><feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G"/>';
        defs.appendChild(f);
      }
      var bezel = Math.max(6, Math.min(Math.min(w, h) * 0.32, 22));
      f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', w); f.setAttribute('height', h);
      var im = f.firstChild;
      im.setAttribute('x', '0'); im.setAttribute('y', '0'); im.setAttribute('width', w); im.setAttribute('height', h);
      var url = makeMap(w, h, r, bezel);
      im.setAttribute('href', url);
      im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', url);
      f.lastChild.setAttribute('scale', String(Math.round(bezel * 2.6)));
      var blur = getComputedStyle(el).getPropertyValue('--glass-blur-sm') || '12px';
      el.style.setProperty('backdrop-filter', 'blur(' + (el.matches('.mast-pill, .emblem, .settings-popover') ? 'var(--glass-blur)' : 'var(--glass-blur-sm)') + ') url(#' + id + ') saturate(var(--glass-sat))');
      el.style.setProperty('-webkit-backdrop-filter', el.style.getPropertyValue('backdrop-filter'));
    }
    function all() { document.querySelectorAll(SEL).forEach(function (el) { try { setup(el); } catch (e) {} }); }

    var timer = null;
    function later() { clearTimeout(timer); timer = setTimeout(all, 120); }
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(later);
      document.querySelectorAll(SEL).forEach(function (el) { ro.observe(el); });
    }
    window.addEventListener('resize', later);
    langListeners.push(later);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(all);
    window.addEventListener('load', all);
    all();
    root.classList.add('refract');
  })();
})();
