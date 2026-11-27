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
  // thiết lập hệ thống: giảm độ trong suốt / chế độ tương phản cao -> tắt canvas, dùng kính CSS đặc hơn (xem cuối webgl/style/site.css). Theo dõi cả khi người dùng đổi lúc đang xem.
  function mq(q) { return !!(window.matchMedia && window.matchMedia(q).matches); }
  function prefsOff() { return mq('(prefers-reduced-transparency: reduce)') || mq('(forced-colors: active)'); }

  // ---- thông số: giống bản glass, chỉnh ở đây ----
  var SEL = '.mast-pill, .menu-toggle, .back-link-icon, .settings-popover, .now-card, .split-row, .emblem, .to-top, .toc-card, .about__text, .about__quote, .btn-primary, .btn-link, ' +
            '.haunt, .contact-row, .mini-pill, .split-row__tag, .language-switcher, .theme-switcher, .glass-switcher, .version-link';   // dòng 2: ô kính nhỏ / lồng bên trong — bản glass không khúc xạ, bản WebGL có
  var FIXED = '.mast-pill, .menu-toggle, .back-link-icon, .settings-popover, .to-top';   // nằm trên mọi thứ: vẽ sau cùng (cả các phần tử con bên trong, ví dụ công tắc trong menu)
  var LENS_SEL = '.mast-pill, .menu-toggle, .back-link-icon, .to-top, .settings-popover';   // kính cố định đè lên nội dung: dùng "lớp kính" (bản sao nội dung + bộ lọc SVG) để bẻ cong cả chữ/hình HTML phía sau
  var USE_LENS = true;       // lớp kính cho ô cố định (bẻ cong cả chữ/hình phía sau). Nếu thấy giật trên máy yếu: đặt false -> các ô đó chỉ bẻ cong nền như các thẻ
  var DISP = '.mast-pill, .menu-toggle, .settings-popover, .btn-primary';                // có tán sắc
  var DISP_AMOUNT = 0.1;     // 0 = tắt tán sắc
  var REFRACT = 40;          // độ khúc xạ (px); mỗi phần tử có thể đặt data-refraction riêng
  var MAX_AREA = 900000;     // bỏ qua phần tử quá lớn (px²), như bản glass
  var MAX_DPR = 2;           // giới hạn độ phân giải canvas (iPhone là 3x; 2x đủ nét và nhẹ hơn nhiều)
  var MAX_PIXELS = 2600000;  // ngân sách điểm ảnh của canvas (màn hình lớn / iPad: tự hạ độ phân giải cho vừa)
  var QUALITY = [2, 1.5, 1.25, 1];   // các mức độ phân giải tối đa; máy chậm (khung hình > 40ms liên tục khi cuộn, tức dưới 25fps) sẽ tự hạ dần từng mức
  var MAX_QUADS = 64;        // số ô kính tối đa vẽ trong một khung hình
  var MARGIN = 2;            // lề (px) quanh ô kính để khử răng cưa mép
  var IDLE_FRAMES = 24;      // đứng yên chừng này khung hình thì ngừng vòng lặp (sự kiện sẽ đánh thức lại)

  // ---- canvas + ngữ cảnh ----
  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:none';
  if (window.CSS && CSS.supports && CSS.supports('height', '100lvh')) canvas.style.height = '100lvh';   // iOS: thanh địa chỉ co giãn không làm canvas đổi cỡ (không vẽ lại nền mỗi lần vuốt)
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
    'uniform vec2 uPx; uniform float uDpr, uVm; uniform vec3 uBase; uniform vec4 uO0, uO1, uO2, uO3, uRing;' +
    'vec3 over(vec3 d, vec3 c, float a){ return d * (1.0 - a) + c * a; }' +
    'float rad(vec2 p, vec2 c, vec2 r, float stop){ return clamp(1.0 - length((p - c) / r) / stop, 0.0, 1.0); }' +
    'float ring(vec2 p, vec2 c, float per){ float r = length(p - c); float d = mod(r - (per - 0.5) + per * 0.5, per) - per * 0.5; float aa = 1.0 / uDpr; return clamp((0.5 + 0.5 * aa - abs(d)) / aa, 0.0, 1.0); }' +
    'void main(){' +
    '  vec2 res = uPx / uDpr; vec2 p = vec2(gl_FragCoord.x, uPx.y - gl_FragCoord.y) / uDpr; float vm = uVm;' +
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
  var W = 0, H = 0, Wp = 0, Hp = 0, dpr = 1, qi = 0, dispOn = true;
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
  function calcDpr(w, h, maxT) {                         // độ phân giải canvas: theo màn hình, trần MAX_DPR, mức chất lượng, ngân sách điểm ảnh, giới hạn texture
    maxT = maxT || gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    var d = Math.min(window.devicePixelRatio || 1, MAX_DPR, QUALITY[qi]);
    d = Math.min(d, maxT / Math.max(w, h, 1), Math.sqrt(MAX_PIXELS / Math.max(w * h, 1)));
    return Math.max(0.75, d);
  }
  function resizeGL() {
    var b = canvas.getBoundingClientRect(); W = b.width; H = b.height;
    var maxT = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    dpr = calcDpr(W, H, maxT);
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
    gl.uniform2f(U('uPx'), Wp, Hp); gl.uniform1f(U('uDpr'), dpr); gl.uniform1f(U('uVm'), Math.max(window.innerWidth, H));   // uVm = vmax của CSS (iOS: tính theo khung nhìn lớn)
    gl.uniform3f(U('uBase'), colors.base[0], colors.base[1], colors.base[2]);
    ['uO0', 'uO1', 'uO2', 'uO3'].forEach(function (n, i) { var c = colors.o[i]; gl.uniform4f(U(n), c[0], c[1], c[2], c[3]); });
    gl.uniform4f(U('uRing'), colors.ring[0], colors.ring[1], colors.ring[2], colors.ring[3]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ---- LỚP KÍNH cho ô kính cố định (thanh điều hướng, nút menu, nút quay lại, nút lên đầu trang, menu) ----
  // WebGL chỉ bẻ cong được thứ nó tự vẽ (nền). Chữ và hình HTML nằm sau các ô này thì phải bẻ cong bằng cách khác, giống bản glass:
  // mỗi ô có một lớp con chứa [nền CSS + bản sao nội dung trang cuộn theo trang], bẻ bằng bộ lọc SVG feDisplacementMap
  // (cùng công thức bản đồ độ dịch với glass/script/glass.js). Lớp này đục (có cả nền) nên che luôn nội dung thật bên dưới.
  var SRC = document.querySelector('main') || document.body;   // nguồn sao chép: chốt từ đầu (sau này querySelector('main') có thể trúng chính bản sao trong lớp kính)
  var NSV = 'http://www.w3.org/2000/svg', fdefs = null, fcache = {}, fuid = 0, tpl = null, lensReady = false;
  var LMAP_PX = 300000, LAA_BLUR = 0.5, LMAP_BLUR = 0.5;
  function ldpr() { return Math.min(window.devicePixelRatio || 1, 3); }
  function lensSvg() {
    if (fdefs) return;
    var svg = document.createElementNS(NSV, 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    fdefs = document.createElementNS(NSV, 'defs'); svg.appendChild(fdefs); document.body.appendChild(svg);
  }
  function makeMap(w, h, r, bezel) {
    var k = Math.min(ldpr(), Math.sqrt(LMAP_PX / (w * h))), cw = Math.max(2, Math.round(w * k)), ch = Math.max(2, Math.round(h * k));
    var c = document.createElement('canvas'); c.width = cw; c.height = ch;
    var ctx = c.getContext('2d'), img = ctx.createImageData(cw, ch), d = img.data, hx = w / 2, hy = h / 2, rr = Math.min(r, hx, hy);
    for (var y = 0; y < ch; y++) for (var x = 0; x < cw; x++) {
      var px = (x + 0.5) / k - hx, py = (y + 0.5) / k - hy, qx = Math.abs(px) - (hx - rr), qy = Math.abs(py) - (hy - rr);
      var ox = Math.max(qx, 0), oy = Math.max(qy, 0), len = Math.sqrt(ox * ox + oy * oy), depth = -(len + Math.min(Math.max(qx, qy), 0) - rr), nx = 0, ny = 0, m = 0;
      if (len > 0) { nx = ox / len * Math.sign(px); ny = oy / len * Math.sign(py); } else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
      if (depth < bezel) m = Math.pow(1 - Math.max(depth, 0) / bezel, 1.5);
      var i = (y * cw + x) * 4; d[i] = 128 - nx * m * 127; d[i + 1] = 128 - ny * m * 127; d[i + 2] = 128; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); return c.toDataURL();
  }
  function dm(s, id) { return '<feDisplacementMap in="SourceGraphic" in2="mapS" scale="' + s + '" xChannelSelector="R" yChannelSelector="G" result="' + id + '"/>'; }
  function only(inp, vals, id) { return '<feColorMatrix in="' + inp + '" type="matrix" values="' + vals + '" result="' + id + '"/>'; }
  function filterFor(w, h, r, bezel, S, disp) {
    var key = [w, h, Math.round(r), Math.round(bezel), Math.round(S), disp, ldpr()].join('|');
    if (fcache[key]) return fcache[key];
    lensSvg();
    var id = 'wgl-lf-' + (++fuid), f = document.createElementNS(NSV, 'filter'), url = makeMap(w, h, r, bezel);
    f.setAttribute('id', id); f.setAttribute('filterUnits', 'userSpaceOnUse'); f.setAttribute('color-interpolation-filters', 'sRGB');
    f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', w); f.setAttribute('height', h);
    f.innerHTML =
      '<feImage href="' + url + '" xlink:href="' + url + '" x="0" y="0" width="' + w + '" height="' + h + '" preserveAspectRatio="none" result="map"/>' +
      '<feGaussianBlur in="map" stdDeviation="' + LMAP_BLUR + '" result="mapS"/>' +
      (disp > 0
        ? dm(S * (1 + disp), 'r0') + dm(S, 'g0') + dm(S * (1 - disp), 'b0') +
          only('r0', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', 'r') + only('g0', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', 'g') + only('b0', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', 'b') +
          '<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/>'
        : dm(S, 'out')) +
      '<feGaussianBlur stdDeviation="' + LAA_BLUR + '" edgeMode="duplicate"/>';
    fdefs.appendChild(f); fcache[key] = id; return id;
  }
  function clearFilters() { if (fdefs) while (fdefs.firstChild) fdefs.removeChild(fdefs.firstChild); fcache = {}; }

  function buildTemplate() {                             // bản sao "sạch" của nội dung trang (không id, không tương tác, không chrome cố định)
    var src = SRC, stash = [];
    Array.prototype.forEach.call(src.querySelectorAll('.wgl-lens'), function (l) { stash.push([l, l.parentNode, l.nextSibling]); l.parentNode.removeChild(l); });
    var t = src.cloneNode(true);
    stash.forEach(function (x) { x[1].insertBefore(x[0], x[2]); });
    Array.prototype.forEach.call(t.querySelectorAll('[id]'), function (e) { if (!e.closest('svg')) e.removeAttribute('id'); });
    Array.prototype.forEach.call(t.querySelectorAll('script, style, canvas, iframe, video, audio, .to-top, .back-link-icon, .settings-menu'), function (e) { e.parentNode.removeChild(e); });
    Array.prototype.forEach.call(t.querySelectorAll('a, button, input, select, textarea, [tabindex]'), function (e) { e.setAttribute('tabindex', '-1'); });
    t.removeAttribute('id'); t.setAttribute('aria-hidden', 'true'); t.inert = true; t.setAttribute('inert', '');
    return t;
  }
  function lensMetrics() {                               // kích thước "khung nhìn" để nền CSS trong lớp kính khớp nền thật
    var cs = getComputedStyle(root);
    return { w: root.clientWidth, h: root.clientHeight, fs: cs.fontSize, bs: getComputedStyle(document.body) };
  }
  function sizeLens(it) {
    var m = lensMetrics(), L = it.lens, bs = m.bs;
    L.vp.style.width = (W || m.w) + 'px'; L.vp.style.height = (H || m.h) + 'px';
    L.pg.style.width = m.w + 'px'; L.pg.style.fontSize = m.fs; L.pg.style.lineHeight = bs.lineHeight;
    L.pg.style.paddingLeft = bs.paddingLeft; L.pg.style.paddingRight = bs.paddingRight;
  }
  function layoutBox(el) {                               // vị trí của ô trong khung nhìn, bỏ qua transform (animation scale / hover)
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (cs.transform === 'none') return [r.left, r.top];
    var mt = new DOMMatrix(cs.transform), o = cs.transformOrigin.split(' '), ox = parseFloat(o[0]) || 0, oy = parseFloat(o[1]) || 0;
    return [r.left - ox * (1 - mt.a) - mt.e, r.top - oy * (1 - mt.d) - mt.f];
  }
  function placeLens(it) {
    var p = layoutBox(it.el), key = Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10);
    if (it.lensPos !== key) { it.lensPos = key; it.lens.vp.style.transform = 'translate3d(' + (-p[0]) + 'px,' + (-p[1]) + 'px,0)'; }
  }
  function buildLens(it) {
    try {
      if (!tpl) tpl = buildTemplate();
      var id = filterFor(it.w0, it.h0, it.r, it.bezel, it.S, it.disp), el = document.createElement('div');
      el.className = 'wgl-lens'; el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<div class="wgl-lens__f"><div class="wgl-lens__vp"><div class="wgl-lens__bg"></div><div class="wgl-lens__pg"></div></div></div>';
      var L = { el: el, f: el.firstChild, vp: el.firstChild.firstChild, pg: el.firstChild.firstChild.lastChild };
      L.f.style.filter = L.f.style.webkitFilter = 'url(#' + id + ') saturate(' + it.sat + ')';
      L.pg.appendChild(tpl.cloneNode(true));
      it.lens = L; it.lensSY = null; it.lensPos = null; it.fid = id;
      it.el.insertBefore(el, it.el.firstChild); it.el.classList.add('wgl-lensed');
      sizeLens(it); placeLens(it); return true;
    } catch (e) { if (window.console) console.warn('[webgl] không dựng được lớp kính, dùng nền WebGL:', e.message); it.lensFail = true; return false; }
  }
  function refreshLens(it) {                             // đổi kích thước / thông số: dựng lại bộ lọc + căn lại
    if (!it.lens) return;
    it.fid = filterFor(it.w0, it.h0, it.r, it.bezel, it.S, it.disp);
    it.lens.f.style.filter = it.lens.f.style.webkitFilter = 'url(#' + it.fid + ') saturate(' + it.sat + ')';
    sizeLens(it); it.lensPos = null; placeLens(it);
  }
  function resyncLenses() {                              // nội dung trang đổi (ngôn ngữ, font tải xong): sao chép lại
    tpl = null; if (!lensReady) return;
    items.forEach(function (it) { if (it.lens) { tpl = tpl || buildTemplate(); it.lens.pg.replaceChildren(tpl.cloneNode(true)); sizeLens(it); } });
    wake();
  }

  // ---- các ô kính ----
  var items = [];
  function measure(it) {                                 // thông số tĩnh: đổi khi cỡ chữ / ngôn ngữ / kích thước đổi
    var el = it.el, w = el.offsetWidth, h = el.offsetHeight;
    it.ok = !(w < 8 || h < 8 || w * h > MAX_AREA); if (!it.ok) return;
    var cs = getComputedStyle(el), rs = cs.borderTopLeftRadius;
    var r = /%/.test(rs) ? parseFloat(rs) / 100 * Math.min(w, h) : (parseFloat(rs) || 0);
    it.w0 = w; it.h0 = h; it.r = Math.min(r, w / 2, h / 2);
    it.bezel = Math.max(3, Math.min(Math.min(w, h) * 0.18, 18));
    it.S = Math.min(parseFloat(el.getAttribute('data-refraction')) || REFRACT, Math.min(w, h) * 0.9);
    it.sat = parseFloat(cs.getPropertyValue('--glass-sat')) || 1;
    if (it.lens) refreshLens(it);
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
    var it = { el: el, vis: !io, ok: false, fixed: !!el.closest(FIXED), disp: el.matches(DISP) ? DISP_AMOUNT : 0, isLens: el.matches(LENS_SEL), lens: null, lensOn: false, lensSY: null, x: 0, y: 0, w: 0, h: 0, op: 0, on: false };
    items.push(it); measure(it); if (io) io.observe(el); if (ro) ro.observe(el);
  });

  // ---- vẽ ----
  function drawGlass(it) {
    gl.uniform4f(U('uRect'), it.x - MARGIN, it.y - MARGIN, it.w + 2 * MARGIN, it.h + 2 * MARGIN);
    gl.uniform4f(U('uShape'), it.x + it.w / 2, it.y + it.h / 2, it.w / 2, it.h / 2);
    gl.uniform4f(U('uP'), it.r * (it.w / it.w0), it.bezel, it.S, it.sat);
    gl.uniform2f(U('uQ'), dispOn ? it.disp : 0, it.op);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function draw() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, Wp, Hp); gl.disable(gl.BLEND);
    use('blit'); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(U('uBg'), 0); gl.uniform2f(U('uPx'), Wp, Hp); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    use('glass'); gl.uniform1i(U('uBg'), 0); gl.uniform2f(U('uRes'), W, H); gl.uniform1f(U('uDpr'), dpr);
    var n = 0;
    for (var pass = 0; pass < 2; pass++)
      for (var i = 0; i < items.length; i++) if (items[i].on && !items[i].lens && items[i].fixed === (pass === 1) && n++ < MAX_QUADS) drawGlass(items[i]);
  }

  var running = false, idle = 0, activeRun = 0, lastTs = 0, ema = 16, govN = 0, govFrom = 0, fxUntil = performance.now() + 3500, CV = !!(window.Element && Element.prototype.checkVisibility), stats = { frames: 0, ms: 0 };
  function frame() {
    if (!live || document.hidden) { running = false; return; }
    var now = performance.now(), t0 = now, fxOn = now < fxUntil, quads = 0;
    if (now < colorsUntil) {
      var before = JSON.stringify(colors); readColors(); idle = 0;
      if (JSON.stringify(colors) !== before) { bgDirty = true; colorsStable = 0; } else colorsStable++;
      if (colorsStable >= 20 && now - colorsFrom > 900) colorsUntil = 0;     // ổn định đủ lâu thì thôi (hiệu ứng chuyển màu bắt đầu muộn thì sự kiện transitionrun bên dưới sẽ bắt đầu đọc lại)
    }
    var changed = false, b = canvas.getBoundingClientRect();
    if (gl.isContextLost && gl.isContextLost()) { running = false; return; }
    if (Math.abs(b.width - W) > 0.5 || Math.abs(b.height - H) > 0.5 || Math.abs(calcDpr(b.width, b.height) - dpr) > 0.01) { try { resizeGL(); } catch (e) { fail(e); return; } }
    if (bgDirty) { renderBg(); bgDirty = false; changed = true; }
    for (var i = 0; i < items.length; i++) {
      var it = items[i], on = false, op = 0, r;
      if (it.opLast === undefined) it.opLast = 1;
      if (it.ok && it.vis) {
        r = it.el.getBoundingClientRect();
        if (r.width >= 1 && r.height >= 1) {
          if (fxOn || !CV) op = it.opLast = opacityOf(it.el);                   // đang có hiệu ứng (hiện dần, mở menu...): đọc đầy đủ
          else op = it.el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) ? it.opLast : 0;   // lúc cuộn bình thường: chỉ kiểm tra ẩn hẳn
          on = op > 0.002;
        }
      }
      if (on && it.isLens && lensReady && !it.lensFail) {
        if (!it.lens && it.ok && op > 0.02) { if (buildLens(it)) changed = true; }
        if (it.lens) {
          var sy = window.pageYOffset || 0;
          if (it.lensSY !== sy) { it.lensSY = sy; it.lens.pg.style.transform = 'translate3d(0,' + (-sy) + 'px,0)'; idle = 0; }
          if (r.left !== it.x || r.top !== it.y || r.width !== it.w || r.height !== it.h) placeLens(it);
        }
      }
      if (on) {
        if (!it.on || r.left !== it.x || r.top !== it.y || r.width !== it.w || r.height !== it.h || op !== it.op) { changed = true; it.x = r.left; it.y = r.top; it.w = r.width; it.h = r.height; it.op = op; }
      } else if (it.on) changed = true;
      it.on = on; it.lensOn = on && !!it.lens;
    }
    var tj = performance.now();
    if (changed) {
      idle = 0; draw();
      activeRun++;                                         // bộ điều tiết: khung hình dài liên tục khi đang cuộn -> hạ độ phân giải một mức
      if (activeRun > 4 && now - govFrom > 2500) {
        ema = ema * 0.92 + Math.min(now - lastTs, 200) * 0.08;
        if (++govN > 50 && ema > 40 && qi < QUALITY.length - 1) { qi++; dispOn = qi < QUALITY.length - 1; govN = 0; ema = 16; govFrom = now; try { resizeGL(); } catch (e) { fail(e); return; } renderBg(); draw(); }
      }
      if (!root.classList.contains('wgl-live')) root.classList.add('wgl-live');   // từ giờ mới ẩn nền CSS: không bao giờ có khung hình trống
    } else { idle++; activeRun = 0; }
    lastTs = now; stats.frames++; stats.ms = stats.ms * 0.9 + (performance.now() - t0) * 0.1; stats.js = (stats.js || 0) * 0.9 + (tj - t0) * 0.1;
    if (idle > IDLE_FRAMES) { running = false; return; }
    requestAnimationFrame(frame);
  }
  function wake() { idle = 0; if (!running && live) { running = true; requestAnimationFrame(frame); } }

  function fail(e) { if (window.console) console.warn('[webgl] lỗi, quay về kính CSS thường:', e && e.message); ready = false; setLive(false); }
  function startColors() { colorsFrom = performance.now(); colorsUntil = colorsFrom + 8000; colorsStable = 0; }
  function isOn() { return !prefsOff() && root.getAttribute('data-glass-mode') !== 'classic'; }
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
  R.glassEngine = { kind: 'webgl', refresh: function () { setLive(isOn()); if (live) { if (!lensReady) setTimeout(startLenses, 200); else resyncLenses(); items.forEach(measure); startColors(); bgDirty = true; wake(); } } };
  R.glassEngine.stats = function () { return { live: live, quality: qi, dpr: dpr, canvas: [Wp, Hp], jsMs: Math.round((stats.js || 0) * 100) / 100, frameMs: Math.round(stats.ms * 100) / 100, frames: stats.frames, glass: items.filter(function (i) { return i.on; }).length, lenses: items.filter(function (i) { return i.lens; }).length }; };
  ['(prefers-reduced-transparency: reduce)', '(forced-colors: active)'].forEach(function (q) {
    if (!window.matchMedia) return;
    var m = window.matchMedia(q), f = function () { if (!prefsOff() && !ready && !lost) build(); R.glassEngine.refresh(); };
    if (m.addEventListener) m.addEventListener('change', f); else if (m.addListener) m.addListener(f);
  });
  new MutationObserver(function () { if (!live) return; startColors(); bgDirty = true; wake(); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  ['scroll', 'resize', 'orientationchange', 'pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchmove', 'keydown', 'transitionrun', 'transitionend', 'animationstart', 'animationend', 'load']
    .forEach(function (t) { window.addEventListener(t, wake, { capture: true, passive: true }); });
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', wake); window.visualViewport.addEventListener('scroll', wake); }
  ['transitionrun', 'animationstart', 'pointerdown', 'keydown', 'touchstart'].forEach(function (t) { window.addEventListener(t, function () { fxUntil = performance.now() + 1500; }, { capture: true, passive: true }); });
  ['transitionrun', 'transitionend'].forEach(function (t) { window.addEventListener(t, function (e) { if (live && e.propertyName && e.propertyName.charAt(0) === '-' && e.target === root) { startColors(); wake(); } }, { capture: true, passive: true }); });   // biến màu nền (--bg-base, --orb-*) bắt đầu / kết thúc chuyển màu: đọc lại
  document.addEventListener('visibilitychange', function () { if (document.hidden) running = false; else wake(); });   // tab ẩn: dừng hẳn vòng vẽ
  window.addEventListener('pagehide', function () { running = false; });
  window.addEventListener('pageshow', wake);
  if (R.onLanguage) R.onLanguage(function () { setTimeout(function () { items.forEach(measure); resyncLenses(); wake(); }, 80); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { items.forEach(measure); resyncLenses(); wake(); });
  function startLenses() { if (!USE_LENS || lensReady || !live) return; lensReady = true; wake(); }
  if (document.readyState === 'complete') setTimeout(startLenses, 900); else window.addEventListener('load', function () { setTimeout(startLenses, 900); });
  window.addEventListener('resize', function () { clearFilters(); items.forEach(function (it) { it.lensSY = null; }); setTimeout(function () { items.forEach(function (it) { measure(it); }); wake(); }, 120); });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; ready = false; setLive(false); }, false);
  canvas.addEventListener('webglcontextrestored', function () { lost = false; if (build()) { setLive(isOn()); } }, false);

  if (prefsOff()) { /* chờ người dùng đổi thiết lập hệ thống (xem trình nghe ở trên) */ } else if (build()) setLive(isOn()); else canvas.remove();
})();
