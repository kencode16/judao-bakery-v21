// C 測試用關卡（不是正式關卡）：index.html?screen=level&test=<名稱>&nosw
// 每種機制一關，方便截圖檢查；過關時不寫存檔，解鎖卡直接用 unlocks 示範。
import { DESSERTS } from '../data/desserts.js';
const SIX = ['croissant', 'macaron', 'pineapplecake', 'eggtart', 'donut', 'shortcake'];
const base = { cols: 7, mask: null, counts: null, newDessert: null, unlocks: [], slide: 'none', icing: [], jam: [], gifts: [], orders: null, pairing: false, tip: null };

export const TEST_LEVELS = {
  // 基本＋開店禮 6 張解鎖卡
  basic: { ...base, id: 1, region: 'fr', rows: 4, kinds: SIX, unlocks: SIX, tip: 'basic', seed: 1001 },
  // B 造型盤面＋新甜點
  mask: { ...base, id: 3, region: 'fr', rows: 6, kinds: ['croissant', 'macaron', 'eggtart', 'donut', 'shortcake', 'eclair'],
    mask: ['#.....#', '.......', '.......', '#.....#', '##...##', '###.###'], newDessert: 'eclair', unlocks: ['eclair'], tip: 'shape', shapeName: '愛心盤', seed: 31 },
  // A 滑動補位（往下）
  slide: { ...base, id: 12, region: 'tw', rows: 5, kinds: ['croissant', 'macaron', 'pineapplecake', 'eggtart', 'donut', 'shortcake'],
    slide: 'down', tip: 'slide', newDessert: 'suncake', unlocks: ['suncake'], seed: 1201 },
  slideleft: { ...base, id: 13, region: 'tw', rows: 6, kinds: SIX, slide: 'left', tip: 'slide', seed: 1301,
    mask: ['.......', '...#...', '.......', '.......', '...#...', '.......'] },
  // C 糖霜磚
  icing: { ...base, id: 21, region: 'se', rows: 5, kinds: SIX, icing: [[1, 1], [1, 5], [3, 3]], tip: 'icing', seed: 2101 },
  // C 果醬
  jam: { ...base, id: 22, region: 'se', rows: 6, kinds: SIX, jam: [[0, 0], [0, 6], [2, 3], [3, 3], [5, 1], [5, 5]], tip: 'jam', seed: 2201 },
  // C 禮盒＋鑰匙
  gift: { ...base, id: 23, region: 'se', rows: 6, kinds: SIX, gifts: [[0, 3], [2, 1], [2, 5], [5, 3]], tip: 'gift', seed: 2301 },
  // E 點單
  order: { ...base, id: 31, region: 'us', rows: 6, kinds: SIX, tip: 'order', seed: 3101,
    orders: [[{ kind: 'croissant', n: 2 }, { kind: 'macaron', n: 1 }], [{ kind: 'eggtart', n: 2 }], [{ kind: 'donut', n: 1 }, { kind: 'shortcake', n: 1 }]] },
  // D 甜點配飲品
  pairing: { ...base, id: 10, region: 'fr', rows: 4, kinds: ['croissant', 'macaron', 'eggtart', 'donut'], pairing: true, tip: 'pairing', seed: 1010 },
  // 最大盤面 8 列（版面檢查）
  big: { ...base, id: 48, region: 'jp', rows: 8, kinds: ['croissant', 'macaron', 'pineapplecake', 'eggtart', 'donut', 'shortcake', 'matcharoll', 'baguette'],
    slide: 'up', seed: 4801, orders: null },
  // 種類很多、很容易卡死（測自動重排）
  stuck: { ...base, id: 49, region: 'jp', rows: 8, seed: 4901, kinds: DESSERTS.slice(0, 28).map(d => d.id) },
  // v2「中」：限時（9 列、往下掉）、限時點單、往中間、輪流換方向（後兩種要等引擎支援 center／cycle）
  timed: { ...base, id: 12, region: 'tw', rows: 9, kinds: SIX, slide: 'down', tip: 'slide', timeLimit: 90, seed: 1202 },
  timedorder: { ...base, id: 32, region: 'us', rows: 8, kinds: SIX, tip: 'order', timeLimit: 60, seed: 3201,
    orders: [[{ kind: 'croissant', n: 2 }, { kind: 'macaron', n: 1 }], [{ kind: 'eggtart', n: 2 }], [{ kind: 'donut', n: 1 }]] },
  center: { ...base, id: 33, region: 'us', rows: 9, kinds: SIX, slide: 'center', tip: 'center', timeLimit: 120, seed: 3301 },
  cycle: { ...base, id: 41, region: 'jp', rows: 9, kinds: SIX, slide: 'cycle', tip: 'cycle', timeLimit: 120, seed: 4101 },
  // v2.1「中」：同甜點分 3 色（'甜點@顏色'，只有同甜點＋同底色能配）＋配錯扣 5 秒
  variant: { ...base, id: 5, region: 'fr', rows: 9, slide: 'down', timeLimit: 60, seed: 5105,
    kinds: ['croissant', 'macaron', 'eggtart', 'donut@blue', 'donut@pink', 'donut@yellow', 'shortcake@purple', 'shortcake@yellow', 'shortcake@green'],
    variants: { donut: ['blue', 'pink', 'yellow'], shortcake: ['purple', 'yellow', 'green'] } },
  // 分色＋點單（點單卡畫出指定底色）
  variantorder: { ...base, id: 34, region: 'us', rows: 8, tip: 'order', timeLimit: 60, seed: 3405,
    kinds: ['croissant', 'macaron', 'eggtart', 'donut@blue', 'donut@pink', 'donut@yellow', 'shortcake'],
    variants: { donut: ['blue', 'pink', 'yellow'] },
    orders: [[{ kind: 'donut@blue', n: 2 }, { kind: 'macaron', n: 1 }], [{ kind: 'donut@pink', n: 1 }, { kind: 'eggtart', n: 1 }], [{ kind: 'donut@yellow', n: 1 }]] },
  // 分色很多（第 5 區的量：9 種、5～6 種分色）＋新甜點也分色（剪影）＋禮盒（打開後是變色方塊）
  variantmany: { ...base, id: 45, region: 'jp', rows: 9, slide: 'cycle', timeLimit: 90, seed: 4505,
    newDessert: 'dorayaki', unlocks: ['dorayaki'], gifts: [[0, 3], [4, 0], [4, 6]],
    kinds: ['croissant', 'macaron@blue', 'macaron@pink', 'macaron@yellow', 'eggtart@purple', 'eggtart@yellow', 'eggtart@green',
      'donut@green', 'donut@pink', 'donut@blue', 'shortcake@orange', 'shortcake@purple', 'shortcake@green',
      'dorayaki@blue', 'dorayaki@pink', 'dorayaki@yellow', 'pineapplecake', 'matcharoll', 'baguette'],
    variants: { macaron: ['blue', 'pink', 'yellow'], eggtart: ['purple', 'yellow', 'green'], donut: ['green', 'pink', 'blue'],
      shortcake: ['orange', 'purple', 'green'], dorayaki: ['blue', 'pink', 'yellow'] } },
};
