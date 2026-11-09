
// 開場載入動畫（主代理擁有）：綁 Fight 頭巾的帥氣杜賓緊張敲鍵盤，進度條 6 秒到 100%，再歡呼 2 秒，
// 接著用不屑的眼神挑一下眉（1.5 秒），淡出。（v2.1：歡呼 1→2 秒、加挑眉，使用者定）
// 2026-11-09 使用者定案（樣品 style/loading/loading_v3.html）：每次打開遊戲都播、不能跳過、上方保留店名。
// 一般 <script>（不是 module），放在 main.js 前面，頁面一載入就先畫出來。
// main.js 把首頁準備好後呼叫 window.__loader.ready()；還沒準備好時進度停在 98～99%、小編繼續狂敲，準備好才衝到 100%。
// 開發／測試：網址有 screen= 或 noload 就不播（shot.py 截圖、子代理測試用）。
(() => {
'use strict';
const q = new URLSearchParams(location.search);
if (q.has('screen') || q.has('noload')) {
  window.__loader = { ready() {}, finished: Promise.resolve(), skipped: true };
  return;
}
let resolveFinished;
const finished = new Promise(r => { resolveFinished = r; });
let ready = false, readyT = Infinity;
window.__loader = {
  ready() { if (!ready) { ready = true; readyT = (performance.now() - start) / 1000; } },
  finished, skipped: false,
};

const root = document.createElement('div');
root.className = 'ld-overlay';
root.setAttribute('role', 'status');
root.innerHTML = `
<div class="ld">
  <div class="ld-name">菊島連連烘</div>
  <div class="ld-sub">Pâtisserie · Penghu</div>
  <div class="ld-stage"><canvas id="ld-canvas" width="400" height="330" aria-label="綁著 Fight 頭巾的帥氣杜賓犬坐在書桌前，緊張地看著電腦、快速敲鍵盤"></canvas></div>
  <div class="ld-bottom">
    <div class="ld-row">
      <p class="ld-msg">小編努力趕進度中<span class="ld-dots"><span>.</span><span>.</span><span>.</span></span></p>
      <span class="ld-pct" id="ld-pct">0%</span>
    </div>
    <div class="ld-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="ld-bar"><div class="ld-fill" id="ld-fill"></div></div>
  </div>
</div>`;
document.body.appendChild(root);
// ===== 時間軸 =====
const DUR = 6.0;            // 進度條 0% → 100% 的秒數
const CELEBRATE = 2.0;      // 到 100% 後杜賓歡呼的秒數（v2.1：1 秒 → 2 秒）
const SMUG = 1.5;           // 歡呼完：不屑的眼神＋挑眉的秒數，之後淡出
// 進度不是等速：一下衝一下卡，最後卡在 87～89% 小編狂敲，再一口氣衝到 100%
const KEYS = [[0, 0], [0.7, 14], [1.4, 27], [2.0, 33], [2.7, 52], [3.3, 61], [3.9, 76], [4.5, 87], [5.25, 89], [5.75, 98], [6.0, 100]];
const smooth = x => x * x * (3 - 2 * x);
function progressAt(t) {
  if (t <= 0) return 0;
  for (let i = 1; i < KEYS.length; i++) {
    const [t1, p1] = KEYS[i], [t0, p0] = KEYS[i - 1];
    if (t <= t1) return p0 + (p1 - p0) * smooth((t - t0) / (t1 - t0));
  }
  return 100;
}
const HOLD_T = 5.75;        // 到這個時間首頁還沒準備好，就停在 98～99% 等
const FORCE_T = 20;        // 保險：20 秒還沒收到 ready 也直接結束，免得蓋住錯誤畫面
const holdP = t => 98 + Math.min(1, (t - HOLD_T) * 0.2);
let endT = Infinity;       // 進度到 100% 的時間（收到 ready 才知道）
function progressNow(t) {
  if (endT === Infinity && (ready || t >= FORCE_T)) {
    const r = ready ? readyT : t;
    endT = Math.max(DUR, r + 0.25);
    endFrom = r <= HOLD_T ? null : [r, holdP(Math.max(r, HOLD_T))];
  }
  if (t < HOLD_T) return progressAt(t);
  if (t >= endT) return 100;
  if (endT === Infinity) return holdP(t);
  if (!endFrom) return progressAt(t);                 // 準時：照原本的關鍵格走到 100
  const [r0, p0] = endFrom;
  return t <= r0 ? holdP(t) : p0 + (100 - p0) * smooth(Math.min(1, (t - r0) / 0.25));
}
let endFrom = null;
const stalling = t => (t > 4.5 && t < 5.3) || (t > HOLD_T && t < endT);   // 卡關時打字更快、汗更多

// ===== 色票 =====
const C = {
  fur: '#2E2529', furTop: '#40363C', furBot: '#1E171A', outline: '#120C0E',
  tan: '#C9763F', tanLight: '#DB8C55', tanDark: '#94491F', earIn: '#80606A', dk: '#140E10',
  shine: 'rgba(190,200,232,.38)', iris: '#6B3A1F',
  ink: '#3A2A2D', blush: 'rgba(255,157,181,.62)',
  band: '#FFFFFF', bandEdge: '#E6D7C6', red: '#E2464C',
  wood: '#C28A57', woodLight: '#DDAE7C', woodDark: '#A06E3E',
  pink: '#F2AFC0', pinkDeep: '#E48DA4', gold: '#E2A748', cream: '#FFFBF4', line: '#DCCDB9',
  screen: '#2F3552', sweat: '#8CCBF2',
};
const CODE_COLORS = ['#F2AFC0', '#CDEBDC', '#FCE9A8', '#CFE6F5', '#E3DAF5', '#F8D6C4'];

// ===== 畫布 =====
const cv = document.getElementById('ld-canvas');
const ctx = cv.getContext('2d');
const W = 400, H = 330;
const DX = -14, MX = 8;     // 小狗往左、螢幕往右
function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssW = Math.min(cv.parentElement.clientWidth, 420);
  const cssH = cssW * H / W;
  cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
}
fit(); addEventListener('resize', fit);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ===== 小工具 =====
function ell(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function rrect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fillStroke(fill, stroke, lw) { if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); } }

// ===== 狀態 =====
let start = 0, last = 0, typePhase = 0, prevDown = [false, false];
let parts = [];            // 汗珠、「噠」字、星星
let flashKeys = [];        // 亮起來的鍵 { row, col, until }
let code = [];             // 螢幕上的程式碼行
let codeScroll = 0, sweatTimer = 0, daTimer = 0, done = false;
function resetState() {
  start = performance.now(); last = start; typePhase = 0; prevDown = [false, false];
  parts = []; flashKeys = []; codeScroll = 0; sweatTimer = 0; daTimer = 0; done = false;
  code = [newLine()]; for (let i = 0; i < 5; i++) { const l = newLine(); l.typed = l.total; code.unshift(l); }
}
function newLine() {
  const indent = [0, 6, 12][Math.floor(Math.random() * 3)];
  const segs = []; let w = indent; const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n && w < 96; i++) { const sw = 8 + Math.random() * 22; segs.push({ x: w, w: sw, c: CODE_COLORS[Math.floor(Math.random() * CODE_COLORS.length)] }); w += sw + 4; }
  return { segs, total: Math.min(w, 100), typed: indent };
}
function onKeyPress(side, t) {
  // 螢幕多一個字、鍵盤那顆鍵亮一下、偶爾冒「噠」
  const cur = code[code.length - 1];
  cur.typed += 3 + Math.random() * 3;
  if (cur.typed >= cur.total) { code.push(newLine()); if (code.length > 8) { code.shift(); } }
  const row = 1 + Math.floor(Math.random() * 2);
  const col = side === 0 ? 2 + Math.floor(Math.random() * 3) : 6 + Math.floor(Math.random() * 3);
  flashKeys.push({ row, col, until: t + 0.12 });
}

// ===== 背景 =====
function drawBackdrop(t) {
  // 柔和的光圈
  const g = ctx.createRadialGradient(190, 175, 20, 190, 175, 175);
  g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 三角旗串
  ctx.strokeStyle = C.line; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(108, 16); ctx.quadraticCurveTo(250, 40, 392, 16); ctx.stroke();
  for (let i = 0; i < 9; i++) {
    const u = (i + 0.5) / 9, x = 108 + u * 284;
    const y = (1 - u) * (1 - u) * 16 + 2 * (1 - u) * u * 40 + u * u * 16;
    const sway = Math.sin(t * 2 + i) * 1.2;
    ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y); ctx.lineTo(x + sway, y + 18); ctx.closePath();
    fillStroke(i % 2 ? '#FFF6EC' : C.pink, null);
  }
  // 時鐘（分針轉很快＝截稿壓力）
  const cx = 44, cy = 142;
  ell(cx, cy, 25, 25); fillStroke(C.cream, C.wood, 4);
  ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 17, cy + Math.sin(a) * 17); ctx.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); ctx.stroke(); }
  const hand = (a, len, lw, col) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len); ctx.stroke(); };
  hand(t * 0.5 + 2.6, 10, 3, C.ink);
  hand(t * 4.2, 16, 2, C.pinkDeep);
  ell(cx, cy, 2.6, 2.6); fillStroke(C.ink);
}

// ===== 尾巴、身體（杜賓：黑亮短毛＋鏽紅斑紋、短尾巴、深胸） =====
function furGrad(y0, y1) { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, C.furTop); g.addColorStop(1, C.furBot); return g; }
function qpt(s, c, p, u) { const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, d = u * u; return [a * s[0] + b * c[0] + d * p[0], a * s[1] + b * c[1] + d * p[1]]; }
function drawTail(t, wag) {
  const bx = 118, by = 210;
  const a = -2.2 + Math.sin(t * wag) * 0.5;
  const tx = bx + Math.cos(a) * 17, ty = by + Math.sin(a) * 17;
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.outline; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.strokeStyle = C.fur; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
}
function drawBody(jx) {
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, 236); ctx.clip();
  // 深胸、寬肩
  ctx.beginPath();
  ctx.moveTo(116 + jx, 240); ctx.bezierCurveTo(110 + jx, 196, 124 + jx, 168, 152 + jx, 160);
  ctx.lineTo(186 + jx, 158); ctx.bezierCurveTo(212 + jx, 166, 224 + jx, 196, 218 + jx, 240); ctx.closePath();
  fillStroke(furGrad(158, 240), C.outline, 2.5);
  // 胸口兩塊鏽紅
  ell(156 + jx, 206, 9, 7, 0.3); fillStroke(C.tan); ell(188 + jx, 206, 9, 7, -0.3); fillStroke(C.tan);
  // 肌肉線與光澤
  ctx.strokeStyle = C.shine; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(126 + jx, 200); ctx.quadraticCurveTo(130 + jx, 178, 148 + jx, 168); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(210 + jx, 196); ctx.quadraticCurveTo(208 + jx, 180, 198 + jx, 170); ctx.stroke();
  ctx.restore();
}
function drawNeck(jx, jy) {
  const hx = 166 + jx, hy = 116 + jy;
  ctx.beginPath();
  ctx.moveTo(hx - 38, hy + 12); ctx.quadraticCurveTo(hx - 44, hy + 40, hx - 22, 168);
  ctx.lineTo(hx + 30, 168); ctx.quadraticCurveTo(hx + 30, hy + 44, hx + 22, hy + 34); ctx.closePath();
  fillStroke(furGrad(hy, 170), C.outline, 2.5);
  // 喉嚨的鏽紅
  ctx.beginPath(); ctx.moveTo(hx + 2, hy + 36); ctx.quadraticCurveTo(hx + 22, hy + 38, hx + 24, 160); ctx.quadraticCurveTo(hx + 8, 164, hx - 4, 156); ctx.closePath();
  fillStroke(C.tan);
  // 紅色皮項圈＋金環
  ctx.strokeStyle = '#6E1F28'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hx - 34, 150); ctx.quadraticCurveTo(hx - 4, 166, hx + 30, 152); ctx.stroke();
  ctx.strokeStyle = '#B8343F'; ctx.lineWidth = 5.5;
  ctx.beginPath(); ctx.moveTo(hx - 34, 150); ctx.quadraticCurveTo(hx - 4, 166, hx + 30, 152); ctx.stroke();
  ctx.strokeStyle = '#E8B84A'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(hx + 2, 165, 4.5, 0, Math.PI * 2); ctx.stroke();
}

// ===== 書桌、鍵盤、杯子 =====
function drawDeskTop() {
  // 桌面
  rrect(12, 229, 376, 15, 5);
  const g = ctx.createLinearGradient(0, 229, 0, 244); g.addColorStop(0, C.woodLight); g.addColorStop(1, C.wood);
  fillStroke(g);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(20, 231, 360, 2);
}
function drawDeskFront() {
  ctx.fillStyle = C.wood; ctx.fillRect(18, 244, 364, 14);
  ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(18, 244, 364, 3);
  ctx.fillStyle = C.woodDark; ctx.fillRect(30, 258, 14, 72); ctx.fillRect(356, 258, 14, 72);
  // 抽屜把手
  rrect(186, 249, 28, 5, 2.5); fillStroke(C.woodDark);
}
const KB = { tl: [114, 218], tr: [246, 218], br: [258, 235], bl: [102, 235], rows: 3, cols: 11 };
function kbPoint(u, v) {   // u 左→右、v 上→下（0～1）
  const lx = KB.tl[0] + (KB.bl[0] - KB.tl[0]) * v, rx = KB.tr[0] + (KB.br[0] - KB.tr[0]) * v;
  const y = KB.tl[1] + (KB.bl[1] - KB.tl[1]) * v;
  return [lx + (rx - lx) * u, y];
}
function drawKeyboard(t) {
  ctx.beginPath(); ctx.moveTo(...KB.tl); ctx.lineTo(...KB.tr); ctx.lineTo(...KB.br); ctx.lineTo(...KB.bl); ctx.closePath();
  fillStroke('#FFFFFF', C.line, 1.5);
  ctx.fillStyle = 'rgba(160,120,90,.18)'; ctx.fillRect(KB.bl[0] + 1, 235, KB.br[0] - KB.bl[0] - 2, 2.5);
  for (let r = 0; r < KB.rows; r++) for (let c = 0; c < KB.cols; c++) {
    const v = (r + 0.25) / KB.rows, v2 = (r + 0.85) / KB.rows;
    const [x1, y1] = kbPoint((c + 0.12) / KB.cols, v), [x2, y2] = kbPoint((c + 0.88) / KB.cols, v2);
    const lit = flashKeys.some(k => k.row === r && k.col === c && k.until > t);
    rrect(x1, y1, x2 - x1, y2 - y1, 1.2); fillStroke(lit ? C.pink : '#F4EDE4');
  }
  // 空白鍵
  const [sx1, sy1] = kbPoint(0.32, 0.82), [sx2] = kbPoint(0.68, 0.82);
  rrect(sx1, sy1 - 1, sx2 - sx1, 3.2, 1.5); fillStroke('#F4EDE4');
}
function drawMug(t) {
  // 杯子
  rrect(46, 200, 30, 30, 5); fillStroke('#FFFFFF', C.line, 1.5);
  ctx.fillStyle = C.pink; ctx.fillRect(47, 210, 28, 6);
  ctx.strokeStyle = C.line; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(44, 214, 7, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
  // 熱氣
  ctx.strokeStyle = 'rgba(160,130,110,.35)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    const x = 56 + k * 10, ph = t * 3 + k * 1.7;
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) { const y = 196 - i * 2.2; const xx = x + Math.sin(ph + i * 0.6) * 2.5; i ? ctx.lineTo(xx, y) : ctx.moveTo(xx, y); }
    ctx.stroke();
  }
  // 一疊稿子
  ctx.save(); ctx.translate(352, 226); ctx.rotate(-0.06);
  for (let i = 0; i < 3; i++) { rrect(-24, -4 - i * 3, 40, 6, 1.5); fillStroke(i === 2 ? '#FFFFFF' : '#F7EFE4', C.line, 1); }
  ctx.restore();
}

// ===== 螢幕 =====
function drawMonitor(t) {
  // 支架
  rrect(298, 190, 14, 36, 3); fillStroke('#E6DACA', C.line, 1.2);
  ell(305, 229, 30, 4.5); fillStroke('#DCCDB9');
  // 外框
  rrect(232, 84, 144, 110, 11); fillStroke('#FBF7F1', C.line, 2);
  // 下巴的小愛心
  ctx.fillStyle = C.pinkDeep; ctx.beginPath(); const hx = 304, hy = 187;
  ctx.moveTo(hx, hy + 2.5); ctx.bezierCurveTo(hx - 4, hy - 0.5, hx - 2, hy - 3.5, hx, hy - 1.5); ctx.bezierCurveTo(hx + 2, hy - 3.5, hx + 4, hy - 0.5, hx, hy + 2.5); ctx.fill();
  // 螢幕
  const sx = 240, sy = 92, sw = 128, sh = 88;
  rrect(sx, sy, sw, sh, 5); fillStroke(C.screen);
  ctx.save(); rrect(sx, sy, sw, sh, 5); ctx.clip();
  // 視窗標題列
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(sx, sy, sw, 9);
  ['#F28B82', '#FCE9A8', '#CDEBDC'].forEach((c, i) => { ell(sx + 7 + i * 7, sy + 4.5, 2.2, 2.2); fillStroke(c); });
  // 程式碼
  const lh = 9.5, top = sy + 15;
  code.forEach((l, i) => {
    const y = top + i * lh;
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(sx + 4, y, 6, 3.5);   // 行號
    for (const s of l.segs) {
      const visible = Math.min(s.w, l.typed - s.x);
      if (visible <= 0) continue;
      rrect(sx + 14 + s.x, y, visible, 3.8, 1.8); fillStroke(s.c);
    }
    if (i === code.length - 1 && Math.floor(t * 3) % 2 === 0) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(sx + 14 + Math.min(l.typed, 100) + 1, y - 1, 2, 6); }
  });
  // 螢幕反光
  const g = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh); g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(sx, sy, sw, sh);
  ctx.restore();
  // 便利貼
  ctx.save(); ctx.translate(360, 86); ctx.rotate(0.16);
  rrect(-13, -12, 26, 24, 2); fillStroke('#FCE9A8');
  ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(-13, -12, 26, 4);
  ctx.fillStyle = C.red; ctx.font = '900 11px "PingFang TC", "Noto Sans TC", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('趕！', 0, 2);
  ctx.restore();
}

// ===== 手臂與手掌（前腳下半段鏽紅） =====
function drawArms(jx, lifts, raise) {
  // raise：0＝放在鍵盤上（打字或休息），1＝雙手舉高歡呼
  const sL = [142 + jx, 178], sR = [200 + jx, 176];
  const k = raise;
  const mix = (a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const pL = mix([150 + jx * 0.5, 219 - lifts[0]], [100, 108]), pR = mix([208 + jx * 0.5, 218 - lifts[1]], [252, 105]);
  const cL = mix([124 + jx, 204], [118, 150]), cR = mix([224 + jx, 200], [234, 146]);
  ctx.lineCap = 'round';
  for (const [s, c, p] of [[sL, cL, pL], [sR, cR, pR]]) {
    ctx.strokeStyle = C.outline; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(...s); ctx.quadraticCurveTo(...c, ...p); ctx.stroke();
    ctx.strokeStyle = C.fur; ctx.lineWidth = 13.5; ctx.beginPath(); ctx.moveTo(...s); ctx.quadraticCurveTo(...c, ...p); ctx.stroke();
    // 下半段鏽紅色（杜賓的腳）
    ctx.strokeStyle = C.tan; ctx.lineWidth = 13.5; ctx.beginPath();
    for (let i = 0; i <= 8; i++) { const [x, y] = qpt(s, c, p, 0.72 + i / 8 * 0.28); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  for (const p of [pL, pR]) {
    ell(p[0], p[1], 10.5, 7.5); fillStroke(C.tan, C.outline, 2.2);
    ctx.strokeStyle = C.tanDark; ctx.lineWidth = 1.4;
    for (const dx of [-3.6, 0, 3.6]) { ctx.beginPath(); ctx.moveTo(p[0] + dx, p[1] - 5); ctx.lineTo(p[0] + dx, p[1] - 1.8); ctx.stroke(); }
  }
}

// ===== 頭（杜賓：楔形長嘴、尖立耳、杏仁眼、眉上兩點鏽紅；臉朝右看螢幕） =====
function headPath() {
  ctx.beginPath();
  ctx.moveTo(-44, 10);
  ctx.bezierCurveTo(-52, -20, -36, -46, -6, -46);
  ctx.bezierCurveTo(14, -46, 28, -38, 34, -25);
  ctx.bezierCurveTo(46, -18, 60, -12, 71, -5);
  ctx.bezierCurveTo(80, 0, 81, 12, 72, 15);
  ctx.bezierCurveTo(66, 20, 58, 24, 48, 26);
  ctx.bezierCurveTo(42, 30, 34, 36, 22, 38);
  ctx.bezierCurveTo(6, 40, -16, 38, -30, 30);
  ctx.bezierCurveTo(-40, 24, -44, 18, -44, 10);
  ctx.closePath();
}
function drawHead(t, jx, jy, cheer, nervous, smug = 0) {
  const hx = 166 + jx, hy = 116 + jy;
  const ks = smug ? smooth(Math.min(1, smug * 5)) : 0;      // 不屑表情的進場程度
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(-0.08 * ks);  // 下巴微微抬高
  // 頭巾的飄帶（從後腦勺往左飄）
  const flap = t * (nervous ? 15 : 11);
  ctx.lineCap = 'round';
  [[-84, -52, -64, -44], [-80, -26, -64, -30]].forEach(([ex, ey, mx, my], i) => {
    const w1 = Math.sin(flap + i * 1.3) * 5, w2 = Math.sin(flap * 1.3 + i) * 3;
    ctx.strokeStyle = C.bandEdge; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-42, -34); ctx.quadraticCurveTo(mx, my + w2, ex, ey + w1); ctx.stroke();
    ctx.strokeStyle = C.band; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-42, -34); ctx.quadraticCurveTo(mx, my + w2, ex, ey + w1); ctx.stroke();
  });
  // 尖立耳：遠的那隻在後面，近的在前面（緊張時一直抖、微微往後壓；歡呼時直直豎起）
  const q = reduce ? 0 : Math.sin(t * 19) * 0.04;
  const back = (cheer || smug) ? -0.06 : 0.1;
  const ear = (px, py, h, rot, inner) => {
    ctx.save(); ctx.translate(px, py); ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(-12, 6); ctx.bezierCurveTo(-14, -20, -10, -h * 0.7, -3, -h); ctx.bezierCurveTo(6, -h * 0.72, 14, -22, 13, 4); ctx.closePath();
    fillStroke(furGrad(-h, 6), C.outline, 2.5);
    if (inner) { ctx.beginPath(); ctx.moveTo(-6, -2); ctx.bezierCurveTo(-8, -20, -6, -h * 0.62, -2, -h * 0.84); ctx.bezierCurveTo(4, -h * 0.62, 8, -20, 7, -2); ctx.closePath(); fillStroke(C.earIn); }
    ctx.strokeStyle = C.shine; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-9, -8); ctx.quadraticCurveTo(-9, -h * 0.5, -4, -h * 0.85); ctx.stroke();
    ctx.restore();
  };
  ear(14, -36, 48, 0.18 + back * 0.6 + q, false);          // 遠耳
  ear(-22, -34, 54, -0.12 - back + q, true);                // 近耳
  // 頭
  headPath(); fillStroke(furGrad(-46, 40), C.outline, 2.6);
  ctx.save(); headPath(); ctx.clip();
  // 鏽紅：嘴的下半部、下巴、臉頰
  ctx.beginPath(); ctx.moveTo(20, 8); ctx.quadraticCurveTo(44, 0, 66, 7); ctx.lineTo(86, 30); ctx.lineTo(30, 50); ctx.quadraticCurveTo(12, 40, 12, 24); ctx.quadraticCurveTo(13, 13, 20, 8); ctx.closePath();
  fillStroke(C.tan);
  ell(2, 16, 7.5, 5.5, -0.3); fillStroke(C.tan);          // 臉頰的鏽紅小點
  ctx.beginPath(); ctx.moveTo(22, 14); ctx.quadraticCurveTo(44, 8, 62, 12); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3; ctx.stroke();
  // 黑亮的光澤
  ctx.strokeStyle = C.shine; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-34, -30); ctx.quadraticCurveTo(-22, -44, 0, -45); ctx.stroke();
  ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(40, -17); ctx.quadraticCurveTo(54, -12, 64, -6); ctx.stroke();
  // 頭巾（繞在額頭上）
  ctx.beginPath();
  ctx.moveTo(-60, -34); ctx.quadraticCurveTo(-8, -52, 44, -40);
  ctx.lineTo(44, -26); ctx.quadraticCurveTo(-8, -38, -60, -19); ctx.closePath();
  fillStroke(C.band, C.bandEdge, 1.4);
  ctx.restore();
  ctx.save(); ctx.translate(-6, -36); ctx.rotate(-0.05);
  ctx.fillStyle = C.red; ctx.font = '900 14px "Arial Rounded MT Bold", "Avenir Next", "Helvetica Neue", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Fight', 0, 0);
  ctx.restore();
  ell(-42, -32, 6.5, 5.5, 0.5); fillStroke(C.band, C.bandEdge, 1.4);   // 結
  // 眉上兩點鏽紅（緊張：往內上挑；不屑：近的那邊眉毛挑高）
  if (smug) {
    ell(-2, -23 - 7 * ks, 6.2, 3.3, -0.42 * ks); fillStroke(C.tan);     // 挑高、往上彎
    ell(28, -24 + 2.5 * ks, 4.6, 2.1, 0.12 * ks); fillStroke(C.tan);    // 另一邊壓低
  } else {
    const browTilt = cheer ? 0.1 : -0.45;
    ell(-1, -23, 5.4, 3.2, browTilt); fillStroke(C.tan);
    ell(28, -24, 4.2, 2.6, -browTilt * 0.6); fillStroke(C.tan);
  }
  // 眼睛：杏仁形
  const blink = !cheer && !smug && (t % 2.6) > 2.48;
  const eyes = [[0, -11, 10.5, 8.4], [29, -13, 7, 6.2]];   // 緊張：眼睛睜大
  if (cheer > 0) {
    ctx.strokeStyle = C.dk; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const [ex, ey, rx] of eyes) { ctx.beginPath(); ctx.arc(ex, ey + 4, rx * 0.85, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  } else if (smug) {
    // 不屑的眼神：眼皮垂一半、眼珠斜斜往前（看著玩家）；挑眉那邊的眼睛張開一點
    eyes.forEach(([ex, ey, rx, ry], i) => {
      const cover = (i === 0 ? 0.38 : 0.55) * ks;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(-0.12);
      ctx.beginPath(); ctx.moveTo(-rx, 0); ctx.quadraticCurveTo(0, -ry * 1.5, rx, -ry * 0.2); ctx.quadraticCurveTo(0, ry * 1.25, -rx, 0); ctx.closePath();
      fillStroke('#FFF6EC', C.dk, 1.8);
      ctx.save(); ctx.clip();
      const ix = -rx * 0.28 * ks + rx * 0.34 * (1 - ks);
      ell(ix, ry * 0.1, ry * 0.66, ry * 0.66); fillStroke(C.iris);
      ell(ix, ry * 0.1, ry * 0.36, ry * 0.36); fillStroke(C.dk);
      ell(ix - ry * 0.16, -ry * 0.15, ry * 0.2, ry * 0.2); fillStroke('#FFFFFF');
      const lid = -ry * 0.95 + cover * ry * 1.9;
      ctx.fillStyle = furGrad(-ry * 1.6, lid); ctx.fillRect(-rx - 2, -ry * 1.8, rx * 2 + 4, lid + ry * 1.8);
      ctx.restore();
      ctx.strokeStyle = C.dk; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-rx - 1, lid + 1); ctx.quadraticCurveTo(0, lid - 1.5, rx + 1, lid - 0.5); ctx.stroke();
      ctx.restore();
    });
  } else {
    const jit = reduce ? 0 : Math.sin(t * 37) * 0.5;
    for (const [ex, ey, rx, ry] of eyes) {
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(-0.12); ctx.scale(1, blink ? 0.12 : 1);
      ctx.beginPath(); ctx.moveTo(-rx, 0); ctx.quadraticCurveTo(0, -ry * 1.5, rx, -ry * 0.2); ctx.quadraticCurveTo(0, ry * 1.25, -rx, 0); ctx.closePath();
      fillStroke('#FFF6EC', C.dk, 1.8);
      ctx.save(); ctx.clip();
      ell(rx * 0.34 + jit, -ry * 0.05, ry * 0.66, ry * 0.66); fillStroke(C.iris);
      ell(rx * 0.34 + jit, -ry * 0.05, ry * 0.36, ry * 0.36); fillStroke(C.dk);
      ell(rx * 0.18 + jit, -ry * 0.3, ry * 0.2, ry * 0.2); fillStroke('#FFFFFF');
      ctx.restore();
      ctx.restore();
    }
  }
  // 鼻子
  ell(73, 4, 7.5, 6); fillStroke('#0E090B');
  ell(71, 1.5, 3, 1.6); fillStroke('rgba(255,255,255,.7)');
  // 嘴：緊張咬牙／歡呼張嘴／不屑的歪嘴笑
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (smug) {
    ctx.strokeStyle = C.dk; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(67, 17); ctx.quadraticCurveTo(54, 25, 42, 25.5); ctx.quadraticCurveTo(37, 25, 35, 20.5); ctx.stroke();
    ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(36.5, 23); ctx.lineTo(33.5, 24.5); ctx.stroke();   // 嘴角的小酒窩
    // 鼻子「哼」出一小團氣
    const pf = Math.min(1, smug / 0.9);
    if (pf < 1) {
      ctx.save(); ctx.globalAlpha = (1 - pf) * 0.9; ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = 'rgba(120,110,120,.5)'; ctx.lineWidth = 1;
      [[0, 0, 4], [7, -4, 3], [12, 2, 2.4]].forEach(([dx, dy, r]) => { ell(82 + dx + pf * 14, 6 + dy - pf * 6, r * (0.7 + pf * 0.5), r * (0.7 + pf * 0.5)); ctx.fill(); ctx.stroke(); });
      ctx.restore();
    }
    // 挑眉旁的小亮光
    const tw = Math.min(1, smug / 0.25);
    ctx.save(); ctx.translate(-17, -20); ctx.scale(tw, tw); ctx.rotate(smug * 1.5);
    ctx.fillStyle = '#F6D865';
    ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = i % 2 ? 2 : 6.5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (cheer > 0) {
    ctx.beginPath(); ctx.moveTo(68, 16); ctx.quadraticCurveTo(52, 24, 34, 24); ctx.quadraticCurveTo(42, 42, 58, 34); ctx.quadraticCurveTo(66, 28, 68, 16); ctx.closePath();
    fillStroke('#4A1E24', C.dk, 2);
    ell(50, 31, 7, 3.5, -0.3); fillStroke('#FF8FAA');
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(60, 21); ctx.lineTo(62, 26); ctx.lineTo(64, 20); ctx.fill();
  } else {
    // 一排咬緊的牙
    ctx.beginPath(); ctx.moveTo(40, 25); ctx.quadraticCurveTo(54, 22, 66, 17); ctx.lineTo(65, 21); ctx.quadraticCurveTo(54, 27, 41, 29); ctx.closePath();
    fillStroke('#FFFFFF', C.dk, 1.6);
    ctx.strokeStyle = 'rgba(20,14,16,.45)'; ctx.lineWidth = 1;
    for (const x of [46, 52, 58]) { ctx.beginPath(); ctx.moveTo(x, 24.5 - (x - 46) * 0.3); ctx.lineTo(x, 27.5 - (x - 46) * 0.35); ctx.stroke(); }
  }
  // 冒汗＋緊張線
  if (!cheer && !smug) {
    const s = 1 + Math.sin(t * 6) * 0.06;
    ctx.save(); ctx.translate(-50, -6); ctx.scale(s, s); drawDrop(0, 0, 6); ctx.restore();
    if (Math.sin(t * 9) > -0.2) {
      ctx.strokeStyle = 'rgba(58,42,45,.5)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      [[48, -44, 58, -54], [56, -32, 70, -36], [-56, -56, -66, -66]].forEach(([a, b, c, d]) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); });
    }
  }
  ctx.restore();
}
function drawDrop(x, y, r, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.moveTo(x, y - r * 1.7);
  ctx.bezierCurveTo(x + r * 0.9, y - r * 0.4, x + r, y + r * 0.2, x + r, y + r * 0.35);
  ctx.arc(x, y + r * 0.35, r, 0, Math.PI);
  ctx.bezierCurveTo(x - r, y + r * 0.2, x - r * 0.9, y - r * 0.4, x, y - r * 1.7);
  fillStroke(C.sweat, '#5FA9D6', 1);
  ell(x - r * 0.35, y + r * 0.1, r * 0.25, r * 0.4); fillStroke('rgba(255,255,255,.85)');
  ctx.restore();
}

// ===== 粒子 =====
function spawnSweat(jx, jy) {
  const dir = Math.random() < 0.5 ? 1 : -1;
  const x = DX + (dir > 0 ? 166 + jx + 40 : 166 + jx - 50), y = 116 + jy - 40;
  parts.push({ k: 'drop', x, y, vx: dir * (40 + Math.random() * 30), vy: -70 - Math.random() * 30, age: 0, life: 0.9 });
}
function spawnDa() {
  parts.push({ k: 'da', x: 110 + Math.random() * 120, y: 212, vx: (Math.random() - 0.5) * 20, vy: -38, age: 0, life: 0.7, txt: Math.random() < 0.75 ? '噠' : '！' });
}
function spawnSparks() {
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 90 + Math.random() * 90;
    parts.push({ k: 'spark', x: 172 + DX + (Math.random() - 0.5) * 60, y: 62, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 0.9 + Math.random() * 0.4, c: CODE_COLORS[i % CODE_COLORS.length] });
  }
}
function updateParts(dt) {
  for (const p of parts) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.k !== 'da') p.vy += 260 * dt; }
  parts = parts.filter(p => p.age < p.life);
}
function drawParts() {
  for (const p of parts) {
    const a = 1 - p.age / p.life;
    if (p.k === 'drop') drawDrop(p.x, p.y, 4.5, a);
    else if (p.k === 'da') {
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = C.ink;
      ctx.font = '900 12px "PingFang TC", "Noto Sans TC", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.txt, p.x, p.y); ctx.restore();
    } else {
      ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.rotate(p.age * 6);
      ctx.fillStyle = p.c; ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    }
  }
}

// ===== 主迴圈 =====
const pctEl = document.getElementById('ld-pct'), fillEl = document.getElementById('ld-fill'), barEl = document.getElementById('ld-bar');
let cheered = false;
function frame(now) {
  const t = (now - start) / 1000;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const p = progressNow(t);
  const pr = Math.floor(p);
  pctEl.textContent = pr + '%'; fillEl.style.width = p.toFixed(2) + '%'; barEl.setAttribute('aria-valuenow', pr);

  const after = t >= endT ? (t - endT) : 0;                 // 到 100% 之後經過的秒數
  const cheer = after > 0 && after < CELEBRATE ? after : 0;  // 歡呼中
  const smugT = after >= CELEBRATE ? after - CELEBRATE : 0;  // 不屑＋挑眉中
  const raise = cheer ? smooth(Math.min(1, cheer * 3)) : (smugT ? 1 - smooth(Math.min(1, smugT * 4)) : 0);
  if (cheer > 0 && !cheered) { cheered = true; spawnSparks(); }
  const nervous = stalling(t);
  // 發抖（卡關時抖更兇）
  const amp = reduce ? 0 : (after ? 0 : (nervous ? 1.1 : 0.55));
  const jx = (Math.sin(t * 53) * 0.6 + Math.sin(t * 31) * 0.4) * amp;
  const jy = (Math.sin(t * 47) * 0.5 + Math.cos(t * 29) * 0.3) * amp + (cheer ? -Math.abs(Math.sin(cheer * 9)) * 5 : 0);
  // 打字
  const lifts = [0, 0];
  if (!after) {
    const f = reduce ? 3 : (nervous ? 12 : 8);
    typePhase += dt * f * Math.PI * 2;
    for (let s = 0; s < 2; s++) {
      const v = Math.sin(typePhase + s * Math.PI);
      lifts[s] = Math.max(0, v) * 7;
      const down = v < 0;
      if (down && !prevDown[s]) onKeyPress(s, t);
      prevDown[s] = down;
    }
    sweatTimer -= dt; if (sweatTimer <= 0 && !reduce) { spawnSweat(jx, jy); sweatTimer = nervous ? 0.28 : 0.75; }
    daTimer -= dt; if (daTimer <= 0 && !reduce) { spawnDa(); daTimer = nervous ? 0.16 : 0.32; }
  }
  updateParts(dt);

  ctx.clearRect(0, 0, W, H);
  drawBackdrop(t);
  ctx.save(); ctx.translate(DX, 0); drawTail(t, nervous ? 22 : 14); drawBody(jx); ctx.restore();
  drawDeskTop();
  drawMug(t);
  ctx.save(); ctx.translate(DX + 4, 0); drawKeyboard(t); ctx.restore();
  ctx.save(); ctx.translate(MX, 0); drawMonitor(t); ctx.restore();
  ctx.save(); ctx.translate(DX, 0); drawNeck(jx, jy); drawArms(jx, lifts, raise); drawHead(t, jx, jy, cheer, nervous, smugT); ctx.restore();
  drawParts();
  drawDeskFront();

  if (t < endT + CELEBRATE + SMUG) requestAnimationFrame(frame);
  else if (!done) {
    done = true;
    root.classList.add('ld-out');
    setTimeout(() => { root.remove(); removeEventListener('resize', fit); resolveFinished(); }, 380);
  }
}
resetState(); cheered = false;
start = performance.now(); last = start;
requestAnimationFrame(n => { start = n; last = n; frame(n); });
})();
