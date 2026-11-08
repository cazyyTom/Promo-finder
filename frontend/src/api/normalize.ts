/** All wire-shape compatibility lives here, including the delivered FastAPI backend. */
import { csToTimestamp } from "../lib/time";
import type {
  AnalysisState,
  AnalysisStatus,
  ChatReply,
  Health,
  HistoryEntry,
  Promo,
  Results,
  RunError,
} from "./types";
export const record = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown, fallback = "") =>
  typeof v === "string" ? v : fallback;
const num = (v: unknown, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const strings = (v: unknown) =>
  list(v).filter((x): x is string => typeof x === "string");
export function normalizeState(v: unknown): AnalysisState {
  if (v === "queued" || v === "pending") return "uploaded";
  if (v === "finalizing") return "ranking";
  return [
    "uploaded",
    "parsing",
    "indexing",
    "analyzing",
    "ranking",
    "complete",
    "partial",
    "failed",
  ].includes(text(v))
    ? (v as AnalysisState)
    : "uploaded";
}
export function normalizeErrors(v: unknown): RunError[] {
  return list(v).map((item) => {
    if (typeof item === "string") return { message: item };
    const r = record(item);
    return {
      file: text(r.file ?? r.filename) || undefined,
      episode: typeof r.episode === "number" ? r.episode : undefined,
      message: text(
        r.message ?? r.error,
        strings(r.errors).join("; ") || "This episode could not be processed.",
      ),
    };
  });
}
export function normalizeStatus(v: unknown): AnalysisStatus {
  const r = record(v);
  if (typeof r.status !== "string")
    throw new Error("The server returned an invalid analysis status.");
  return {
    status: normalizeState(r.status),
    filesReceived: num(r.files_received),
    episodesParsed: num(r.episodes_parsed),
    episodesAnalyzed: num(r.episodes_analyzed),
    episodesFailed: num(r.episodes_failed),
    stage: text(r.stage),
    errors: normalizeErrors(r.errors),
  };
}
function laterEpisode(value: unknown): string | null {
  if (typeof value === "number") return String(value);
  if (typeof value === "string")
    return value.match(/episode\s+(\d+)/i)?.[1] ?? value;
  const episode = record(value).episode;
  return typeof episode === "number" || typeof episode === "string"
    ? String(episode)
    : null;
}
function normalizePromo(value: unknown, index: number): Promo {
  const p = record(value),
    h = record(p.hook),
    c = record(p.cliffhanger),
    scores = record(p.scores);
  const segments = list(p.segments).map((item) => {
    const s = record(item),
      start = Math.max(0, Math.trunc(num(s.start_cs))),
      end = Math.max(0, Math.trunc(num(s.end_cs)));
    return {
      episode: num(s.episode),
      start_cs: start,
      end_cs: end,
      start: text(s.start) || csToTimestamp(start),
      end: text(s.end) || csToTimestamp(end),
      event_ids: strings(s.event_ids),
    };
  });
  const evidence: Record<string, string> = {};
  for (const [key, value] of Object.entries(record(p.evidence)))
    if (typeof value === "string") evidence[key] = value;
  return {
    rank: num(p.rank, index + 1),
    segments,
    total_seconds: num(
      p.total_seconds,
      segments.reduce((n, s) => n + s.end_cs - s.start_cs, 0) / 100,
    ),
    hook: {
      event_id: text(h.event_id),
      description: text(h.description, "No hook description supplied."),
      lands_at_seconds: num(h.lands_at_seconds),
    },
    cliffhanger: {
      event_id: text(c.event_id),
      open_question: text(c.open_question, "No open question supplied."),
    },
    why_it_works: text(p.why_it_works),
    scores: {
      hook: num(scores.hook),
      cliffhanger: num(scores.cliffhanger),
      clarity: num(scores.clarity),
      weighted: num(scores.weighted),
    },
    evidence,
    flags: strings(p.flags),
    answeredLaterEpisode: laterEpisode(p.answered_later),
  };
}
export function normalizeResults(value: unknown): Results {
  const r = record(value);
  if (!Array.isArray(r.promos) && !Array.isArray(r.shortlist))
    throw new Error("The server returned an unrecognized results format.");
  const promos = list(r.promos ?? r.shortlist).map(normalizePromo);
  const s = record(r.run_summary ?? r.summary ?? r.run_report);
  const failures = normalizeErrors(s.failures);
  return {
    promos,
    summary: {
      filesReceived: num(s.files_received),
      episodesParsed: num(s.episodes_parsed),
      episodesAnalyzed: num(s.episodes_analyzed),
      episodesFailed: num(s.episodes_failed, failures.length),
      promosReturned: num(s.promos_returned, promos.length),
      runtimeSeconds: num(s.runtime_seconds ?? s.runtime),
      failures,
    },
    rejected: list(r.rejected),
    raw: value,
  };
}
export function normalizeHealth(value: unknown): Health {
  const h = record(value);
  return { status: text(h.status, "ok"), model: text(h.model, "Gemini") };
}
export function normalizeChat(value: unknown): ChatReply {
  const r = record(value);
  if (typeof r.answer !== "string")
    throw new Error("The server returned an empty chat answer.");
  const citations = list(r.citations ?? r.cited).flatMap((v) =>
    typeof v === "string" ? [v] : typeof v === "number" ? [`rank:${v}`] : [],
  );
  return { answer: r.answer, citations };
}
export function normalizeHistory(value: unknown): HistoryEntry[] {
  const r = record(value);
  return list(Array.isArray(value) ? value : (r.analyses ?? r.items)).flatMap(
    (item) => {
      const h = record(item),
        id = text(h.analysis_id ?? h.id),
        date = text(h.createdAt ?? h.created_at);
      if (!id || !date || Number.isNaN(Date.parse(date))) return [];
      return [
        {
          analysis_id: id,
          title: text(h.title, "Untitled show"),
          createdAt: date,
          lastStatus: normalizeState(h.lastStatus ?? h.status),
        },
      ];
    },
  );
}
export function errorMessage(value: unknown, fallback: string): string {
  const r = record(value);
  return text(r.message ?? r.detail, fallback);
}
