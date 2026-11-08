import type { RunSummary as Summary } from "../api/types";
export function RunSummary({ summary }: { summary: Summary }) {
  const stats = [
    ["Files", summary.filesReceived],
    ["Parsed", summary.episodesParsed],
    ["Analyzed", summary.episodesAnalyzed],
    ["Failed", summary.episodesFailed],
    ["Promos", summary.promosReturned],
    ["Runtime", `${Number(summary.runtimeSeconds.toFixed(1))} s`],
  ];
  return (
    <div className="run-summary" aria-label="Run summary">
      {stats.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong
            className={
              label === "Failed" && Number(value) > 0 ? "amber-text" : ""
            }
          >
            {value}
          </strong>
        </div>
      ))}
    </div>
  );
}
