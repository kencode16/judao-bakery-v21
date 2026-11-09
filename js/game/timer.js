// 「中」限時關的倒數計時（v2，2026-11-09）。只有 levelDef 有 timeLimit 時才會用到；「易」完全不經過這裡。
// 時間一律用 now()（performance.now() 為底）重新算「已經用掉多少」，不靠 setInterval 一秒一秒累加。
// 暫停用「理由」記：暫停選單、今日菜單、切到背景、自動重排動畫…只要還有一個理由在，時間就不走。

export const LOW_RATIO = 0.3;    // 剩不到三成：轉金色、熄一顆星
export const FINAL_SEC = 10;     // 最後 10 秒：粉紅脈動、每秒滴答
export const PENALTY_SEC = 5;    // v2.1：配錯扣 5 秒
export const DMG_MS = 650;       // v2.1：扣秒紅段的動畫長度（變紅、閃一下、往左縮掉淡出）

/** v2.1：tryMatch 失敗的哪些原因算「配錯」要扣秒。
 *  notPair（不是一對）、noPath（連不到）＝扣；same（點同一格＝取消選取）、locked（果醬、禮盒、空格）等＝不扣 */
export const isPenalized = reason => reason === 'notPair' || reason === 'noPath';

/** 毫秒 → m:ss（無條件進位：還剩 0.3 秒顯示 0:01，到 0 才是 0:00） */
export function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000 - 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 純邏輯倒數（不碰 DOM）：start、hold/release、stop、update() 每一幀呼叫 */
export class Countdown {
  /**
   * @param limitSec 限時（秒）
   * @param opts { now(): 毫秒, onLow(rem), onSecond(sec, rem), onTimeUp() }
   */
  constructor(limitSec, opts = {}) {
    this.limit = Math.max(1, Number(limitSec) || 0) * 1000;
    this.now = opts.now || (() => performance.now());
    this.cb = opts;
    this.used = 0;          // 之前幾段已經用掉的毫秒
    this.since = null;      // 目前這一段從什麼時候開始走（null＝停著）
    this.started = false;
    this.done = false;      // 時間到，或過關後凍結
    this.holds = new Map(); // 暫停理由 → 次數
    this.low = false;
    this.lastSec = null;
    this.penalties = 0;     // v2.1：配錯被扣了幾次
  }
  get running() { return this.started && !this.done && this.holds.size === 0; }
  elapsed() { return this.used + (this.since != null ? this.now() - this.since : 0); }
  remaining() { return Math.max(0, this.limit - this.elapsed()); }
  ratio() { return this.remaining() / this.limit; }

  /** 依目前狀態，開始或結束「這一段」 */
  _sync() {
    const run = this.running;
    if (run && this.since == null) this.since = this.now();
    else if (!run && this.since != null) { this.used += this.now() - this.since; this.since = null; }
  }
  start() { if (this.started) return; this.started = true; this._sync(); this.update(); }
  hold(reason) { this.holds.set(reason, (this.holds.get(reason) || 0) + 1); this._sync(); }
  release(reason) {
    const n = (this.holds.get(reason) || 0) - 1;
    if (n > 0) this.holds.set(reason, n); else this.holds.delete(reason);
    this._sync();
  }
  /** 開關型的理由（例如切到背景）：on＝暫停 */
  setHeld(reason, on) { if (on) this.holds.set(reason, 1); else this.holds.delete(reason); this._sync(); }
  isHeld(reason) { return reason ? this.holds.has(reason) : this.holds.size > 0; }
  /** 正在走的這一段跳過 ms（裝置睡著、沒收到 visibilitychange 時的保險）。
   *  最多跳到「現在」：這一段如果是剛剛才開始的（例如剛從背景回來），不會反而多送時間 */
  skip(ms) { if (this.since != null && ms > 0) this.since = Math.min(this.now(), this.since + ms); }
  /** 過關：把時間凍結在這一刻 */
  stop() { if (this.done) return; this.update(); this.done = true; this._sync(); }
  /**
   * v2.1 配錯扣秒：剩餘時間直接少 sec 秒（不管有沒有暫停理由，扣了就是扣了）。
   * 剩不到 sec 秒＝立刻時間到（onTimeUp）；跌破三成一樣會 onLow（三星判斷跟著算）。
   * 跳過去的那幾秒不補滴答（onSecond 不會因為扣秒而連響）。
   * 回傳 { before, after }（毫秒）；還沒開始或已經結束（時間到、過關）回傳 null，不扣。
   */
  penalize(sec = PENALTY_SEC) {
    if (!this.started || this.done) return null;
    const before = this.remaining();
    this.used += Math.max(0, Number(sec) || 0) * 1000;
    this.penalties++;
    const after = this.remaining();
    this.lastSec = Math.max(0, Math.ceil(after / 1000 - 1e-6));
    this.update();
    return { before, after };
  }
  /** 測試用：直接把剩餘時間設成 sec 秒 */
  setRemaining(sec) {
    this.used = this.limit - Math.max(0, sec) * 1000;
    if (this.since != null) this.since = this.now();
    if (sec * 1000 >= this.limit * LOW_RATIO) this.low = false;
    return this.update();
  }

  /** 每一幀呼叫：回傳剩餘毫秒；越過三成、換秒、時間到時通知 */
  update() {
    const rem = this.remaining();
    if (this.done) return rem;
    if (!this.low && rem < this.limit * LOW_RATIO) { this.low = true; this.cb.onLow && this.cb.onLow(rem); }
    const sec = Math.max(0, Math.ceil(rem / 1000 - 1e-6));
    if (sec !== this.lastSec) {
      const first = this.lastSec == null;
      this.lastSec = sec;
      if (!first && this.started) this.cb.onSecond && this.cb.onSecond(sec, rem);
    }
    if (rem <= 0 && this.started) {
      this.done = true; this._sync();
      this.cb.onTimeUp && this.cb.onTimeUp();
    }
    return rem;
  }
}

/** 倒數條的 HTML（HUD 和教學卡的示意圖共用） */
export function timerBarHTML(ratio = 1, text = '') {
  return `<span class="g-tbar"><i style="width:${Math.max(0, Math.min(1, ratio)) * 100}%"></i>` +
    `<em class="g-tmark" style="left:${LOW_RATIO * 100}%">★</em></span><span class="g-ttime">${text}</span>`;
}

/** HUD 上的倒數：細長條＋m:ss。剩三成以下金色、最後 10 秒粉紅脈動 */
export class TimerHud {
  constructor(el, limitSec) {
    this.el = el;
    this.limit = limitSec * 1000;
    el.innerHTML = timerBarHTML(1, fmtTime(this.limit));
    el.setAttribute('role', 'timer');
    this.bar = el.querySelector('.g-tbar');
    this.fill = el.querySelector('.g-tbar i');
    this.mark = el.querySelector('.g-tmark');
    this.text = el.querySelector('.g-ttime');
    this.last = { p: -1, t: '', st: '' };
    this.speed = 1;   // 動畫加速（?gspeed=，測試用）
    this.dmg = new Set();   // 正在播的扣秒紅段（連續配錯時可能同時好幾段）
  }
  render(rem) {
    const p = Math.round(Math.max(0, Math.min(1, rem / this.limit)) * 1000) / 1000;
    if (p !== this.last.p) { this.last.p = p; this.fill.style.width = `${p * 100}%`; }   // 用寬度不用 scaleX：圓頭才不會被壓扁
    const t = fmtTime(rem);
    if (t !== this.last.t) { this.last.t = t; this.text.textContent = t; this.el.setAttribute('aria-label', `剩下 ${t}`); }
    const st = rem <= 0 ? 'out' : rem <= FINAL_SEC * 1000 + 1e-6 ? 'final' : rem < this.limit * LOW_RATIO ? 'low' : 'ok';
    if (st !== this.last.st) {
      this.last.st = st;
      this.el.classList.toggle('g-low', st !== 'ok');
      this.el.classList.toggle('g-final', st === 'final');
      this.el.classList.toggle('g-out', st === 'out');
    }
  }
  /** 最後 10 秒每秒輕輕跳一下（跟滴答聲同步） */
  pulse() {
    try {
      this.text.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: 0.3 }, { transform: 'scale(1)' }],
        { duration: 450, easing: 'ease-out' });
    } catch (e) { /* 不支援動畫就算了 */ }
  }
  /**
   * v2.1 配錯扣秒的「血條」動畫：
   * 綠色本體馬上縮到新長度；原本最右端被扣掉的那一段（before→after）先變紅、閃一下，再往左縮掉並淡出。
   * 紅段墊在綠色本體下面、從最左邊畫到舊的長度，所以露出來的剛好是被扣掉的那段；
   * 每次配錯各自一段、各自播完各自移除，連續配錯不會互相蓋掉。旁邊再飄一個紅色「−5」。
   */
  damage(beforeMs, afterMs, sec = PENALTY_SEC) {
    const clamp = v => Math.max(0, Math.min(1, v));
    const p0 = clamp(beforeMs / this.limit) * 100, p1 = clamp(afterMs / this.limit) * 100;
    this.render(afterMs);
    const dur = DMG_MS / this.speed;
    const seg = document.createElement('b');
    seg.className = 'g-tdmg';
    seg.style.width = p0 + '%';
    this.bar.insertBefore(seg, this.fill);
    this.dmg.add(seg);
    const kill = () => { if (this.dmg.delete(seg)) seg.remove(); };
    const minus = document.createElement('span');
    minus.className = 'g-tminus';
    minus.textContent = `−${sec}`;
    minus.setAttribute('aria-hidden', 'true');
    this.el.appendChild(minus);
    const killMinus = () => minus.remove();
    try {
      // 跟 CSS 一樣的內陰影（上緣亮線＋右端白線：連續配錯時一段一段分得出來），再加閃一下的紅光
      const base = 'inset 0 1px 0 rgba(255,255,255,.45), inset -1.5px 0 0 rgba(255,255,255,.85)';
      const glow = `${base}, 0 0 7px 2px rgba(232,64,90,.75)`, none = `${base}, 0 0 0 0 rgba(232,64,90,0)`;
      const a = seg.animate([
        { width: `${p0}%`, opacity: 1, filter: 'brightness(1)', boxShadow: none },
        { width: `${p0}%`, opacity: 1, filter: 'brightness(1.7)', boxShadow: glow, offset: 0.12 },
        { width: `${p0}%`, opacity: 1, filter: 'brightness(1)', boxShadow: none, offset: 0.26 },
        { width: `${p0}%`, opacity: 1, filter: 'brightness(1)', boxShadow: none, offset: 0.4 },
        { width: `${p1}%`, opacity: 0, filter: 'brightness(1)', boxShadow: none },
      ], { duration: dur, easing: 'ease-in', fill: 'forwards' });
      a.onfinish = kill; a.oncancel = kill;
      const m = minus.animate([
        { transform: 'translate(0, 4px) scale(.6)', opacity: 0 },
        { transform: 'translate(0, -2px) scale(1.15)', opacity: 1, offset: 0.18 },
        { transform: 'translate(0, -6px) scale(1)', opacity: 1, offset: 0.55 },
        { transform: 'translate(0, -16px) scale(1)', opacity: 0 },
      ], { duration: dur * 1.45, easing: 'ease-out', fill: 'forwards' });
      m.onfinish = killMinus; m.oncancel = killMinus;
      this.text.animate([{ color: '#E0405A', transform: 'scale(1.18)' }, { color: '#E0405A', transform: 'scale(1)', offset: 0.5 }, { transform: 'scale(1)' }],
        { duration: dur, easing: 'ease-out' });
    } catch (e) {
      // 不支援 Web Animations：紅段和「−5」直接亮著，時間到就拿掉
      setTimeout(kill, dur); setTimeout(killMinus, dur * 1.45);
    }
    return seg;
  }
  /** 熄星那一刻，倒數條上的小星星也暗下來 */
  dropMark() {
    try {
      this.mark.animate([{ transform: 'translate(-50%,-50%) scale(1.5)' }, { transform: 'translate(-50%,-50%) scale(1)' }],
        { duration: 420, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    } catch (e) { /* 忽略 */ }
  }
}
