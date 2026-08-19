// 品牌圖示：差分 via（含 GND 環）→ 掃描 → Pareto 取捨曲線。
// 一句話：「把 via 幾何掃一遍，找出取捨曲線上的最佳設計」。
// 46px 可讀性規則：線寬 ≥1.6、最小元素 ≥3px、元素 ≤12、沿用介面語意色。
export default function BrandMark({ height = 46 }: { height?: number }) {
  const width = (height * 72) / 46;
  return (
    <svg
      className="brandmark"
      width={width}
      height={height}
      viewBox="0 0 72 46"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Via Optimization Wizard"
    >
      {/* ── 來源：差分 via 俯視 ── */}
      {/* keep-out 虛線 */}
      <ellipse
        cx="14" cy="23" rx="12.5" ry="19"
        fill="none" stroke="#d29922" strokeWidth="1.6"
        strokeDasharray="3.5 2.5" opacity="0.75"
      />
      {/* P / N 訊號 via：antipad 圈＋pad */}
      <circle cx="14" cy="15" r="6" fill="rgba(88,166,255,0.18)" stroke="#58a6ff" strokeWidth="1.6" />
      <circle cx="14" cy="15" r="3" fill="#58a6ff" />
      <circle cx="14" cy="31" r="6" fill="rgba(88,166,255,0.18)" stroke="#58a6ff" strokeWidth="1.6" />
      <circle cx="14" cy="31" r="3" fill="#58a6ff" />
      {/* GND via ×3 */}
      <circle cx="5" cy="23" r="2.6" fill="none" stroke="#3fb950" strokeWidth="1.8" />
      <circle cx="23" cy="23" r="2.6" fill="none" stroke="#3fb950" strokeWidth="1.8" />
      <circle cx="14" cy="4.5" r="2.6" fill="none" stroke="#3fb950" strokeWidth="1.8" />

      {/* ── 動作：兩個朝右箭頭，後面那個 0.4 ── */}
      <path d="M32 19 l6 4 -6 4 z" fill="#e0e6ed" />
      <path d="M38 19 l6 4 -6 4 z" fill="#e0e6ed" opacity="0.4" />

      {/* ── 結果：Pareto 曲線卡片 ── */}
      <rect x="48" y="8" width="22" height="30" rx="3.5" fill="#161c28" stroke="#58a6ff" strokeWidth="1.6" />
      <polyline
        points="52,13 53.5,22 56.5,28 61,31.5 66,33"
        fill="none" stroke="#8b949e" strokeWidth="1.6"
      />
      <circle cx="53.5" cy="22" r="2" fill="#d29922" />
      <circle cx="58.5" cy="30" r="2" fill="#d29922" />
      <circle cx="66" cy="33" r="2.4" fill="#3fb950" />
    </svg>
  );
}
