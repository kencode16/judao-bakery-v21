// 方塊的底色與圖（盤面、教學小圖、點單、菜單共用）
import { Art } from '../art/common.js';
import { TILE_BG, CREAM_BG, VARIANT_BG, VARIANT_NAME, splitKind } from '../config.js';
import { DESSERT_BY_ID, DRINK_BY_ID } from '../data/desserts.js';

/** 甜點＝專屬底色；飲品、鑰匙＝奶油色。
 *  v2.1「中」：'donut@blue' 這種變色方塊用 VARIANT_BG 的鮮明底色（圖還是同一個甜點） */
export function bgFor(kind) {
  const { id, variant } = splitKind(kind);
  if (variant && VARIANT_BG[variant]) return VARIANT_BG[variant];
  const d = DESSERT_BY_ID[id];
  return d ? (TILE_BG[d.bg] || CREAM_BG) : CREAM_BG;
}

/** 有沒有指定底色（變色方塊） */
export const isVariant = kind => !!splitKind(kind).variant;

/** 方塊的唸法（aria-label）：變色方塊＝「藍底甜甜圈」；其他照舊回傳代號（跟 v2.0 一樣） */
export function kindLabel(kind) {
  const { id, variant } = splitKind(kind);
  if (!variant) return kind;
  const name = DESSERT_BY_ID[id]?.name || DRINK_BY_ID[id]?.name || id;
  return `${VARIANT_NAME[variant] || ''}底${name}`;
}

/** 方塊裡的白邊貼紙圖（css＝canvas 的 CSS 尺寸） */
export function paintKind(canvas, kind, css) {
  Art.renderTile(canvas, kind, Math.max(8, Math.round(css)));
}

/** 不加白邊、直接畫原圖（果醬要半透明蓋在甜點上，不能有白邊） */
export function paintRaw(canvas, id, css) {
  const { ctx, px } = Art.fitCanvas(canvas, Math.max(8, Math.round(css)));
  ctx.clearRect(0, 0, px, px);
  ctx.drawImage(Art.raw(id, px), 0, 0);
}

/** 一個小方塊元素（教學圖、點單、菜單用）：<span class="g-mini"> */
export function miniTile(kind, size, opts = {}) {
  const el = document.createElement('span');
  el.className = 'g-mini' + (opts.cls ? ' ' + opts.cls : '');
  el.style.width = el.style.height = size + 'px';
  const full = kind === 'icing' || kind === 'gift';
  if (!full) el.style.background = bgFor(kind);
  if (isVariant(kind)) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', kindLabel(kind)); }
  const cv = document.createElement('canvas');
  el.appendChild(cv);
  if (opts.silhouette) Art.renderSilhouette(cv, kind, Math.round(size * 0.9));
  else paintKind(cv, kind, full ? size : size * 0.9);
  if (opts.jam) {
    const j = document.createElement('canvas'); j.className = 'g-jam';
    el.appendChild(j); paintRaw(j, 'jam', size);
  }
  return el;
}
