export type AnalysisState =
  | "uploaded"
  | "parsing"
  | "indexing"
  | "analyzing"
  | "ranking"
  | "complete"
  | "partial"
  | "failed";
export interface RunError {
  file?: string;
  episode?: number;
  message: string;
}
export interface AnalysisStatus {
  status: AnalysisState;
  filesReceived: number;
  episodesParsed: number;
  episodesAnalyzed: number;
  episodesFailed: number;
  stage: string;
  errors: RunError[];
}
export interface Segment {
  episode: number;
  start: string;
  end: string;
  start_cs: number;
  end_cs: number;
  event_ids: string[];
}
export interface Promo {
  rank: number;
  segments: Segment[];
  total_seconds: number;
  hook: { event_id: string; description: string; lands_at_seconds: number };
  cliffhanger: { event_id: string; open_question: string };
  why_it_works: string;
  scores: {
    hook: number;
    cliffhanger: number;
    clarity: number;
    weighted: number;
  };
  evidence: Record<string, string>;
  flags: string[];
  answeredLaterEpisode: string | null;
}
export interface RunSummary {
  filesReceived: number;
  episodesParsed: number;
  episodesAnalyzed: number;
  episodesFailed: number;
  promosReturned: number;
  runtimeSeconds: number;
  failures: RunError[];
}
export interface Results {
  promos: Promo[];
  summary: RunSummary;
  rejected: unknown[];
  raw: unknown;
}
export interface HistoryEntry {
  analysis_id: string;
  title: string;
  createdAt: string;
  lastStatus: AnalysisState;
}
export interface Health {
  status: string;
  model: string;
}
export interface ChatReply {
  answer: string;
  citations: string[];
}
export interface FileInfo {
  name: string;
  size: number;
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: string[];
  error?: boolean;
}
export interface Api {
  health(signal?: AbortSignal): Promise<Health>;
  upload(file: File, signal?: AbortSignal): Promise<string>;
  status(id: string, signal?: AbortSignal): Promise<AnalysisStatus>;
  results(id: string, signal?: AbortSignal): Promise<Results>;
  csv(id: string, signal?: AbortSignal): Promise<Blob>;
  chat(id: string, question: string, signal?: AbortSignal): Promise<ChatReply>;
  list(signal?: AbortSignal): Promise<HistoryEntry[]>;
}
export const terminal = (state: AnalysisState) =>
  ["complete", "partial", "failed"].includes(state);
