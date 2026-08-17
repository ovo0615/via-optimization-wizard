// 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供
// Via Optimization Wizard——四步精靈。
// 分工原則：這個介面只負責「設定的簡單」；跑完之後的敏感度、CoP、
// Pareto 圖用 optiSLang 原生後處理看，功勞歸 optiSLang。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DesignPoint, ParamRange, PreviewMetrics, StudyStatus } from "./api";
import {
  browseEdb,
  fetchDesigns,
  fetchPreview,
  fetchStatus,
  importStackup,
  listPrerun,
  loadPrerun,
  openInOptislang,
  startStudy,
  stopStudy,
} from "./api";
import type { StackupInfo } from "./api";
import type { PrerunEntry } from "./api";
import type { DesignRow } from "./api";
import BrandMark from "./BrandMark";
import MenuBar from "./MenuBar";
import type { Menu } from "./MenuBar";
import ViaPreview from "./ViaPreview";
import tadcLogo from "./assets/tadc-logo.png";

const STEPS = ["範例與疊構", "設計空間", "目標與約束", "執行"] as const;

const PARAM_META: {
  key: keyof DesignPoint;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}[] = [
  // antipad 下限 0.6：pad 0.45 之下環狀間隙 < 0.15mm 不可製造，
  // 且極端幾何實測會讓 HFSS 掃頻收斂失敗
  { key: "antipad_mm", label: "antipad 直徑", hint: "大→阻抗高、佔面積", min: 0.6, max: 1.4, step: 0.01 },
  { key: "pitch_mm", label: "差分 pitch", hint: "P/N 中心距", min: 0.6, max: 1.4, step: 0.01 },
  { key: "gnd_distance_mm", label: "GND via 距離", hint: "近→阻抗低、省面積", min: 0.5, max: 1.6, step: 0.01 },
  { key: "stub_mm", label: "backdrill 殘樁", hint: "長→共振掉進頻寬", min: 0.0, max: 1.2, step: 0.01 },
];

type Ranges = Record<keyof DesignPoint, ParamRange>;

const DEFAULT_RANGES: Ranges = {
  antipad_mm: { low: 0.6, high: 1.2 },
  pitch_mm: { low: 0.7, high: 1.2 },
  gnd_distance_mm: { low: 0.6, high: 1.4 },
  stub_mm: { low: 0.05, high: 1.0 },
};

export default function App() {
  const [step, setStep] = useState(0);

  // 步驟 1：內建範例或客戶疊構
  const [example, setExample] = useState<"demo12" | "custom">("demo12");
  const [aedbPath, setAedbPath] = useState("");
  const [stackup, setStackup] = useState<StackupInfo | null>(null);
  const [outLayer, setOutLayer] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [browsing, setBrowsing] = useState(false);

  const onBrowse = () => {
    setBrowsing(true);
    setImportError(null);
    browseEdb(aedbPath)
      .then(({ path }) => {
        if (path) setAedbPath(path);
      })
      .catch((e) => setImportError(String(e)))
      .finally(() => setBrowsing(false));
  };

  const onImportStackup = () => {
    setImporting(true);
    setImportError(null);
    importStackup(aedbPath.trim().replace(/^"|"$/g, ""))
      .then((info) => {
        setStackup(info);
        // 預設出線層：導體層裡靠上三分之一的那層（典型背鑽情境）
        const inner = info.conductor_names.slice(1, -1);
        setOutLayer(inner[Math.floor(inner.length / 3)] ?? inner[0] ?? "");
      })
      .catch((e) => setImportError(String(e)))
      .finally(() => setImporting(false));
  };

  const usingCustom = example === "custom" && stackup !== null && outLayer !== "";
  const effectiveDk = usingCustom && stackup ? stackup.weighted_dk : 3.8;

  // 步驟 2：範圍與預覽點（預覽點 = 各參數範圍中點）
  const [ranges, setRanges] = useState<Ranges>(DEFAULT_RANGES);
  const midpoint = useMemo<DesignPoint>(
    () =>
      Object.fromEntries(
        (Object.keys(ranges) as (keyof DesignPoint)[]).map((k) => [
          k,
          (ranges[k].low + ranges[k].high) / 2,
        ]),
      ) as unknown as DesignPoint,
    [ranges],
  );
  const [metrics, setMetrics] = useState<PreviewMetrics | null>(null);

  // 步驟 3：目標／約束／求解設定
  const [minResonance, setMinResonance] = useState(40);
  const [sweepStop, setSweepStop] = useState(40);
  const [solver, setSolver] = useState<"fake" | "hfss">("fake");
  const [numDesigns, setNumDesigns] = useState(20);
  const [maxParallel, setMaxParallel] = useState(3);

  // 步驟 4：執行狀態
  const [studyId, setStudyId] = useState<string | null>(null);
  const [status, setStatus] = useState<StudyStatus | null>(null);
  const [designs, setDesigns] = useState<DesignRow[]>([]);
  const [startError, setStartError] = useState<string | null>(null);
  const [prerun, setPrerun] = useState<PrerunEntry[]>([]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [quickstartOpen, setQuickstartOpen] = useState(false);
  const pollRef = useRef<number | null>(null);

  // 預跑備援清單：進到執行頁時抓一次
  useEffect(() => {
    if (step === 3) {
      listPrerun()
        .then((r) => setPrerun(r.studies))
        .catch(() => setPrerun([]));
    }
  }, [step]);

  // 即時指標：拉桿改變 → 350ms 防抖 → /api/preview（Dk 跟著疊構走）
  useEffect(() => {
    const t = window.setTimeout(() => {
      fetchPreview(midpoint, effectiveDk).then(setMetrics).catch(() => setMetrics(null));
    }, 350);
    return () => window.clearTimeout(t);
  }, [midpoint, effectiveDk]);

  const poll = useCallback((id: string) => {
    fetchStatus(id)
      .then((s) => {
        setStatus(s);
        if (s.status === "done") {
          fetchDesigns(id, "optimization").then((d) => setDesigns(d.designs));
        }
        if (s.status === "starting" || s.status === "running") {
          pollRef.current = window.setTimeout(() => poll(id), 3000);
        }
      })
      .catch(() => {
        pollRef.current = window.setTimeout(() => poll(id), 5000);
      });
  }, []);

  useEffect(() => () => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
  }, []);

  const onStart = () => {
    setStartError(null);
    setDesigns([]);
    startStudy({
      ranges,
      num_sensitivity_designs: numDesigns,
      max_parallel: maxParallel,
      solver,
      cores_per_design: 4,
      sweep_stop_ghz: sweepStop,
      min_resonance_ghz: minResonance,
      dk: effectiveDk,
      ...(usingCustom && stackup
        ? {
            stackup: stackup.layers,
            in_layer: stackup.conductor_names[0],
            out_layer: outLayer,
          }
        : {}),
    })
      .then(({ study_id }) => {
        setStudyId(study_id);
        poll(study_id);
      })
      .catch((e) => setStartError(String(e)));
  };

  const running = status?.status === "starting" || status?.status === "running";
  const midStubResonanceOk =
    metrics === null || metrics.stub_resonance_ghz >= minResonance;

  const canNext =
    (step === 0 && (example === "demo12" || usingCustom)) ||
    step === 1 ||
    step === 2 ||
    (step === 3 && false);

  const canStart = step === 3 && !running;
  const canOpenOsl = status?.status === "done" && studyId !== null;
  const canBrowse = !running && !browsing;

  // 快捷鍵：Ctrl+Enter 開始最佳化。輸入框裡不吃快捷鍵。
  // 條件必須與選單項、面板按鈕一致（都是 canStart）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.ctrlKey && e.key === "Enter" && canStart) {
        e.preventDefault();
        onStart();
      }
      // Ctrl+O 與選單項、面板按鈕指向同一個動作、同一個可用條件
      if (e.ctrlKey && (e.key === "o" || e.key === "O") && canBrowse) {
        e.preventDefault();
        setExample("custom");
        setStep(0);
        onBrowse();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStart, canBrowse]);

  // 選單不自己實作行為——每一項都指向面板上已經有的動作，
  // disabled 條件與面板按鈕、快捷鍵三者一致。
  const menus: Menu[] = [
    {
      label: "檔案",
      items: [
        {
          label: "瀏覽 .aedb 選疊構…",
          hint: "Ctrl+O",
          disabled: !canBrowse,
          onSelect: () => {
            setExample("custom");
            setStep(0);
            onBrowse();
          },
        },
        {
          label: "載入預跑結果…",
          disabled: running,
          onSelect: () => setStep(3),
        },
        {
          label: "用 optiSLang 開啟結果",
          disabled: !canOpenOsl,
          onSelect: () =>
            studyId && openInOptislang(studyId).catch((e) => setStartError(String(e))),
        },
        { separator: true },
        {
          label: "重新整理預跑清單",
          disabled: step !== 3 || running,
          onSelect: () =>
            listPrerun().then((r) => setPrerun(r.studies)).catch(() => setPrerun([])),
        },
      ],
    },
    {
      label: "執行",
      items: [
        {
          label: "開始最佳化",
          hint: "Ctrl+Enter",
          disabled: !canStart,
          onSelect: onStart,
        },
        {
          label: "停止",
          disabled: !running,
          onSelect: () => studyId && stopStudy(studyId),
        },
      ],
    },
    {
      label: "檢視",
      items: STEPS.map((name, i) => ({
        label: `${i + 1}. ${name}`,
        checked: step === i,
        disabled: running,
        onSelect: () => setStep(i),
      })),
    },
    {
      label: "說明",
      items: [
        { label: "快速上手", onSelect: () => setQuickstartOpen(true) },
        { label: "關於 Via 最佳化精靈", onSelect: () => setAboutOpen(true) },
      ],
    },
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <BrandMark height={46} />
          <div>
            <h1>Via 最佳化精靈</h1>
            <p className="sub">
              optiSLang × PyAEDT 多目標 via 最佳化 · 此工具由虎門科技資深技術工程師
              Jeff Hong 洪敬傑提供
            </p>
          </div>
        </div>
        <div className="topbar-right">
          <div className="status">
            <span className={`dot ${running ? "busy" : ""}`} />
            {running ? "研究執行中" : "本機服務 · 127.0.0.1"}
          </div>
          <img className="partner-logo" src={tadcLogo} alt="CADMEN 虎門科技 · Ansys Elite Channel Partner" />
        </div>
      </header>

      <MenuBar menus={menus} />

      {aboutOpen && (
        <div className="modal-back" onClick={() => setAboutOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>關於 Via 最佳化精靈</h2>
              <button className="ghost-btn" onClick={() => setAboutOpen(false)}>
                關閉
              </button>
            </div>
            <div className="modal-body">
              <p>
                把 optiSLang 的多目標最佳化包成四步精靈——以 PyAEDT／PyEDB 參數化重建
                差分 via 模型、HFSS 求解、TDR 抽取反射指標。
              </p>
              <h3>會影響結果、但畫面上看不出來的事</h3>
              <ul>
                <li>
                  <b>假求解器的數值不保證正確</b>：反射是解析近似（趨勢對）；
                  殘樁共振與 keep-out 面積用的是與 HFSS 模式相同的真公式。
                  切到 HFSS 模式，同一條流程，數字就是真的。
                </li>
                <li>
                  <b>掃頻 40 GHz 是實驗定的</b>：20 GHz 下 TDR 解析度比整根 via 長，
                  好壞設計的排序會失真——省這個錢會做出錯的結論。
                </li>
                <li>
                  <b>MOP 是代理模型</b>：最佳化階段的數字由 MOP 預測，可能出現
                  略負的 |Γ| 這類外插假象；可信度看 CoP（開 optiSLang 後處理）。
                </li>
                <li>
                  <b>每個設計點都是重建的完整 HFSS 模型</b>，不是改變數——
                  所以幾何一律由參數化描述產生。
                </li>
                <li>
                  <b>資料不離開本機</b>：服務只綁 127.0.0.1，疊構與結果都在本機磁碟。
                </li>
              </ul>
              <h3>致謝</h3>
              <p>
                via 參數化建模設計源自早期 Ansys 技術專家林鳴志（linmingchih）的
                Via Wizard。
              </p>
              <p>此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。</p>
            </div>
          </div>
        </div>
      )}

      {quickstartOpen && (
        <div className="modal-back" onClick={() => setQuickstartOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>快速上手</h2>
              <button className="ghost-btn" onClick={() => setQuickstartOpen(false)}>
                關閉
              </button>
            </div>
            <div className="modal-body">
              <ul>
                <li>
                  <b>①範例與疊構</b>：選內建 12 層板差分 via 範例。
                </li>
                <li>
                  <b>②設計空間</b>：拉四個參數的範圍；右側 keep-out 面積與殘樁共振
                  是零求解即時算的——stub 拉太長會直接變紅。
                </li>
                <li>
                  <b>③目標與約束</b>：反射 vs 佈線面積雙目標；殘樁共振當約束。
                  展示用假求解器（秒回），真跑切 HFSS。
                </li>
                <li>
                  <b>④執行</b>：三段式流程背景跑；沒時間就「載入預跑結果」秒回。
                  跑完按「用 optiSLang 開啟」看敏感度、CoP、Pareto——那些圖是
                  optiSLang 算的，可以親手拉。
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="wizard">
      <header className="wizard-header">
        <nav className="steps">
          {STEPS.map((name, i) => (
            <div
              key={name}
              className={`step-chip ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
            >
              <span className="n">{i < step ? "✓" : i + 1}</span>
              {name}
            </div>
          ))}
        </nav>
      </header>

      <div className="wizard-body">
        <main className="wizard-main">
          {step === 0 && (
            <>
              <div className="teach-note">
                <b>為什麼從範例開始？</b>
                最佳化要先有一個「會被反覆重建的參數化模型」。這個範例是 12 層板上的
                一對差分 via——SI 工程師每天遇到的結構，也是 backdrill、antipad、
                回流路徑這些教科書問題的交會點。
              </div>
              <div className="choice-grid">
                <div
                  className={`choice-card ${example === "demo12" ? "selected" : ""}`}
                  onClick={() => setExample("demo12")}
                >
                  <h4>內建範例：12 層板差分 via</h4>
                  <p>
                    FR4（Dk 3.8）、層厚 0.15 mm、TOP 進 L4 出、含 backdrill。
                    建模 35 秒、單點求解約 5 分鐘（40 GHz）。
                  </p>
                </div>
                <div
                  className={`choice-card ${example === "custom" ? "selected" : ""}`}
                  onClick={() => setExample("custom")}
                >
                  <h4>從我的板子讀疊構</h4>
                  <p>讀取 .aedb 的真實疊構（層厚、Dk/Df、層名）；幾何仍由參數化描述重建。</p>
                </div>
              </div>

              {example === "custom" && (
                <div className="glass-panel">
                  <h3 className="panel-title">匯入疊構（唯讀，不會動到原始檔案）</h3>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      type="text"
                      value={aedbPath}
                      onChange={(e) => setAedbPath(e.target.value)}
                      placeholder="按「瀏覽…」選擇，或直接貼上 .aedb 路徑"
                      style={{
                        flex: 1,
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid var(--border-light)",
                        borderRadius: 6,
                        padding: "8px 12px",
                        color: "var(--text-main)",
                        fontFamily: "inherit",
                        fontSize: 14,
                      }}
                    />
                    <button className="ghost-btn" disabled={browsing} onClick={onBrowse}>
                      {browsing ? "選擇中…" : "瀏覽…"}
                    </button>
                    <button
                      className="premium-btn"
                      disabled={importing || aedbPath.trim() === ""}
                      onClick={onImportStackup}
                    >
                      {importing ? "讀取中…" : "讀取疊構"}
                    </button>
                  </div>
                  <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "8px 0 0" }}>
                    .aedb 是資料夾——對話框裡請點進去選 <b>edb.def</b>，工具會自動折回資料夾路徑。
                  </p>

                  {importing && (
                    <p style={{ color: "var(--accent)", fontSize: 13, margin: "10px 0 0" }}>
                      正在載入 EDB 並讀取疊構……第一次會慢（要載入 Ansys 的
                      .NET 組件，約 30～60 秒），之後每次都是秒級。
                    </p>
                  )}

                  {importError && (
                    <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 0 }}>
                      {importError}
                    </p>
                  )}

                  {stackup && (
                    <>
                      <div className="metric-grid" style={{ marginTop: 12 }}>
                        <div className="metric-card">
                          <div className="label">層數（導體）</div>
                          <div className="value">
                            {stackup.layers.length}
                            <span className="unit">（{stackup.conductor_names.length}）</span>
                          </div>
                        </div>
                        <div className="metric-card">
                          <div className="label">總厚度</div>
                          <div className="value">
                            {stackup.total_thickness_mm.toFixed(3)}
                            <span className="unit">mm</span>
                          </div>
                        </div>
                        <div className="metric-card">
                          <div className="label">加權 Dk</div>
                          <div className="value">{stackup.weighted_dk.toFixed(2)}</div>
                        </div>
                        <div className="metric-card">
                          <div className="label">訊號入層</div>
                          <div className="value" style={{ fontSize: 15 }}>
                            {stackup.conductor_names[0]}
                          </div>
                        </div>
                      </div>

                      <div className="param-row" style={{ marginTop: 4 }}>
                        <div className="param-name">
                          出線層
                          <small>訊號轉出的內層；以下的殘樁被背鑽</small>
                        </div>
                        <select
                          value={outLayer}
                          onChange={(e) => setOutLayer(e.target.value)}
                          style={{
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid var(--border-light)",
                            borderRadius: 6,
                            padding: "8px 12px",
                            color: "var(--text-main)",
                            fontFamily: "inherit",
                            fontSize: 14,
                          }}
                        >
                          {stackup.conductor_names.slice(1, -1).map((n) => (
                            <option key={n} value={n} style={{ background: "#161c28" }}>
                              {n}
                            </option>
                          ))}
                        </select>
                        <div />
                      </div>

                      <table className="design-table" style={{ marginTop: 8 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left" }}>層</th>
                            <th style={{ textAlign: "left" }}>型別</th>
                            <th>厚度 mm</th>
                            <th>Dk</th>
                            <th>Df</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stackup.layers.map((l) => (
                            <tr key={l.name}>
                              <td style={{ textAlign: "left", color: l.name === outLayer ? "var(--accent)" : undefined }}>
                                {l.name}
                                {l.name === outLayer ? "（出線）" : ""}
                              </td>
                              <td style={{ textAlign: "left" }}>{l.type === "Conductor" ? "導體" : "介電"}</td>
                              <td>{l.thickness.toFixed(4)}</td>
                              <td>{typeof l.dk === "number" ? l.dk.toFixed(2) : "—"}</td>
                              <td>{typeof l.df === "number" ? l.df.toFixed(4) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <div className="teach-note">
                <b>這一步在定義「設計空間」。</b>
                optiSLang 會在這四個範圍裡自動採樣、找出哪些參數真正重要。
                範圍拉太窄會錯過好設計，拉太寬會浪費求解次數——先用預設值就好。
              </div>
              <div className="glass-panel">
                <h3 className="panel-title">設計變數範圍（mm）</h3>
                {PARAM_META.map((meta) => {
                  const r = ranges[meta.key];
                  return (
                    <div className="param-row" key={meta.key}>
                      <div className="param-name">
                        {meta.label}
                        <small>{meta.hint}</small>
                      </div>
                      <div className="dual-slider">
                        <input
                          type="range"
                          min={meta.min}
                          max={meta.max}
                          step={meta.step}
                          value={r.low}
                          onChange={(e) =>
                            setRanges((prev) => ({
                              ...prev,
                              [meta.key]: {
                                low: Math.min(Number(e.target.value), prev[meta.key].high),
                                high: prev[meta.key].high,
                              },
                            }))
                          }
                        />
                        <input
                          type="range"
                          min={meta.min}
                          max={meta.max}
                          step={meta.step}
                          value={r.high}
                          onChange={(e) =>
                            setRanges((prev) => ({
                              ...prev,
                              [meta.key]: {
                                low: prev[meta.key].low,
                                high: Math.max(Number(e.target.value), prev[meta.key].low),
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="range-values">
                        {r.low.toFixed(2)} – {r.high.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="teach-note">
                <b>兩個目標互相打架，這正是重點。</b>
                反射（|Γ|）要小，佈線 keep-out 面積也要小——但 antipad 開大、GND
                拉遠對電性好、對面積壞。optiSLang 會把整條取捨曲線（Pareto 前緣）
                攤出來讓你選，而不是只給一個「最佳解」。殘樁共振是約束：太長的
                stub 會讓陷波掉進工作頻寬，直接淘汰。
              </div>
              <div className="glass-panel">
                <h3 className="panel-title">約束與求解設定</h3>
                <div className="param-row">
                  <div className="param-name">
                    殘樁共振下限
                    <small>陷波必須高於此頻率</small>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={80}
                    step={1}
                    value={minResonance}
                    onChange={(e) => setMinResonance(Number(e.target.value))}
                  />
                  <div className="range-values">{minResonance} GHz</div>
                </div>
                <div className="param-row">
                  <div className="param-name">
                    掃頻上限
                    <small>決定 TDR 解析度</small>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={60}
                    step={10}
                    value={sweepStop}
                    onChange={(e) => setSweepStop(Number(e.target.value))}
                  />
                  <div className="range-values">{sweepStop} GHz</div>
                </div>
                <div className="param-row">
                  <div className="param-name">
                    敏感度採樣點數
                    <small>ALHS</small>
                  </div>
                  {/* 下限 2：冒煙測試（新疊構第一次真解）只需要證明它跑得完，
                      不需要統計意義。8 點在 HFSS 模式下要 40 分鐘，太貴。 */}
                  <input
                    type="range"
                    min={2}
                    max={60}
                    step={1}
                    value={numDesigns}
                    onChange={(e) => setNumDesigns(Number(e.target.value))}
                  />
                  <div className="range-values">{numDesigns} 點</div>
                </div>
                <div className="param-row">
                  <div className="param-name">
                    平行設計點
                    <small>每點 4 核</small>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={1}
                    value={maxParallel}
                    onChange={(e) => setMaxParallel(Number(e.target.value))}
                  />
                  <div className="range-values">{maxParallel} 並行</div>
                </div>
                <div className="param-row">
                  <div className="param-name">
                    求解器
                    <small>展示可用假求解器</small>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className={solver === "fake" ? "premium-btn" : "ghost-btn"}
                      onClick={() => setSolver("fake")}
                    >
                      假求解器（秒回）
                    </button>
                    <button
                      className={solver === "hfss" ? "premium-btn" : "ghost-btn"}
                      onClick={() => setSolver("hfss")}
                    >
                      HFSS（真求解）
                    </button>
                  </div>
                  <div />
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="glass-panel">
                <h3 className="panel-title">optiSLang 三段式流程</h3>
                <div className="stage-list">
                  {(
                    [
                      ["sensitivity", "敏感度分析", "哪些參數重要（ALHS 採樣）"],
                      ["mop", "代理模型（MOP）", "之後不必再求解就能預測"],
                      ["optimization", "多目標最佳化（EA）", "Pareto 前緣與最佳解"],
                    ] as const
                  ).map(([key, name, desc]) => {
                    const st = status?.stages?.[key] ?? "";
                    const cls = st.includes("done")
                      ? "done"
                      : running && st && !st.includes("Idle")
                        ? "running"
                        : "";
                    return (
                      <div className={`stage-row ${cls}`} key={key}>
                        <div className="dot" />
                        <div>
                          <div className="stage-name">{name}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{desc}</div>
                        </div>
                        <div className="stage-info">
                          {status?.design_counts?.[key] != null
                            ? `${status.design_counts[key]} 設計點`
                            : st || "等待中"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {!running && !studyId && prerun.length > 0 && (
                <div className="glass-panel">
                  <h3 className="panel-title">或載入預跑結果（秒級，不需要 HFSS）</h3>
                  <div className="choice-grid">
                    {prerun.slice(0, 4).map((p) => (
                      <div
                        key={p.study_id}
                        className="choice-card"
                        onClick={() =>
                          loadPrerun(p.study_id)
                            .then(({ study_id }) => {
                              setStudyId(study_id);
                              poll(study_id);
                            })
                            .catch((e) => setStartError(String(e)))
                        }
                      >
                        <h4>
                          {p.solver === "hfss" ? "HFSS" : "示範"} ·{" "}
                          {p.sweep_stop_ghz ? `${p.sweep_stop_ghz} GHz` : "—"}
                        </h4>
                        <p>
                          {p.design_counts.sensitivity ?? 0} 點敏感度 ·{" "}
                          {p.design_counts.optimization ?? 0} 點最佳化
                          {p.finished_at
                            ? " · " + new Date(p.finished_at * 1000).toLocaleString("zh-TW")
                            : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {startError && (
                <div className="teach-note" style={{ borderColor: "var(--danger)" }}>
                  啟動失敗：{startError}
                </div>
              )}
              {status?.status === "failed" && (
                <div className="teach-note" style={{ borderColor: "var(--danger)" }}>
                  執行失敗，詳見後端日誌。
                </div>
              )}

              {designs.length > 0 && (
                <div className="glass-panel" style={{ maxHeight: 340, overflowY: "auto" }}>
                  <h3 className="panel-title">
                    最佳化設計表（藍色 = Pareto 前緣，共 {designs.filter((d) => d.pareto).length} 點）
                  </h3>
                  <table className="design-table">
                    <thead>
                      <tr>
                        <th>antipad</th>
                        <th>pitch</th>
                        <th>GND 距</th>
                        <th>stub</th>
                        <th>|Γ|</th>
                        <th>面積 mm²</th>
                        <th>共振 GHz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...designs]
                        .sort((a, b) => Number(b.pareto) - Number(a.pareto))
                        .slice(0, 80)
                        .map((d) => (
                          <tr
                            key={d.id}
                            className={d.pareto ? "pareto" : d.feasible ? "" : "infeasible"}
                          >
                            <td>{d.parameters.antipad_mm?.toFixed(3)}</td>
                            <td>{d.parameters.pitch_mm?.toFixed(3)}</td>
                            <td>{d.parameters.gnd_distance_mm?.toFixed(3)}</td>
                            <td>{d.parameters.stub_mm?.toFixed(3)}</td>
                            <td>{d.responses.refl_peak_gamma?.toFixed(4)}</td>
                            <td>{d.responses.keepout_area_mm2?.toFixed(2)}</td>
                            <td>{d.responses.stub_resonance_ghz?.toFixed(1)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {status?.status === "done" && studyId && (
                <div className="teach-note" style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span>
                    <b>看完整結果：</b>敏感度蜘蛛圖、CoP 矩陣、互動式
                    Pareto——這些圖是 optiSLang 算的，開原生介面讓客戶親手拉。
                  </span>
                  <button
                    className="premium-btn"
                    style={{ flexShrink: 0 }}
                    onClick={() => openInOptislang(studyId).catch((e) => setStartError(String(e)))}
                  >
                    用 optiSLang 開啟
                  </button>
                </div>
              )}
            </>
          )}
        </main>

        <aside className="wizard-side">
          <div
            className="glass-panel"
            style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}
          >
            <h3 className="panel-title">via 佈局預覽（範圍中點）</h3>
            <ViaPreview point={midpoint} />
          </div>

          <div className="glass-panel">
            <h3 className="panel-title">即時指標（零求解）</h3>
            <div className="metric-grid">
              <div className="metric-card">
                <div className="label">keep-out 面積</div>
                <div className="value">
                  {metrics ? metrics.keepout_area_mm2.toFixed(2) : "—"}
                  <span className="unit">mm²</span>
                </div>
              </div>
              <div className="metric-card">
                <div className="label">殘樁共振（基頻）</div>
                <div className={`value ${midStubResonanceOk ? "ok" : "danger"}`}>
                  {metrics ? metrics.stub_resonance_ghz.toFixed(1) : "—"}
                  <span className="unit">GHz</span>
                </div>
              </div>
              <div className="metric-card">
                <div className="label">三次諧波</div>
                <div className="value">
                  {metrics ? metrics.stub_resonance_3rd_ghz.toFixed(1) : "—"}
                  <span className="unit">GHz</span>
                </div>
              </div>
              <div className="metric-card">
                <div className="label">共振下限</div>
                <div className="value">
                  {minResonance}
                  <span className="unit">GHz</span>
                </div>
              </div>
            </div>
            {!midStubResonanceOk && (
              <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 0 }}>
                範圍中點的殘樁太長——共振低於下限，這一帶的設計會被約束淘汰。
              </p>
            )}
          </div>
        </aside>
      </div>

      <footer className="wizard-footer">
        <span className="footer-hint">
          {step === 3
            ? "Ctrl+Enter 開始最佳化；跑完可從「檔案」選單開 optiSLang 結果"
            : "選單列「檢視」可直接跳到任一步"}
          <span style={{ marginLeft: 14, opacity: 0.55 }}>建置 {__BUILD_TIME__}</span>
        </span>
        <span className="footer-spacer" />
        {step > 0 && (
          <button className="ghost-btn" onClick={() => setStep(step - 1)} disabled={running}>
            上一步
          </button>
        )}
        {step < 3 && (
          <button className="premium-btn" onClick={() => setStep(step + 1)} disabled={!canNext}>
            下一步
          </button>
        )}
        {step === 3 && !running && (
          <button className="premium-btn" onClick={onStart}>
            {status?.status === "done" ? "再跑一次" : "開始最佳化"}
          </button>
        )}
        {step === 3 && running && (
          <button
            className="ghost-btn"
            onClick={() => studyId && stopStudy(studyId)}
          >
            停止
          </button>
        )}
      </footer>
      </div>
    </div>
  );
}
