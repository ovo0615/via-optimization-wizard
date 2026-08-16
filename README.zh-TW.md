# Via 最佳化精靈（Via Optimization Wizard）

[English](README.en.md) | 繁體中文

此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供。

---

## 這個專案要解決什麼

Ansys optiSLang 的多目標最佳化功能強大，但第一次接觸的工程師往往在
「參數怎麼註冊、流程怎麼接、結果怎麼看」就迷路了。這個專案把一個真實的
訊號完整性題目——**PCB 差分 via 的幾何最佳化**——包成四步精靈：

1. **選範例與疊構**：內建 12 層板差分 via（含 backdrill），或讀取自己板子的疊構
2. **定義設計空間**：四個幾何變數（antipad、pitch、GND via 距離、殘樁長度）
   拉範圍即可，旁邊即時顯示 via 佈局與零求解的解析指標
3. **目標與約束**：反射（TDR |Γ| 峰值）vs 佈線 keep-out 面積的雙目標取捨，
   殘樁共振頻率當約束——太長的 stub 讓陷波掉進工作頻寬，直接淘汰
4. **執行**：optiSLang 三段式流程背景執行，網頁看進度，跑完一鍵開
   optiSLang 原生後處理

![步驟一：範例與疊構](docs/images/wizard-01-example.png)

## 為什麼是 via、為什麼是 TDR

via 是 SI 工程師每天面對的結構，antipad、回流路徑、backdrill 殘樁這些
教科書問題全部交會在這裡。而 TDR 阻抗剖面是最能「對症下藥」的觀測方式：
凹下去是電容性（antipad 太小、pad 太大），凸起來是電感性（GND via 太遠、
pitch 太大）——工程師看一眼就知道往哪個方向調。

兩個目標真的互相打架：antipad 開大、GND via 拉遠對電性好，但佔掉佈線
面積。這正是 Pareto 前緣存在的理由——optiSLang 把整條取捨曲線攤出來讓
你選，而不是只給一個「最佳解」。

![步驟二：設計空間](docs/images/wizard-02-design-space.png)
![步驟三：目標與約束](docs/images/wizard-03-objectives.png)

## 技術架構

```
設計變數 ──> 模型描述(JSON) ──> PyEDB 建模 ──> HFSS 3D Layout 求解
                                                      │
optiSLang 三段式流程                                Touchstone
  敏感度分析（ALHS，真解，平行派發）                    │
  ↓                                            scikit-rf IFFT
  MOP 代理模型                                        │
  ↓                                            TDR 阻抗剖面
  多目標最佳化（EA，在 MOP 上，秒級）  <── |Γ| 峰值抽取 ┘
```

- **每個設計點完整重建模型**：幾何由參數化 JSON 描述重新產生，
  不依賴 AEDT 變數——這讓求解器成為可換的介面（HFSS／預跑查表／
  未來的 SimAI）
- **真解只發生在敏感度階段**：EA 的數百次評估全部打在 MOP 代理模型上，
  HFSS 不在場也能重跑最佳化、改權重
- **三個響應的取得成本刻意差三個數量級**：keep-out 面積（幾何公式）、
  殘樁共振（四分之一波長解析式）、反射峰值（HFSS 求解）——違反約束的
  設計在求解之前就被跳過，一秒都不浪費

## 實測數字（20 核工作站、6 核／點）

| 項目 | 數字 |
| --- | --- |
| 建模（JSON → .aedb，12 層板） | 35 秒 |
| HFSS 單點求解（40 GHz 掃頻） | 約 4.5 分鐘 |
| 8 點敏感度 DOE（3 平行） | 18 分鐘 |
| EA 最佳化 110～240 評估（MOP 上） | 秒級 |
| 載入預跑備援 | 秒級 |

掃頻上限 40 GHz 是用單調性實測定出來的：四個已知好壞順序的設計，
20 GHz 下 |Γ| 排序整個亂掉（TDR 解析度比整根 via 長），40 GHz 與
60 GHz 排序完全一致——最佳化需要的是排序正確，40 GHz 就夠。

![步驟四：執行與結果](docs/images/wizard-04-results.png)

## optiSLang 原生後處理（24 點 HFSS 研究）

跑完一鍵開啟 optiSLang 後處理——以下圖表全部由 optiSLang 計算與繪製，
資料來自 24 點 40 GHz HFSS 敏感度研究（20 點成功、4 點失敗，
失敗點誠實保留在統計中）。

**MOP 響應曲面**：殘樁長度對共振頻率的 Kriging 曲面，CoP = 98%——
四分之一波長物理被代理模型完整學起來，殘差緊貼對角線：

![MOP 響應曲面](docs/images/osl-mop-surface.png)

**敏感度分析**：相關矩陣與相關係數。CoP 矩陣顯示每個參數對每個響應的
貢獻（GND 距離對 keep-out 面積 85.7%、殘樁對共振 98%）——
「哪些參數重要」一目了然：

![敏感度分析](docs/images/osl-sensitivity.png)

**Pareto 前緣**：反射 vs 佈線面積的雙目標取捨，紅色為前緣，
右側是選定最佳設計的參數、響應與約束餘裕：

![Pareto 前緣](docs/images/osl-pareto.png)

## 公開範圍與私有實作

本 repo 是**案例展示**：公開前端原始碼（React + Vite + TypeScript）、
文件與流程圖。後端實作（PyEDB 建模器、HFSS 求解編排、TDR 計算、
PyOptiSLang 流程建構）為私有，不在此 repo 內，因此 clone 後無法
直接執行。

技術交流與模擬服務請透過虎門科技（TADC）聯繫：jeff.hong@cadmen.com

## 環境需求（私有後端）

- Windows 10／11（64 位元）
- Ansys Electronics Desktop 2025 R2（HFSS）＋ optiSLang 2025 R2 以上，
  需正式授權
- Python 3.10；pyaedt 0.23.0、pyedb 0.65.1、ansys-optislang-core 1.5.0、
  scikit-rf 1.8.0、FastAPI

## 致謝

本專案的 via 參數化建模設計源自早期 Ansys 技術專家**林鳴志**
（[linmingchih](https://github.com/linmingchih)）提供的
[Via Wizard](https://github.com/linmingchih)——疊構、padstack、backdrill
與差分出線的建模核心以其為基礎改造而來，特別感謝他。

## 聲明

This is Jeff Hong's personal technical portfolio. It is not an official
account of Taiwan Auto-Design Co. (TADC). Ansys is a trademark of Ansys,
Inc.; this portfolio is not officially affiliated with Ansys, Inc.

所有截圖取自同一次真實操作，使用內建示範資料，不含任何客戶資訊。
