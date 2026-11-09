# A 引擎：`js/engine/board.js` 用法

純邏輯、不碰 DOM，瀏覽器和 Node 都能 `import`。規則合約以 `架構.md`「A 引擎」為準，這份只講怎麼用。

## 最常用的流程

```js
import { createBoard } from './js/engine/board.js';   // 也可以 import createBoard from …（default export）
import { LEVELS } from './js/data/levels.js';

const b = createBoard(LEVELS[0]);            // seed 省略時用 levelDef.seed
// const b = createBoard(levelDef, { seed: 123 });   // 重玩想換盤面就給別的 seed

// 1. 畫盤面
for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
  const cell = b.cell(r, c);        // { hole, icing, jam, gift, tile }
  // cell.hole → 不畫格子；cell.icing → 畫糖霜磚；cell.gift → 畫禮盒（不要露出 tile.kind）
  // cell.tile → { id, kind, isDrink, isKey }；cell.jam → 甜點上面再疊一層果醬
}
// 或一次拿全部 tile：b.tiles() → [{ id, kind, isDrink, isKey, r, c, jam, gift }]

// 2. 提示
const hint = b.findHint();          // { a:[r,c], b:[r,c], path } 或 null
// 點單關優先挑能推進點單的；有鑰匙時鑰匙優先

// 3. 玩家點了兩格
if (b.canSelect(r, c)) { /* 可以選（有 tile、沒果醬、不是禮盒） */ }
const res = b.tryMatch([r1, c1], [r2, c2]);
if (!res.ok) {
  // res.reason：'same' 點同一格 | 'notPair' 不是一對 | 'noPath' 連不到 | 'locked' 果醬／禮盒／空格
  //             | 'over' 已經過關（多出來的一種，正常不會遇到）
  // 失敗不會改變任何狀態
} else {
  drawCream(res.path);              // [[r,c], …] 2～4 點，可能經過外圍 r=-1/rows、c=-1/cols
  for (const s of res.steps) {      // 依序播動畫
    switch (s.type) {
      case 'match':    /* s.a {r,c,id}、s.b、s.kind、s.path：兩個被吃掉 */ break;
      case 'jam':      /* s.cells [[r,c]…]：這些格的果醬融化 */ break;
      case 'giftOpen': /* s.tiles [{r,c,id,kind}]：禮盒打開、tile 現身 */ break;
      case 'order':    /* s.index 第幾張單、s.kind、s.got/s.need、s.done＝整張完成 */ break;
      case 'slide':    /* s.moves [{id, from:[r,c], to:[r,c]}]：FLIP 動畫；s.dir 這次的方向（見下面「滑動」） */ break;
      case 'shuffle':  /* s.tiles [{id,r,c,kind}]：每個位置的新 kind（id 跟著位置不動） */ break;
      case 'jamClear': /* s.cells：重排救不了，全部果醬融化 */ break;
      case 'win':      /* 過關 */ break;
    }
  }
}
b.status;       // 'playing' | 'won'
b.remaining;    // 剩下幾個 tile（含禮盒裡的）
```

### steps 的順序

`match` → `jam` → `giftOpen`（鑰匙）→ `order` → （過關就 `win` 然後結束）→ `slide` → 卡死處理（`shuffle`，或 `jamClear` 再 `shuffle`；極少數情況還有保底，見下面「卡死保底」）。

畫面只要照順序播就好，不需要自己算規則。播完以後 `b.tiles()` 就是最新狀態（測試有逐步比對過）。

## 其他狀態

| 名稱 | 說明 |
|---|---|
| `b.rows`、`b.cols` | 盤面大小；座標 `[r, c]`，r=0 最上面 |
| `b.orders` | `null` 或 `[{ items:[{ kind, need, got }], done }]`（每次讀都是新的副本） |
| `b.pairing` | D 關 |
| `b.pairOf(kind)` | D 關：甜點 → 飲品代號、飲品 → 甜點代號；非 D 關回傳 kind 本身；`'key'` → `'key'` |
| `b.newKind` | 本關新甜點代號或 `null` |
| `b.slide` | 本關滑動設定（`'none'`、`'down'`、`'up'`、`'left'`、`'right'`、`'center'`、`'cycle'`） |
| `b.slideDir` | **下一次**滑動會用的方向（`'down'`、`'up'`、`'left'`、`'right'`、`'center'`；不是滑動關回 `null`）。`cycle` 關每次配對成功後會變，畫面可以在每次 `tryMatch` 後讀它來更新「下一次往哪滑」的提示 |
| `b.hasMove()` | 目前有沒有能連的一組 |
| `b.clone()` | 獨立副本（含亂數狀態，副本之後的重排和本體一樣） |

`b.cell(r, c)` 在盤面外（含外圍虛擬格）回傳 `{ hole:true, …, tile:null, outside:true }`。

## 滑動（`slide`）

每次配對成功（而且還沒過關）後滑一次；**過關那一步不滑**。固定不動的格子：糖霜磚、蓋果醬的 tile、禮盒，它們把一行（或一列）切成幾段，各段自己擠；hole 不是位置，tile 直接跳過它。開局（非 `layout` 模式）會先用 `slideDir` 擠緊一次，不產生事件。

| `slide` | 規則 |
|---|---|
| `'down'`／`'up'`／`'left'`／`'right'` | 每一直行（或橫列）往那個方向擠緊，順序不變 |
| `'center'` | 往中間靠攏，見下 |
| `'cycle'` | 每消一次換方向：依序 `down → left → up → right → down…`。每次配對成功後用「目前方向」（`slideDir`）滑，然後換下一個。開局擠緊用 `down`，不算換方向（所以第一次配對也是 `down`）。這次沒有東西動也照樣換方向。`clone()` 會帶著目前方向 |

### 往中間靠攏（`'center'`）的精確定義

每一橫列各自處理，先照固定格切段、跳過 hole（跟其他方向一樣）。每一段裡的位置依欄號分三種（用兩倍座標比，偶數欄也適用）：

- **左半**：`2c < cols − 1`（7 欄：c = 0、1、2）→ 這些 tile 往右擠
- **右半**：`2c > cols − 1`（7 欄：c = 4、5、6）→ 往左擠
- **正中間**：`2c = cols − 1`（只有奇數欄才有；7 欄是 c = 3）

左右兩群各自保持順序，貼著中間排好。正中間那格：

1. 上面**有 tile** → 不動，左群貼在它左邊、右群貼在它右邊。
2. **空著** → 這一段裡 tile **比較多的那一邊**，離中間最近的那塊補進正中間（整群跟著往中間挪一格）；**兩邊一樣多就讓它空著**。

這樣定義是**左右鏡像對稱**的（鏡像盤面滑完＝滑完再鏡像，測試有驗證）：不會偏袒左邊或右邊，兩邊一樣多時畫面也是對稱的（例：`..q.p..` 不動）。偶數欄沒有正中間格，左半全部擠到 `cols/2 − 1`、右半擠到 `cols/2`。

例（7 欄，一列一例；`I`＝糖霜磚、`J`＝蓋果醬的 tile、`#`＝hole）：

| 滑動前 | 滑動後 | 說明 |
|---|---|---|
| `a.b..c.` | `..abc..` | 左 2、右 1，中間空 → 左邊的 b 補進中間 |
| `..q.p..` | `..q.p..` | 左右一樣多 → 中間空著 |
| `x......` | `...x...` | 只有左邊 → 補進中間 |
| `ab.c..e` | `.abce..` | 中間有 c → 不動，兩邊貼著它 |
| `g.Ih.k.` | `.gIhk..` | c=2 糖霜磚切段：左段 c0～1 往右；右段 c3～6 含中間，h 已在中間，k 貼過去 |
| `m.#.n.o` | `.m#no..` | c=2 是 hole：左半只剩 c0、c1；右邊比較多 → n 補進中間 |
| `.u.Jv..` | `..uJv..` | 中間蓋果醬（固定）：左段往右擠到 c2；右段 c4～6 往左 |

### `slide` 事件的 `dir`

`{ type:'slide', moves, dir }`：`dir` 是這次實際用的方向（`'down'|'up'|'left'|'right'|'center'`；`cycle` 關也是寫實際方向，不會是 `'cycle'`）。卡死保底的搬移（見下面「卡死保底」）是 `dir:'rescue'`，任何關卡都可能出現。

## 變色方塊（v2.1「中」）

方塊代號可以寫成 `'甜點代號@顏色'`（例 `'donut@blue'`），顏色是 `js/config.js` 的 `VARIANT_BG` 其中一個。
引擎**只比對完整的方塊代號**：`'donut@blue'` 只能配 `'donut@blue'`，配 `'donut@pink'` 回 `{ ok:false, reason:'notPair' }`（不改狀態）。

| 地方 | 用什麼 |
|---|---|
| `kinds`、`counts` 的鍵、點單 `orders[].kind` | 完整方塊代號（`'donut@blue'`） |
| `b.tiles()`、`b.cell().tile.kind`、`match`／`order`／`shuffle`／`giftOpen` 事件的 `kind` | 完整方塊代號 |
| `b.pairOf('donut@blue')`（非 D 關） | `'donut@blue'`（自己） |
| `newDessert`、`unlocks`、`b.newKind` | 甜點代號（不分顏色） |
| 查甜點資料（D 關的飲品） | `baseKind(k)`（`js/config.js`） |

- 發牌、重排、提示、點單都照方塊代號：每個方塊代號是獨立的一種（`counts` 沒給時平均分對數），重排只交換代號、**每種的數量不變**，提示只會給同代號的一組，點單關優先挑點單要的那個顏色。
- `levelDef.variants`（選填，`{ donut: ['blue','pink','yellow'], … }`，沒分色＝`{}`）：有給就檢查它和 `kinds` 一致；配對本身不看它。
- 會丟錯誤的寫法：顏色不在 `VARIANT_BG`、`'@blue'`／`'donut@'` 這種格式、同一關同時有 `'donut'` 和 `'donut@blue'`、`variants` 列的顏色 `kinds` 沒有（或反過來）、**D 關分色**、點單寫原本的甜點代號但那個甜點已經分色（錯誤訊息會提示要寫方塊代號）。
- 三色要從 `VARIANT_TRIOS` 挑、每關幾種分色這些是關卡設計規則，由 `tools/sim.mjs --set mid` 檢查，引擎不管。

## 開局「放一起」上限（v2.1「中」，`levelDef.openAdjMax`）

`openAdjMax: 2` ＝開局盤面上「放一起」的可配一對最多 2 組（「中」50 關都設 2）。**沒有這個欄位（或 `null`）＝完全照舊**：發牌、亂數狀態、之後整局都和以前一模一樣（`tests/engine/openadj.test.mjs` 用改動前的指紋比對易 50 關）。

- 「放一起」：兩格是可配的一對（同代號；D 關＝甜點和它的飲品；鑰匙＝兩把鑰匙），而且**上下左右緊貼**，或**同一列／同一行中間只隔著 hole**（開局留空的格子也當作沒東西，跟 hole 一樣；「中」的關卡開局沒有空格）。禮盒裡的、蓋果醬的也算；對角、隔著糖霜磚或別的方塊都不算。組數是「一對一對」算的（`a a a` 一排＝2 組）。
- 時機：發牌 → 滑動關開局擠緊 → **修正** → 開局保證有步。只交換 kind，位置、id、數量、擠緊的樣子都不變；鑰匙不會換進果醬或禮盒。
- 做法：用 board 的 seeded rng 做 min-conflicts（挑一組放一起的，和隨機另一格交換，組數變少才接受），直到組數 ≤ 上限**而且至少有一步**；同 seed 同盤（時間到「再試一次」是同一盤）。最多 4,000 輪，真的做不到（例如只有 1 種）就停，之後的開局保底照樣保證有步。
- 只管開局；遊戲中的自動重排不受限。
- 診斷（非正式 API）：`b._diag.openAdj = { max, before, after, swaps, ok }`（`before`＝修正前、`after`＝真正的開局盤面）；`b._openAdjCount()` 數目前盤面有幾組。
- `openAdjMax` 不是 0 以上的整數會丟錯誤。

## 給 E（關卡模擬器）

```js
const b = createBoard(levelDef, { seed });
let moves = 0, shuffles = 0;
while (b.status === 'playing') {
  const h = b.findHint();                 // 貪心策略；隨機策略可以自己從 b.tiles() 挑兩個 tryMatch
  if (!h) throw new Error('救不了');       // 正常不會發生：引擎每步後都會保證有步
  const res = b.tryMatch(h.a, h.b);
  moves++;
  shuffles += res.steps.filter(s => s.type === 'shuffle').length;
}
```

- `createBoard` 遇到關卡設計錯誤會丟 `Error`（訊息有關卡編號）：mask 長度、座標超出、障礙疊在同一格、counts 不是偶數、盤面放不下、果醬＋禮盒格比甜點多、點單要的對數盤面上不夠、D 關兩個甜點配同一種飲品等。
- 發牌：可放 tile 的格子＝非 hole、非糖霜磚。格子數是奇數（或 counts 總數比格子少）時，多的格子留空（隨機挑一般格）；滑動關開局會先擠緊。
- D 關的 `counts[甜點]` 是這個甜點的張數（飲品同樣張數），不必是偶數。點單在 D 關算甜點的代號。
- 診斷用（非正式 API）：`b._diag = { shuffle, jamClear, giftForce, moveForce, stuck, opening }`。
  - `moveForce`／`giftForce` 是規則以外的保底（見下）。`moveForce` 偶爾出現可以接受（糖霜關的殘局）；`giftForce` 出現代表禮盒放法有死角。
  - `stuck > 0` 代表引擎也救不了（例如糖霜磚把格子完全隔開），這關一定要改。
  - `opening`：開局為了保證有步用了哪一招（`null` 最好；`'shuffle'` 正常；`'jamClear'`、`'move'`、`'giftOpen'` 代表開局果醬／禮盒／糖霜放得太滿）。

### 卡死保底（規則以外，只在極端狀況發生）

`架構.md` 規定：重排 200 次 → 果醬全融再試。但「重排」只換 kind、不換位置，有一種情況它救不了：
**最後剩幾塊時，糖霜磚（＋空洞）把它們隔成要三個彎才連得到**（例：第 34 關中央空洞＋四塊糖霜，200 局裡有 5 局最後 2 塊連不到）。
所以引擎另外加了保底，確保「不會出現救不了的狀態」：

1. 重排 200 次都失敗、但其實排得出來 → 直接把一對放到連得到的兩個位置（仍是 `shuffle` 事件）。
2. 果醬全融後還是不行 → **把一塊 tile 搬到「和它夥伴連得到」的最近空格**（`slide` 事件、`dir:'rescue'`，`moves` 通常 1 個，偶爾 2 個）。
   有禮盒的關卡也先用搬的（例如搬鑰匙），禮盒照樣要用鑰匙開。
3. 還是不行（例如鑰匙被禮盒整圈包住、旁邊沒有空格）→ 禮盒全部打開（`giftOpen` 事件，鑰匙留著當普通一對）。

**給 C：`slide` 事件在不是滑動關的關卡也可能出現（上面第 2 點），`giftOpen` 也可能出現在 `shuffle`／`jamClear` 後面。照順序播就對了。**

## 效能（`tests/engine/bench.mjs`，8 列 × 7 欄，Apple M2，Node 24）

| 呼叫 | 平均 |
|---|---|
| `hasMove()` | 約 3～7 µs（沒有步、要全部掃完：約 2 µs） |
| `findHint()` | 約 4～6 µs |
| `clone()` | 約 1～3 µs |
| `tryMatch()`（含滑動、卡死檢查） | 約 5～19 µs |
| `createBoard()` | 約 0.02～0.03 ms |
| 一整局（建盤＋照提示玩到過關） | 約 0.2～0.4 ms |

E 的 50 關 × 100 seed × 2 種策略（10,000 局）約 2.7 秒。

## 測試

```
cd 專案根目錄
/opt/anaconda3/envs/hermes3d/bin/node --test "tests/engine/*.test.mjs"
/opt/anaconda3/envs/hermes3d/bin/node tests/engine/bench.mjs      # 效能數字
```

| 檔案 | 內容 |
|---|---|
| `path.test.mjs` | 路徑和 BFS 參考實作（Dijkstra on 格子＋方向）、樣品 findPath 交叉驗證 3 萬組（外圍、hole、糖霜磚、果醬、禮盒）；tryMatch／hasMove／findHint 和 BFS 一致 |
| `rules.test.mjs` | 發牌、錯誤檢查、失敗不改狀態、果醬、禮盒鑰匙、滑動四方向＋往中間＋輪流（手寫＋隨機對參考實作、center 鏡像對稱、cycle 順序與 clone）、點單、D 關、重排、jamClear、保底（`dir:'rescue'`）、同 seed、clone、易／中 100 關整合 |
| `play.test.mjs` | 隨機關卡（含 center、cycle）2,100 局實玩到過關，每一步用 steps 重播比對盤面、檢查永遠有步、滑動關一直擠緊、`dir` 和 `slideDir` 一致 |
| `openadj.test.mjs` | 開局「放一起」上限：沒有欄位時和改動前逐盤一樣（`fixtures/opening_before_openadj.json`，改動前產生、不要重新產生）、中 50 關 × 30 seed 都 ≤ 2 組、同 seed 同盤、定義（hole、空格、糖霜磚、對角、D 關、鑰匙、禮盒、果醬）、D／禮盒／點單／果醬／滑動關、做不到時不卡死 |
| `variants.test.mjs` | v2.1 變色方塊：同甜點不同色＝`notPair`、同色能配、提示只給同色、開局卡死重排、counts 用方塊代號、重排後數量守恆、點單用變色代號、錯誤寫法、隨機分色關卡實玩（steps 重播、數量守恆）、「中」50 關 kinds／counts／variants／點單一致 |
| `helpers.mjs` | 共用：BFS、樣品 findPath 移植、路徑檢查、steps 重播（mirror）、滑動參考實作 `refSlide`／`isPacked` |
