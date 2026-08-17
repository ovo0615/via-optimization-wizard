# Via Optimization Wizard

English | [繁體中文](README.zh-TW.md)

Provided by Jeff Hong, Senior Technical Engineer, Taiwan Auto-Design Co. (TADC).

---

## The problem this solves

Ansys optiSLang is a powerful multi-objective optimizer, but first-time users
often get lost in parameter registration, workflow wiring, and result
navigation before they ever see its value. This project wraps a real
signal-integrity problem — **PCB differential via geometry optimization** —
into a four-step wizard:

1. **Example & stackup**: a built-in 12-layer differential via with backdrill,
   or import the stackup from your own board
2. **Design space**: four geometric variables (antipad, pitch, GND via
   distance, backdrill stub) set by range sliders, with a live via-layout
   preview and zero-solve analytical metrics
3. **Objectives & constraints**: reflection (TDR |Γ| peak) vs. routing
   keep-out area as competing objectives; stub resonance frequency as a
   constraint — a stub long enough to drop its notch into the operating band
   is eliminated outright
4. **Run**: the classic optiSLang three-stage flow executes in the background,
   progress streams to the browser, and one click opens the native optiSLang
   post-processing when done

![Step 1: example and stackup](docs/images/wizard-01-example.png)

## Why vias, why TDR

Vias are the structure SI engineers face every day — antipads, return paths,
and backdrill stubs all intersect here. And the TDR impedance profile is the
most actionable way to look at them: a dip means capacitive (antipad too
small, pad too large), a bump means inductive (GND vias too far, pitch too
wide). Engineers see the direction to turn at a glance.

The two objectives genuinely fight each other: opening the antipad and
pulling GND vias away improves the electrical response but costs routing
area. That is exactly why the Pareto front matters — optiSLang lays out the
whole trade-off curve instead of handing you a single "optimum."

![Step 2: design space](docs/images/wizard-02-design-space.png)
![Step 3: objectives and constraints](docs/images/wizard-03-objectives.png)

## Architecture

```
design vars ──> model description (JSON) ──> PyEDB modeler ──> HFSS 3D Layout
                                                                    │
optiSLang three-stage flow                                     Touchstone
  Sensitivity (ALHS, real solves, parallel dispatch)                │
  ↓                                                          scikit-rf IFFT
  MOP surrogate                                                     │
  ↓                                                       TDR impedance profile
  Multi-objective EA (on the MOP, seconds)  <── |Γ| peak extraction ┘
```

- **Every design point rebuilds the model** from a parametric JSON
  description rather than AEDT variables — which makes the solver a swappable
  interface (HFSS / pre-run lookup / SimAI in the future)
- **Real solves happen only in the sensitivity stage**: the EA's hundreds of
  evaluations all hit the MOP surrogate, so optimization and weight changes
  can re-run without HFSS present
- **The three responses deliberately span three orders of cost**: keep-out
  area (closed-form), stub resonance (quarter-wave formula), reflection peak
  (HFSS solve) — constraint-violating designs are skipped before any solve

## Measured numbers (20-core workstation, 6 cores/point)

| Item | Value |
| --- | --- |
| Modeling (JSON → .aedb, 12-layer board) | 35 s |
| Single HFSS solve (40 GHz sweep) | ~4.5 min |
| 8-point sensitivity DOE (3 parallel) | 18 min |
| EA optimization, 110–240 evaluations (on MOP) | seconds |
| Loading a pre-run backup study | seconds |

The 40 GHz sweep ceiling was determined by a monotonicity experiment: with
four designs of known quality ordering, 20 GHz scrambles the |Γ| ranking
entirely (the TDR resolution exceeds the via length), while 40 GHz and
60 GHz agree exactly. Optimization needs correct ranking — 40 GHz suffices.

![Step 4: run and results](docs/images/wizard-04-results.png)

## Native optiSLang post-processing (24-point HFSS study)

One click opens the optiSLang post-processor when the run completes — every
chart below is computed and rendered by optiSLang itself, from a 24-point
40 GHz HFSS sensitivity study (20 succeeded, 4 failed; the failures are
honestly kept in the statistics).

**MOP response surface**: the Kriging surface of stub length vs. resonance
frequency, CoP = 98% — the quarter-wave physics fully captured by the
surrogate, with residuals hugging the diagonal:

![MOP response surface](docs/images/osl-mop-surface.png)

**Sensitivity analysis**: correlation matrix and coefficients. The CoP
matrix shows each parameter's contribution to each response (GND distance
85.7% for keep-out area, stub 98% for resonance) — which knobs matter, at
a glance:

![Sensitivity analysis](docs/images/osl-sensitivity.png)

**Pareto front**: the reflection vs. routing-area trade-off with the front
in red, alongside the selected best design's parameters, responses, and
constraint margin:

![Pareto front](docs/images/osl-pareto.png)

## Public scope vs. private implementation

This repository is a **case-study showcase**: the frontend source
(React + Vite + TypeScript), documentation, and workflow diagrams are public.
The backend implementation (PyEDB modeler, HFSS orchestration, TDR
computation, PyOptiSLang flow builder) is private and not included, so a
clone is not runnable as-is.

For technical engagements and simulation services, contact TADC:
jeff.hong@cadmen.com

## Requirements (private backend)

- Windows 10/11 (64-bit)
- Ansys Electronics Desktop 2025 R2 (HFSS) + optiSLang 2025 R2 or later,
  properly licensed
- Python 3.10; pyaedt 0.23.0, pyedb 0.65.1, ansys-optislang-core 1.5.0,
  scikit-rf 1.8.0, FastAPI

## Project mode: run the customer's own board

Step 1 can switch to "read the stackup from my board": point it at an `.aedb`
(paste the path or use the browse dialog) and the tool reads the real stackup
read-only — layer names, thicknesses, Dk/Df — then you pick the exit layer.
The geometry is still rebuilt from the parametric description (see ADR-0001);
the customer board contributes only its stackup.

Below is a **real 12-layer board** (23 stackup entries including dielectrics,
2.429 mm thick, weighted Dk 4.4, TOP in / inner L5 out) run as a 16-point
40 GHz study — **16/16 solved successfully**, 93.7 minutes at 2 parallel:

**Reflection MOP surface** (Moving Least Squares, CoP 83%): plotted against
stub length and antipad, the corner with a small antipad and a long stub
rises into a "reflection hill", with a flat low-reflection plain on the other
side — which way to turn is obvious at a glance. The CoP matrix on the right
lays out every parameter's contribution to every response: stub 98.9% for
resonance, stub 81.2% for reflection, GND distance 85.1% for area — which
single knob dominates each response is written cell by cell:

![Reflection MOP surface, customer stackup](docs/images/osl-cust-mop-gamma.png)

**Area MOP surface** (CoP 99%) — a purely geometric quantity predicts almost
perfectly, residuals hugging the diagonal:

![Area MOP surface, customer stackup](docs/images/osl-cust-mop-area.png)

**Pareto front**: the optimizer ran 150 evaluations on the MOP, all feasible,
6 landing on the front. At 4.87 mm² the reflection is 0.102; spending up to
5.63 mm² buys 0.077 (25% better); going on to 7.64 mm² buys almost nothing —
**the marginal return on area runs out around 5.6 mm²**:

![Pareto front, customer stackup](docs/images/osl-cust-pareto.png)

## "Can we trust the TDR you compute yourselves?"

That is the first question every customer asks, so the answer is a
cross-check against Ansys's own engine: the same Touchstone goes through
this tool's scikit-rf IFFT on one path and through **AEDT Circuit's Nexxim
time-domain convolution** (the official TDR probe) on the other. The design
compared is the worst-reflecting point of the 16-point study.

![TDR cross-check](docs/images/tdr-xcheck.png)

| Metric | This tool | AEDT Circuit | Difference |
| --- | ---: | ---: | ---: |
| Impedance dip depth | 50.4 Ω | 49.7 Ω | **1.4%** |
| Dip position | coincident after alignment | — | — |
| Settled differential impedance | 73.3 Ω | 86.0 Ω | 12.7 Ω |

**The dip is what counts**: the response is |Γ| = ΔZ/2Z, which measures the
*step* in impedance rather than its absolute level — and the two engines
agree on that step to within 1.4%.

A third, independent check agrees as well: AEDT's settled value of 86.0 Ω
matches the 85.5 Ω obtained algebraically from the frequency-domain Sdd11 at
0.45 GHz. Those two paths share no code, so agreement is not the same error
computed twice.

The 12.7 Ω gap in the settled level has not been resolved, and it is listed
here rather than cropped out. Touchstone DC-row extrapolation has been ruled
out as the cause: removing that row leaves every one of the 16 designs' |Γ|
values unchanged and the ranking identical. It must be settled before
quoting *absolute* differential impedance; the ranking that drives the
optimization is unaffected.

## Acknowledgment

The parametric via modeling in this project is based on **Via Wizard** by
**Ming-Chih Lin** ([linmingchih](https://github.com/linmingchih)), a former
Ansys technical expert. The stackup, padstack, backdrill, and differential
fan-out modeling core was adapted from his work — special thanks to him.

## Notice

This is Jeff Hong's personal technical portfolio. It is not an official
account of Taiwan Auto-Design Co. (TADC). Ansys is a trademark of Ansys,
Inc.; this portfolio is not officially affiliated with Ansys, Inc.

All screenshots were captured from a single real session using the built-in
demo data; no customer information is included.
