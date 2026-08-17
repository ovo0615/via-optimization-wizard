// 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供
// 與 FastAPI 後端的所有通訊集中在這裡。

export interface ParamRange {
  low: number;
  high: number;
}

export interface DesignPoint {
  antipad_mm: number;
  pitch_mm: number;
  gnd_distance_mm: number;
  stub_mm: number;
}

export interface PreviewMetrics {
  keepout_area_mm2: number;
  stub_resonance_ghz: number;
  stub_resonance_3rd_ghz: number;
}

export interface StudyRequest {
  ranges: Record<string, ParamRange>;
  num_sensitivity_designs: number;
  max_parallel: number;
  solver: "fake" | "hfss";
  cores_per_design: number;
  sweep_stop_ghz: number;
  min_resonance_ghz: number;
  dk: number;
  stackup?: StackupLayer[];
  in_layer?: string;
  out_layer?: string;
}

export interface StackupLayer {
  name: string;
  type: "Conductor" | "Dielectric";
  thickness: number;
  dk: number | "";
  df: number | "";
  [key: string]: unknown;
}

export interface StackupInfo {
  ok: boolean;
  source: string;
  layers: StackupLayer[];
  conductor_names: string[];
  weighted_dk: number;
  total_thickness_mm: number;
}

export function browseEdb(initial = ""): Promise<{ path: string }> {
  return fetch("/api/browse/edb", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initial }),
  }).then((r) => json<{ path: string }>(r));
}

export function importStackup(aedbPath: string): Promise<StackupInfo> {
  return fetch("/api/stackup/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aedb_path: aedbPath }),
  }).then((r) => json<StackupInfo>(r));
}

export interface StudyStatus {
  study_id: string;
  status: "starting" | "running" | "done" | "failed" | "stopped";
  stages: Record<string, string>;
  design_counts: Record<string, number>;
  error: string | null;
  opf_path: string | null;
}

export interface DesignRow {
  id: string;
  parameters: Record<string, number>;
  responses: Record<string, number>;
  feasible: boolean;
  pareto: boolean;
  status: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export function fetchPreview(point: DesignPoint, dk: number): Promise<PreviewMetrics> {
  return fetch("/api/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...point, dk }),
  }).then((r) => json<PreviewMetrics>(r));
}

export function startStudy(req: StudyRequest): Promise<{ study_id: string }> {
  return fetch("/api/study", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  }).then((r) => json<{ study_id: string }>(r));
}

export function fetchStatus(studyId: string): Promise<StudyStatus> {
  return fetch(`/api/study/${studyId}/status`).then((r) => json<StudyStatus>(r));
}

export function fetchDesigns(studyId: string, stage: string): Promise<{ designs: DesignRow[] }> {
  return fetch(`/api/study/${studyId}/designs?stage=${stage}`).then((r) =>
    json<{ designs: DesignRow[] }>(r),
  );
}

export function stopStudy(studyId: string): Promise<unknown> {
  return fetch(`/api/study/${studyId}/stop`, { method: "POST" });
}

export function openInOptislang(studyId: string): Promise<unknown> {
  return fetch(`/api/study/${studyId}/open-osl`, { method: "POST" }).then((r) =>
    json<unknown>(r),
  );
}

export interface PrerunEntry {
  study_id: string;
  finished_at: number | null;
  solver: string;
  sweep_stop_ghz: number | null;
  design_counts: Record<string, number>;
}

export function listPrerun(): Promise<{ studies: PrerunEntry[] }> {
  return fetch("/api/prerun").then((r) => json<{ studies: PrerunEntry[] }>(r));
}

export function loadPrerun(studyId: string): Promise<{ study_id: string }> {
  return fetch(`/api/prerun/${studyId}/load`, { method: "POST" }).then((r) =>
    json<{ study_id: string }>(r),
  );
}
