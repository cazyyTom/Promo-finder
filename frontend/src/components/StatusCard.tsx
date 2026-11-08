import { Check, LoaderCircle, ChevronDown, AlertTriangle } from "lucide-react";
import type { AnalysisStatus } from "../api/types";
import { terminal } from "../api/types";
import { Logo } from "./Logo";
export function StatusCard({ status }: { status: AnalysisStatus | null }) {
  const state = status?.status ?? "uploaded";
  const done = terminal(state),
    total = status?.episodesParsed ?? 0,
    analyzed = status?.episodesAnalyzed ?? 0,
    failed = status?.episodesFailed ?? 0;
  const index =
    state === "uploaded"
      ? 0
      : state === "parsing"
        ? 1
        : state === "indexing" || state === "analyzing"
          ? 2
          : state === "ranking"
            ? 3
            : 4;
  const labels = [
    "Reading ZIP",
    "Parsing episodes",
    total
      ? `Analyzing ${analyzed + failed} of ${total} episodes`
      : "Analyzing episodes",
    "Ranking candidates",
    "Done",
  ];
  const progress = done
    ? 100
    : state === "ranking"
      ? 94
      : state === "analyzing"
        ? 25 + Math.min(60, total ? ((analyzed + failed) / total) * 60 : 0)
        : state === "indexing"
          ? 22
          : state === "parsing"
            ? 12
            : 4;
  return (
    <section className="status-card">
      <div className="assistant-heading">
        <Logo small />
        <span>
          {done
            ? "Your shortlist is ready"
            : "Finding your story’s strongest moments"}
        </span>
        {!done && <LoaderCircle className="spin" size={16} />}
      </div>
      <div className="status-live" aria-live="polite" aria-atomic="true">
        <span>
          {state === "indexing" ? "Indexing screenplay events" : labels[index]}
        </span>
        <small>{Math.round(progress)}%</small>
      </div>
      <div
        className={`progress-track ${!done ? "shimmer" : ""}`}
        role="progressbar"
        aria-label="Analysis progress"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${progress}%` }} />
      </div>
      <ol className="stage-list">
        {labels.map((label, i) => (
          <li className={i <= index ? "reached" : ""} key={i}>
            <span>{i < index || done ? <Check size={10} /> : i + 1}</span>
            <small>
              {i === 2
                ? "Analyzing"
                : i === 0
                  ? "Reading ZIP"
                  : i === 1
                    ? "Parsing"
                    : i === 3
                      ? "Ranking"
                      : "Done"}
            </small>
            <span className="sr-only">{label}</span>
          </li>
        ))}
      </ol>
      {failed > 0 && (
        <details className="partial-banner">
          <summary>
            <AlertTriangle size={16} />
            <span>
              Partial coverage: {failed} of {total} episodes failed
            </span>
            <ChevronDown size={15} />
          </summary>
          <ul>
            {status?.errors.map((e, i) => (
              <li key={i}>
                <strong>
                  {e.file || (e.episode ? `Episode ${e.episode}` : "Run issue")}
                </strong>
                : {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {state === "partial" && failed === 0 && (
        <div className="partial-banner plain">
          Some processing steps were incomplete. Available promos are shown
          below.
        </div>
      )}
    </section>
  );
}
