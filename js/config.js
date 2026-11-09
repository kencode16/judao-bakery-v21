// 共用設定（主代理擁有）
export const GAME_NAME = '菊島連連烘';
export const COLS = 7;
export const MIN_TILE = 44;

/** 地區（順序就是遊玩順序）。theme：accent 主題色、soft 淡底、deep 深色字 */
export const REGIONS = [
  { id: 'fr', name: '法國', flag: '🇫🇷', levels: [1, 10], theme: { accent: '#8FB7E3', soft: '#EAF2FB', deep: '#3E5F8A' } },
  { id: 'tw', name: '台灣', flag: '🇹🇼', levels: [11, 20], theme: { accent: '#E89A6B', soft: '#FCEEE4', deep: '#9A4E27' } },
  { id: 'se', name: '義大利與南歐', flag: '🇮🇹', levels: [21, 30], theme: { accent: '#9CC48A', soft: '#EEF6E8', deep: '#4D7A3B' } },
  { id: 'us', name: '英國與美國', flag: '🇬🇧', levels: [31, 40], theme: { accent: '#C79ADB', soft: '#F5EDF9', deep: '#6E4383' } },
  { id: 'jp', name: '日本', flag: '🇯🇵', levels: [41, 50], theme: { accent: '#EE9BB0', soft: '#FDEEF2', deep: '#9B3F58' } },
];
export const REGION_BY_ID = Object.fromEntries(REGIONS.map(r => [r.id, r]));
export const levelRegion = id => REGIONS.find(r => id >= r.levels[0] && id <= r.levels[1]);

/** 甜點方塊的專屬底色 */
export const TILE_BG = {
  sky: '#CFE6F5', mint: '#CDEBDC', pink: '#F9D3DC', lavender: '#E3DAF5',
  lemon: '#FCE9A8', peach: '#F8D6C4', sage: '#E1EDC2', tea: '#EADFD2',
};
/** 飲品、鑰匙方塊的底色 */
export const CREAM_BG = '#FFF6E9';

/** v2 難度。易＝v1.1 原本的 50 關（不限時）；中＝另一套 50 關（限時、時間到失敗重來） */
export const MODES = [
  { id: 'easy', name: '易', title: '輕鬆模式', desc: '不限時，慢慢玩' },
  { id: 'mid', name: '中', title: '挑戰模式', desc: '限時・同色才能配・配錯扣 5 秒' },
];
export const MODE_BY_ID = Object.fromEntries(MODES.map(m => [m.id, m]));

/**
 * v2.1「中」：同一種甜點分 3 種底色，只有「同甜點＋同底色」才能配對。
 * 方塊代號寫成 '甜點代號@顏色'，例如 'donut@blue'。沒有 @ 的方塊照舊用甜點自己的淡色底（TILE_BG）。
 * 變色方塊用比 TILE_BG 鮮明的另一組顏色，一眼分得出來；同一個甜點的 3 色只能從 VARIANT_TRIOS 挑一組。
 */
export const VARIANT_BG = {
  blue: '#9CC8F0', pink: '#F5A9C0', yellow: '#F6D865',
  green: '#9FD9AE', purple: '#C6B0F0', orange: '#F7AE72',
};
export const VARIANT_NAME = { blue: '藍', pink: '粉', yellow: '黃', green: '綠', purple: '紫', orange: '橘' };
/** 色相差得夠開的三色組（避開粉／橘、黃／橘、藍／紫這種相近的） */
export const VARIANT_TRIOS = [
  ['blue', 'pink', 'yellow'],
  ['purple', 'yellow', 'green'],
  ['green', 'pink', 'blue'],
  ['orange', 'purple', 'green'],
];
/** 'donut@blue' → { id:'donut', variant:'blue' }；'donut' → { id:'donut', variant:null } */
export const splitKind = k => { const i = String(k).indexOf('@'); return i < 0 ? { id: String(k), variant: null } : { id: k.slice(0, i), variant: k.slice(i + 1) }; };
export const baseKind = k => splitKind(k).id;
