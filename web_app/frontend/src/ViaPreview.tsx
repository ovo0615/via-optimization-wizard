// 俯視圖：差分 via ＋ 環繞 GND via ＋ keep-out 範圍。
// 純前端重繪——幾何規則與後端 flatten.py 一致（P 在 −y、N 在 +y，
// GND 以每顆訊號 via 為圓心、gndRadius 為半徑、對稱排列）。

import { useEffect, useRef, useState } from "react";
import type { DesignPoint } from "./api";

const GND_COUNT = 3;
const GND_STEP_DEG = 50;
const PAD_MM = 0.45;
const HOLE_MM = 0.25;

function gndAngles(baseDeg: number): number[] {
  // 與 flatten.py 的 _generate_angles 相同（奇數顆：中心 ± 步進）
  const out = [baseDeg];
  for (let i = 1; i <= Math.floor(GND_COUNT / 2); i++) {
    out.push(baseDeg + i * GND_STEP_DEG);
    out.push(baseDeg - i * GND_STEP_DEG);
  }
  return out;
}

export default function ViaPreview({ point }: { point: DesignPoint }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // 版面尺寸變動時觸發重繪——canvas 是點陣，只靠 CSS 拉伸會糊掉、
  // 底部標註也會被裁（實測）。
  const [resizeTick, setResizeTick] = useState(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => setResizeTick((t) => t + 1));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // 依內容自動決定比例：keep-out 半徑 + pitch 是最大的東西
    const rKeepout = point.gnd_distance_mm + point.antipad_mm / 2;
    const extent = Math.max(rKeepout + point.pitch_mm / 2 + 0.5, 2.2);
    const scale = Math.min(w, h) / (extent * 2);
    const cx = w / 2;
    const cy = h / 2;
    const X = (mm: number) => cx + mm * scale;
    const Y = (mm: number) => cy + mm * scale;

    const pVia = { x: 0, y: -point.pitch_mm / 2 };
    const nVia = { x: 0, y: point.pitch_mm / 2 };

    // keep-out 膠囊形（示意）
    ctx.beginPath();
    ctx.strokeStyle = "rgba(210, 153, 34, 0.55)";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.arc(X(pVia.x), Y(pVia.y), rKeepout * scale, Math.PI, 0, false);
    ctx.arc(X(nVia.x), Y(nVia.y), rKeepout * scale, 0, Math.PI, false);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // 出線（示意，寬度不按真實比例）
    ctx.strokeStyle = "rgba(88, 166, 255, 0.7)";
    ctx.lineWidth = Math.max(2, 0.1 * scale);
    for (const [via, sign] of [
      [pVia, -1],
      [nVia, 1],
    ] as const) {
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(X(via.x), Y(via.y));
        ctx.lineTo(X(dir * 0.35), Y(sign * 0.125));
        ctx.lineTo(X(dir * extent * 0.95), Y(sign * 0.125));
        ctx.stroke();
      }
    }

    // 一顆 via：antipad → pad → hole
    const drawVia = (x: number, y: number, signal: boolean) => {
      if (signal) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(88, 166, 255, 0.15)";
        ctx.arc(X(x), Y(y), (point.antipad_mm / 2) * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(88, 166, 255, 0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.fillStyle = signal ? "#58a6ff" : "#3fb950";
      ctx.arc(X(x), Y(y), (PAD_MM / 2) * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = "#0a0e15";
      ctx.arc(X(x), Y(y), (HOLE_MM / 2) * scale, 0, Math.PI * 2);
      ctx.fill();
    };

    drawVia(pVia.x, pVia.y, true);
    drawVia(nVia.x, nVia.y, true);

    // GND 環（P 基準 270°、N 基準 90°，與 flatten.py 一致；
    // canvas 的 y 向下，畫面上下與座標系相反但對稱，示意足夠）
    for (const [via, base] of [
      [pVia, 270],
      [nVia, 90],
    ] as const) {
      for (const deg of gndAngles(base)) {
        const rad = (deg * Math.PI) / 180;
        drawVia(
          via.x + point.gnd_distance_mm * Math.cos(rad),
          via.y + point.gnd_distance_mm * Math.sin(rad),
          false,
        );
      }
    }

    // 標註：集中在底部一列，不壓到圖形
    ctx.fillStyle = "#8b949e";
    ctx.font = "12px Calibri, 'Microsoft JhengHei'";
    ctx.fillText(
      `pitch ${point.pitch_mm.toFixed(2)}　antipad ${point.antipad_mm.toFixed(2)}　` +
        `GND ${point.gnd_distance_mm.toFixed(2)}　stub ${point.stub_mm.toFixed(2)} mm`,
      10,
      h - 12,
    );
  }, [point, resizeTick]);

  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
    </div>
  );
}
