// 小圖示（inline SVG）：⇥⇤、↻ 這類符號 iPhone 的字型不一定有，改用 SVG 畫，到哪裡都一樣。
const svg = (vb, body) => `<svg class="g-svgico" viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** 往中間：兩個箭頭夾著中線 →|← */
export const ICON_CENTER = svg('0 0 30 16', '<path d="M2 8h8.5M7 4l4 4-4 4M28 8h-8.5M23 4l-4 4 4 4" stroke-width="2.6"/><path d="M15 2.5v11" stroke-width="2.2" opacity=".75"/>');
/** 輪流換方向：順時針的圓箭頭 */
export const ICON_CYCLE = svg('0 0 24 24', '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" stroke-width="3"/><path d="M19.8 3.6v4.6h-4.6" stroke-width="3"/>');
