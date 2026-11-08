import { ApiError } from "./errors";
import { uniqueId } from "../lib/id";
/** Synthetic-only fixture transport. Progress survives reload via a small local record. */
import type { Api, Promo, HistoryEntry } from "./types";
import { normalizeResults } from "./normalize";
import { csvCell } from "../lib/download";
const KEY = "promo-finder:mock-runs:v1";
interface MockRun {
  id: string;
  title: string;
  start: number;
  fail: boolean;
}
const memory = new Map<string, MockRun>();
function runs(): MockRun[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(v))
      return v.filter(
        (r): r is MockRun =>
          typeof r === "object" &&
          r !== null &&
          "id" in r &&
          typeof r.id === "string" &&
          "start" in r &&
          typeof r.start === "number" &&
          "title" in r &&
          typeof r.title === "string" &&
          "fail" in r &&
          typeof r.fail === "boolean",
      );
  } catch {
    /* Session-only fallback when storage is unavailable. */
  }
  return [...memory.values()];
}
function save(run: MockRun) {
  memory.set(run.id, run);
  const all = runs().filter((r) => r.id !== run.id);
  all.push(run);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* memory fallback */
  }
}
function get(id: string) {
  const run = runs().find((r) => r.id === id);
  if (!run)
    throw new ApiError(
      "This demo analysis is not on this browser. Start a new sample show.",
      404,
    );
  return run;
}
const sleep = (signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, 120);
    signal?.addEventListener("abort", abort, { once: true });
  });
const stories = [
  [
    "The judge signed the murder order.",
    "Why is her sister standing beside the judge?",
    "A hidden letter turns a rescue mission into a family betrayal.",
  ],
  [
    "That wedding ring belongs to my missing wife.",
    "Who is the woman behind the veil?",
    "One familiar object makes a stranger’s wedding deeply personal.",
  ],
  [
    "Your name is on tomorrow’s passenger list.",
    "Who booked her onto a flight that vanished years ago?",
    "A precise warning creates a mystery with an immediate deadline.",
  ],
  [
    "The boy in this photograph is you.",
    "Why does the photograph predate his birth?",
    "A simple discovery destabilizes everything he knows about his family.",
  ],
  [
    "I sold the house. Your father is still inside.",
    "What has her father been hiding in the locked room?",
    "A homecoming becomes a race to uncover a buried secret.",
  ],
  [
    "Do not open the red envelope.",
    "Why is her own handwriting inside it?",
    "An urgent warning and a recognizable clue build a self-contained mystery.",
  ],
  [
    "The winning ticket was planted in your coat.",
    "What will the stranger demand in return?",
    "A sudden fortune turns into a threat with clear personal stakes.",
  ],
  [
    "That heartbeat is coming from the empty room.",
    "Who has been living behind the sealed wall?",
    "A concrete sound makes an impossible discovery feel immediate.",
  ],
];
export const fixturePromos: Promo[] = stories.map(
  ([hook, question, why], i) => {
    const episode = i + 1,
      prefix = `E${String(episode).padStart(3, "0")}`;
    return {
      rank: i + 1,
      segments: [
        {
          episode,
          start: "00:39.00",
          end: "01:23.70",
          start_cs: 3900,
          end_cs: 8370,
          event_ids: [`${prefix}-B004`, `${prefix}-B011`],
        },
      ],
      total_seconds: 44.7,
      hook: {
        event_id: `${prefix}-B004`,
        description: hook,
        lands_at_seconds: 2.2,
      },
      cliffhanger: { event_id: `${prefix}-B011`, open_question: question },
      why_it_works: why,
      scores: {
        hook: i < 3 ? 5 : 4,
        cliffhanger: i < 4 ? 5 : 4,
        clarity: 4,
        weighted: i < 3 ? 4.75 : i < 4 ? 4.35 : 4,
      },
      evidence: {
        hook: `${prefix}-B004`,
        clarity: `${prefix}-B006`,
        cliffhanger: `${prefix}-B011`,
      },
      flags: i === 6 ? ["episode_cache_hit"] : [],
      answeredLaterEpisode: i === 0 ? "3" : null,
    };
  },
);
export const mockResults = () =>
  normalizeResults({
    promos: fixturePromos.map((p) => ({
      ...p,
      answered_later: p.answeredLaterEpisode,
    })),
    run_report: {
      files_received: 12,
      episodes_parsed: 12,
      episodes_analyzed: 11,
      episodes_failed: 1,
      promos_returned: 8,
      runtime_seconds: 12,
      failures: [
        {
          filename: "episode-009.txt",
          errors: [
            "A scene end timestamp is missing. Other episodes were analyzed.",
          ],
        },
      ],
    },
    rejected: [
      { id: "synthetic-rejected-1", reject_reason: ["split_dialogue"] },
    ],
  });
export const mockApi: Api = {
  health: async (signal) => {
    await sleep(signal);
    return { status: "ok", model: "Gemini · demo" };
  },
  upload: async (file, signal) => {
    await sleep(signal);
    const id = `demo-${uniqueId()}`;
    save({
      id,
      title: file.name,
      start: Date.now(),
      fail: file.name.toLowerCase().includes("fail-demo"),
    });
    return id;
  },
  status: async (id, signal) => {
    await sleep(signal);
    const r = get(id),
      elapsed = Date.now() - r.start;
    const status =
      elapsed < 1400
        ? "uploaded"
        : elapsed < 2900
          ? "parsing"
          : elapsed < 4200
            ? "indexing"
            : elapsed < 9500
              ? "analyzing"
              : elapsed < 11000
                ? "ranking"
                : r.fail
                  ? "failed"
                  : "partial";
    const done = status === "partial" || status === "failed";
    return {
      status,
      filesReceived: elapsed > 1400 ? 12 : 0,
      episodesParsed: elapsed > 2900 ? 12 : 0,
      episodesAnalyzed: done
        ? r.fail
          ? 0
          : 11
        : Math.min(11, Math.max(0, Math.floor((elapsed - 4200) / 480))),
      episodesFailed: done ? (r.fail ? 12 : 1) : 0,
      stage: status,
      errors: done
        ? [
            {
              file: "episode-009.txt",
              message: r.fail
                ? "Demo failure: re-upload a different ZIP to try again."
                : "A scene end timestamp is missing.",
            },
          ]
        : [],
    };
  },
  results: async (id, signal) => {
    await sleep(signal);
    get(id);
    return mockResults();
  },
  csv: async (id, signal) => {
    await sleep(signal);
    get(id);
    return new Blob(
      [
        ["rank", "episode", "start", "end", "score"].join(",") +
          "\n" +
          fixturePromos
            .flatMap((p) =>
              p.segments.map((s) =>
                [p.rank, s.episode, s.start, s.end, p.scores.weighted]
                  .map(csvCell)
                  .join(","),
              ),
            )
            .join("\n"),
      ],
      { type: "text/csv" },
    );
  },
  chat: async (id, question, signal) => {
    await sleep(signal);
    get(id);
    const answer = /reject/i.test(question)
      ? "One synthetic candidate was rejected because its boundary split a dialogue line. Eligibility is checked before any score is used."
      : /safe|first/i.test(question)
        ? "Promo #1 has a clear opening hook and standalone stakes. Review the source footage and the later-answer note before posting; scores do not establish publishing safety."
        : "Promos #1 and #2 both score 4.75/5 in this synthetic demo. They are tied on the scoring criteria; list order does not mean #1 is objectively stronger.";
    return { answer, citations: ["rank:1", "rank:2"] };
  },
  list: async (signal) => {
    await sleep(signal);
    return runs().map((r): HistoryEntry => ({
      analysis_id: r.id,
      title: r.title,
      createdAt: new Date(r.start).toISOString(),
      lastStatus:
        Date.now() - r.start > 11000
          ? r.fail
            ? "failed"
            : "partial"
          : "analyzing",
    }));
  },
};
