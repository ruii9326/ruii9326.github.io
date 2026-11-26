/* ============================================================
   webgl/script/webgl.js — kính khúc xạ bằng WebGL 1 (Safari, Firefox, iPhone/iPad; chạy được cả trên Chromium)
   Phụ thuộc shared/core.js (nạp trước).

   Cách hoạt động:
   - Một canvas cố định toàn màn hình nằm DƯỚI nội dung. Chữ, nút, liên kết vẫn là HTML thật.
   - Nền (4 vệt màu mềm + 2 bộ vòng tròn mảnh) được vẽ lại bằng shader, theo đúng công thức CSS của body::before / ::after,
     rồi lưu vào một texture (chỉ vẽ lại khi đổi cỡ cửa sổ / sáng-tối).
   - Mỗi ô kính (SEL) được vẽ bằng một hình chữ nhật bo góc: phần nền nhìn xuyên qua mép kính bị bẻ cong như thấu kính lồi
     (cùng công thức bản đồ độ dịch của bản glass: bezel, REFRACT, tán sắc). Chỉ vẽ lại khi có gì đó thay đổi.
   - Chế độ "Cổ điển", hoặc khi WebGL không dùng được / mất ngữ cảnh: tắt canvas, trả về kính CSS thường (backdrop-filter: blur).
   - Khi canvas đang chạy, <html> có class "wgl-live" (CSS ẩn nền CSS cũ và blur của ô kính).
   ============================================================ */
(function () {
  'use strict';
  var root = document.documentElement;
  var R = window.RUII9326 = window.RUII9326 || {};
  if (window.matchMedia && window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return;

  // ---- thông số: giống bản glass, chỉnh ở đây ----
  var SEL = '.mast-pill, .menu-toggle, .back-link-icon, .settings-popover, .now-card, .split-row, .emblem, .to-top, .toc-card, .about__text, .about__quote, .btn-primary, .btn-link, ' +
            '.haunt, .contact-row, .mini-pill, .split-row__tag, .language-switcher, .theme-switcher, .glass-switcher, .version-link';   // dòng 2: ô kính nhỏ / lồng bên trong — bản glass không khúc xạ, bản WebGL có
  var FIXED = '.mast-pill, .menu-toggle, .back-link-icon, .settings-popover, .to-top';   // nằm trên mọi thứ: vẽ sau cùng (cả các phần tử con bên trong, ví dụ công tắc trong menu)
  var DISP = '.mast-pill, .menu-toggle, .settings-popover, .btn-primary';                // có tán sắc
  var DISP_AMOUNT = 0.1;     // 0 = tắt tán sắc
  var REFRACT = 40;          // độ khúc xạ (px); mỗi phần tử có thể đặt data-refraction riêng
  var MAX_AREA = 900000;     // bỏ qua phần tử quá lớn (px²), như bản glass
  var MAX_DPR = 2;           // giới hạn độ phân giải canvas (iPhone là 3x; 2x đủ nét và nhẹ hơn nhiều)
  var MARGIN = 2;            // lề (px) quanh ô kính để khử răng cưa mép
  var IDLE_FRAMES = 24;      // đứng yên chừng này khung hình thì ngừng vòng lặp (sự kiện sẽ đánh thức lại)

  // ---- canvas + ngữ cảnh ----
  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:none';
  var gl = null, glOpts = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' };
  try { gl = canvas.getContext('webgl', glOpts) || canvas.getContext('experimental-webgl', glOpts); } catch (e) { gl = null; }
  if (!gl) return;                                       // không có WebGL: giữ kính CSS thường
  document.body.insertBefore(canvas, document.body.firstChild);

  var VS_FULL = 'attribute vec2 aCorner; void main(){ gl_Position = vec4(aCorner * 2.0 - 1.0, 0.0, 1.0); }';
  var VS_QUAD = 'attribute vec2 aCorner; uniform vec4 uRect; uniform vec2 uRes; varying vec2 vCss;' +
    'void main(){ vec2 c = uRect.xy + aCorner * uRect.zw; vCss = c; gl_Position = vec4(c.x / uRes.x * 2.0 - 1.0, 1.0 - c.y / uRes.y * 2.0, 0.0, 1.0); }';
  var PREC = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';

  // nền: lặp lại đúng body::before (6 vệt màu trên nền --bg-base) và body::after (2 bộ vòng tròn + mặt nạ + opacity .8)
  var FS_BG = PREC +
    'uniform vec2 uPx; uniform float uDpr; uniform vec3 uBase; uniform vec4 uO0, uO1, uO2, uO3, uRing;' +
    'vec3 over(vec3 d, vec3 c, float a){ return d * (1.0 - a) + c * a; }' +
    'float rad(vec2 p, vec2 c, vec2 r, float stop){ return clamp(1.0 - length((p - c) / r) / stop, 0.0, 1.0); }' +
    'float ring(vec2 p, vec2 c, float per){ float r = length(p - c); float d = mod(r - (per - 0.5) + per * 0.5, per) - per * 0.5; float aa = 1.0 / uDpr; return clamp((0.5 + 0.5 * aa - abs(d)) / aa, 0.0, 1.0); }' +
    'void main(){' +
    '  vec2 res = uPx / uDpr; vec2 p = vec2(gl_FragCoord.x, uPx.y - gl_FragCoord.y) / uDpr; float vm = max(res.x, res.y);' +
    '  vec3 col = uBase;' +
    '  col = over(col, uO2.rgb, uO2.a * rad(p, vec2(0.66, 0.58) * res, vec2(0.28 * vm), 0.72));' +
    '  col = over(col, uO1.rgb, uO1.a * rad(p, vec2(0.34, 0.50) * res, vec2(0.30, 0.26) * vm, 0.72));' +
    '  col = over(col, uO3.rgb, uO3.a * rad(p, vec2(0.06, 0.90) * res, vec2(0.44 * vm), 0.70));' +
    '  col = over(col, uO2.rgb, uO2.a * rad(p, vec2(0.84, 0.96) * res, vec2(0.50 * vm), 0.72));' +
    '  col = over(col, uO1.rgb, uO1.a * rad(p, vec2(0.92, 0.12) * res, vec2(0.40 * vm), 0.70));' +
    '  col = over(col, uO0.rgb, uO0.a * rad(p, vec2(0.10, 0.06) * res, vec2(0.46 * vm), 0.70));' +
    '  vec2 c1 = vec2(0.82, 0.34) * res, c2 = vec2(0.12, 0.78) * res;' +
    '  float m1 = rad(p, c1, vec2(0.60 * vm), 0.70), m2 = rad(p, c2, vec2(0.50 * vm), 0.70); float mask = m1 + m2 * (1.0 - m1);' +
    '  float k1 = ring(p, c1, 59.0), k2 = ring(p, c2, 77.0);' +
    '  col = over(col, uRing.rgb, uRing.a * 0.8 * mask * (k1 + k2 - k1 * k2));' +
    '  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;' +   // chống vệt bậc thang ở nền tối
    '  gl_FragColor = vec4(col, 1.0); }';
  var FS_BLIT = PREC + 'uniform sampler2D uBg; uniform vec2 uPx; void main(){ gl_FragColor = vec4(texture2D(uBg, gl_FragCoord.xy / uPx).rgb, 1.0); }';
  // ô kính: SDF hình chữ nhật bo góc; ở mép (độ sâu < bezel) lấy mẫu nền lệch vào trong (giống bản đồ độ dịch của bản glass)
  var FS_GLASS = PREC +
    'uniform sampler2D uBg; uniform vec2 uRes; uniform float uDpr; uniform vec4 uShape, uP; uniform vec2 uQ; varying vec2 vCss;' +
    'vec3 bg(vec2 c){ return texture2D(uBg, vec2(c.x / uRes.x, 1.0 - c.y / uRes.y)).rgb; }' +
    'void main(){' +
    '  vec2 p = vCss - uShape.xy; vec2 hs = uShape.zw; float rr = min(uP.x, min(hs.x, hs.y));' +
    '  vec2 q = abs(p) - (hs - rr); vec2 o = max(q, 0.0); float len = length(o);' +
    '  float sd = len + min(max(q.x, q.y), 0.0) - rr;' +
    '  float cov = clamp(0.5 - sd * uDpr, 0.0, 1.0); if (cov <= 0.0) discard;' +
    '  float depth = -sd;' +
    '  vec2 n = len > 0.0 ? o / len * sign(p) : (q.x > q.y ? vec2(sign(p.x), 0.0) : vec2(0.0, sign(p.y)));' +
    '  float m = depth < uP.y ? pow(1.0 - max(depth, 0.0) / uP.y, 1.5) : 0.0;' +
    '  vec2 off = -n * m * (uP.z * 0.498); float d = uQ.x;' +
    '  vec3 col = vec3(bg(vCss + off * (1.0 + d)).r, bg(vCss + off).g, bg(vCss + off * (1.0 - d)).b);' +
    '  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722)); col = clamp(mix(vec3(lum), col, uP.w), 0.0, 1.0);' +
    '  float a = cov * uQ.y; gl_FragColor = vec4(col * a, a); }';

  var progs = {}, locs = {}, buf = null, tex = null, fbo = null;
  var ready = false, live = false, lost = false;
  var W = 0, H = 0, Wp = 0, Hp = 0, dpr = 1, wanted = 1;
  var colors = null, bgDirty = true, colorsUntil = 0, colorsFrom = 0, colorsStable = 0;   // sau khi đổi sáng/tối: đọc lại màu mỗi khung hình tới khi ổn định (biến màu CSS đang chạy hiệu ứng chuyển, máy chậm thì lâu hơn)

  function compile(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aCorner'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function U(name) {
    var k = progs.cur.id + name;
    if (!(k in locs)) locs[k] = gl.getUniformLocation(progs.cur.p, name);
    return locs[k];
  }
  function use(name) { progs.cur = progs[name]; gl.useProgram(progs[name].p); }

  function build() {                                    // tạo tài nguyên GL (lần đầu và sau khi khôi phục ngữ cảnh)
    try {
      progs = { bg: { id: 'bg', p: program(VS_FULL, FS_BG) }, blit: { id: 'blit', p: program(VS_FULL, FS_BLIT) }, glass: { id: 'glass', p: program(VS_QUAD, FS_GLASS) } };
      locs = {}; tex = null; fbo = null; Wp = Hp = 0;
      buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      ready = true; return true;
    } catch (e) { ready = false; if (window.console) console.warn('[webgl] không khởi tạo được, dùng kính CSS thường:', e.message); return false; }
  }

  // ---- màu: đọc từ biến CSS (đổi sáng/tối là đọc lại) ----
  var cctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function oklch(str) {                                  // dự phòng nếu canvas 2D không hiểu oklch()
    var m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+)(%?))?\s*\)/.exec(str); if (!m) return null;
    var L = parseFloat(m[1]) / (m[2] ? 100 : 1), C = parseFloat(m[3]), h = parseFloat(m[4]) * Math.PI / 180;
    var al = m[5] === undefined ? 1 : parseFloat(m[5]) / (m[6] ? 100 : 1), a = C * Math.cos(h), b = C * Math.sin(h);
    var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3), mm = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3), s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    function g(x) { x = Math.max(0, Math.min(1, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; }
    return [g(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s), g(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s), g(-0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * s), al];
  }
  function color(str) {
    str = (str || '').trim(); if (!str) return [0, 0, 0, 0];
    if (cctx) {
      cctx.canvas.width = cctx.canvas.height = 1; cctx.fillStyle = '#010203'; cctx.fillStyle = str;
      if (cctx.fillStyle !== '#010203') {                // canvas hiểu được màu này -> dùng đúng cách trình duyệt tô màu
        cctx.clearRect(0, 0, 1, 1); cctx.fillRect(0, 0, 1, 1);
        var d = cctx.getImageData(0, 0, 1, 1).data; return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
      }
    }
    return oklch(str) || [0, 0, 0, 0];
  }
  function readColors() {
    var cs = getComputedStyle(root), v = function (n) { return color(cs.getPropertyValue(n)); };
    colors = { base: v('--bg-base'), o: [v('--orb-a'), v('--orb-b'), v('--orb-c'), v('--orb-d')], ring: v('--orb-ring') };
  }

  // ---- kích thước + texture nền ----
  function resizeGL() {
    var b = canvas.getBoundingClientRect(); W = b.width; H = b.height;
    var maxT = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    wanted = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_DPR));
    dpr = Math.max(1, Math.min(wanted, maxT / Math.max(W, H, 1)));
    Wp = Math.max(1, Math.round(W * dpr)); Hp = Math.max(1, Math.round(H * dpr));
    canvas.width = Wp; canvas.height = Hp;
    if (tex) gl.deleteTexture(tex); if (fbo) gl.deleteFramebuffer(fbo);
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Wp, Hp, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer không đầy đủ');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    bgDirty = true;
  }
  function renderBg() {
    if (!colors) readColors();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, Wp, Hp); gl.disable(gl.BLEND);
    use('bg');
    gl.uniform2f(U('uPx'), Wp, Hp); gl.uniform1f(U('uDpr'), dpr); gl.uniform3f(U('uBase'), colors.base[0], colors.base[1], colors.base[2]);
    ['uO0', 'uO1', 'uO2', 'uO3'].forEach(function (n, i) { var c = colors.o[i]; gl.uniform4f(U(n), c[0], c[1], c[2], c[3]); });
    gl.uniform4f(U('uRing'), colors.ring[0], colors.ring[1], colors.ring[2], colors.ring[3]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ---- các ô kính ----
  var items = [];
  function measure(it) {                                 // thông số tĩnh: đổi khi cỡ chữ / ngôn ngữ / kích thước đổi
    var el = it.el, w = el.offsetWidth, h = el.offsetHeight;
    it.ok = !(w < 8 || h < 8 || w * h > MAX_AREA); if (!it.ok) return;
    var cs = getComputedStyle(el), rs = cs.borderTopLeftRadius;
    var r = /%/.test(rs) ? parseFloat(rs) / 100 * Math.min(w, h) : (parseFloat(rs) || 0);
    it.w0 = w; it.r = Math.min(r, w / 2, h / 2);
    it.bezel = Math.max(3, Math.min(Math.min(w, h) * 0.18, 18));
    it.S = Math.min(parseFloat(el.getAttribute('data-refraction')) || REFRACT, Math.min(w, h) * 0.9);
    it.sat = parseFloat(cs.getPropertyValue('--glass-sat')) || 1;
  }
  function opacityOf(el) {                               // độ trong suốt thực tế (kể cả do tổ tiên): ô kính ẩn / đang hiện dần thì không vẽ
    var o = 1, n = el, i = 0;
    for (; n && n.nodeType === 1 && n !== root && i < 8; n = n.parentElement, i++) {
      var cs = getComputedStyle(n);
      if (i === 0 && cs.visibility === 'hidden') return 0;
      var v = parseFloat(cs.opacity); if (v < 1) o *= v;
    }
    return o;
  }
  var io = window.IntersectionObserver ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { for (var i = 0; i < items.length; i++) if (items[i].el === e.target) items[i].vis = e.isIntersecting; });
    wake();
  }, { rootMargin: '200px' }) : null;
  var ro = window.ResizeObserver ? new ResizeObserver(function (es) {
    es.forEach(function (e) { for (var i = 0; i < items.length; i++) if (items[i].el === e.target) measure(items[i]); });
    wake();
  }) : null;
  Array.prototype.forEach.call(document.querySelectorAll(SEL), function (el) {
    var it = { el: el, vis: !io, ok: false, fixed: !!el.closest(FIXED), disp: el.matches(DISP) ? DISP_AMOUNT : 0, x: 0, y: 0, w: 0, h: 0, op: 0, on: false };
    items.push(it); measure(it); if (io) io.observe(el); if (ro) ro.observe(el);
  });

  // ---- vẽ ----
  function drawGlass(it) {
    gl.uniform4f(U('uRect'), it.x - MARGIN, it.y - MARGIN, it.w + 2 * MARGIN, it.h + 2 * MARGIN);
    gl.uniform4f(U('uShape'), it.x + it.w / 2, it.y + it.h / 2, it.w / 2, it.h / 2);
    gl.uniform4f(U('uP'), it.r * (it.w / it.w0), it.bezel, it.S, it.sat);
    gl.uniform2f(U('uQ'), it.disp, it.op);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function draw() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, Wp, Hp); gl.disable(gl.BLEND);
    use('blit'); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(U('uBg'), 0); gl.uniform2f(U('uPx'), Wp, Hp); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    use('glass'); gl.uniform1i(U('uBg'), 0); gl.uniform2f(U('uRes'), W, H); gl.uniform1f(U('uDpr'), dpr);
    for (var pass = 0; pass < 2; pass++)
      for (var i = 0; i < items.length; i++) if (items[i].on && items[i].fixed === (pass === 1)) drawGlass(items[i]);
  }

  var running = false, idle = 0;
  function frame() {
    if (!live || document.hidden) { running = false; return; }
    var now = performance.now();
    if (now < colorsUntil) {
      var before = JSON.stringify(colors); readColors(); idle = 0;
      if (JSON.stringify(colors) !== before) { bgDirty = true; colorsStable = 0; } else colorsStable++;
      if (colorsStable >= 12 && now - colorsFrom > 400) colorsUntil = 0;     // ổn định rồi thì thôi
    }
    var changed = false, b = canvas.getBoundingClientRect(), nd = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_DPR));
    if (Math.abs(b.width - W) > 0.5 || Math.abs(b.height - H) > 0.5 || nd !== wanted) { try { resizeGL(); } catch (e) { fail(e); return; } }
    if (bgDirty) { renderBg(); bgDirty = false; changed = true; }
    for (var i = 0; i < items.length; i++) {
      var it = items[i], on = false, op = 0, r;
      if (it.ok && it.vis) {
        r = it.el.getBoundingClientRect();
        if (r.width >= 1 && r.height >= 1) { op = opacityOf(it.el); on = op > 0.002; }
      }
      if (on) {
        if (!it.on || r.left !== it.x || r.top !== it.y || r.width !== it.w || r.height !== it.h || op !== it.op) { changed = true; it.x = r.left; it.y = r.top; it.w = r.width; it.h = r.height; it.op = op; }
      } else if (it.on) changed = true;
      it.on = on;
    }
    if (changed) {
      idle = 0; draw();
      if (!root.classList.contains('wgl-live')) root.classList.add('wgl-live');   // từ giờ mới ẩn nền CSS: không bao giờ có khung hình trống
    } else idle++;
    if (idle > IDLE_FRAMES) { running = false; return; }
    requestAnimationFrame(frame);
  }
  function wake() { idle = 0; if (!running && live) { running = true; requestAnimationFrame(frame); } }

  function fail(e) { if (window.console) console.warn('[webgl] lỗi, quay về kính CSS thường:', e && e.message); ready = false; setLive(false); }
  function startColors() { colorsFrom = performance.now(); colorsUntil = colorsFrom + 8000; colorsStable = 0; }
  function isOn() { return root.getAttribute('data-glass-mode') !== 'classic'; }
  function setLive(on) {
    on = !!(on && ready && !lost);
    if (on === live) return;
    live = on; root.classList.toggle('refract', on);
    if (on) {
      try { readColors(); resizeGL(); } catch (e) { fail(e); return; }
      canvas.style.display = 'block'; items.forEach(measure); wake();
    } else { canvas.style.display = 'none'; root.classList.remove('wgl-live'); running = false; }
  }

  // ---- đồng bộ với trang ----
  R.glassEngine = { kind: 'webgl', refresh: function () { setLive(isOn()); if (live) { items.forEach(measure); startColors(); bgDirty = true; wake(); } } };
  new MutationObserver(function () { if (!live) return; startColors(); bgDirty = true; wake(); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  ['scroll', 'resize', 'orientationchange', 'pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchmove', 'keydown', 'transitionrun', 'transitionend', 'animationstart', 'animationend', 'load']
    .forEach(function (t) { window.addEventListener(t, wake, { capture: true, passive: true }); });
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', wake); window.visualViewport.addEventListener('scroll', wake); }
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('pageshow', wake);
  if (R.onLanguage) R.onLanguage(function () { setTimeout(function () { items.forEach(measure); wake(); }, 60); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { items.forEach(measure); wake(); });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; ready = false; setLive(false); }, false);
  canvas.addEventListener('webglcontextrestored', function () { lost = false; if (build()) { setLive(isOn()); } }, false);

  if (build()) setLive(isOn()); else canvas.remove();
})();
