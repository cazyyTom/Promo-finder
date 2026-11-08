import { Copy, Download, FileJson, Sparkles } from "lucide-react";
import type {
  AnalysisStatus,
  ChatMessage,
  FileInfo,
  Results,
} from "../api/types";
import { UserBubble } from "./UserBubble";
import { StatusCard } from "./StatusCard";
import { RunSummary } from "./RunSummary";
import { PromoCard } from "./PromoCard";
import { ErrorCard } from "./ErrorCard";
import { FollowUpChips } from "./FollowUpChips";
import { Logo } from "./Logo";
export function Thread({
  file,
  status,
  results,
  loading,
  error,
  onRefresh,
  onRetry,
  onNotice,
  onDownload,
  onCopy,
  chats,
  onChat,
  chatBusy,
  chatDisabled,
  downloading,
}: {
  file: FileInfo;
  status: AnalysisStatus | null;
  results: Results | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onRetry: () => void;
  onNotice: (s: string) => void;
  onDownload: (f: "json" | "csv") => void;
  onCopy: () => void;
  chats: ChatMessage[];
  onChat: (s: string) => void;
  chatBusy: boolean;
  chatDisabled: boolean;
  downloading: boolean;
}) {
  return (
    <div className="thread">
      <div className="thread-intro">
        <span className="eyebrow">THE EDIT STARTS HERE</span>
        <h1>Your story, distilled.</h1>
        <p>The strongest moments. Every timestamp accounted for.</p>
      </div>
      <UserBubble file={file} files={status?.filesReceived ?? 0} />
      {error && (
        <ErrorCard
          message={error}
          onRetry={onRefresh}
          title="Connection interrupted"
        />
      )}
      {status?.status === "failed" ? (
        <ErrorCard
          title="This analysis couldn’t finish"
          message={
            status.errors
              .map(
                (e) =>
                  `${e.file || (e.episode ? `Episode ${e.episode}` : "Run")}: ${e.message}`,
              )
              .join(" · ") || "The server could not analyze this ZIP."
          }
          onRetry={onRetry}
        />
      ) : (
        (status || !error) && <StatusCard status={status} />
      )}
      {loading && (
        <div className="result-skeleton" aria-label="Loading analysis">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}
      {results && (
        <section className="results-section" aria-labelledby="results-heading">
          <div className="results-heading">
            <div>
              <span className="eyebrow">YOUR SHORTLIST</span>
              <h2 id="results-heading">
                Made to stop the scroll.<span>{results.promos.length}</span>
              </h2>
            </div>
            <div className="result-actions">
              <button
                title="Download JSON"
                aria-label="Download results JSON"
                disabled={downloading}
                onClick={() => onDownload("json")}
              >
                <FileJson size={15} />
                <span>JSON</span>
              </button>
              <button
                title="Download CSV"
                aria-label="Download results CSV"
                disabled={downloading}
                onClick={() => onDownload("csv")}
              >
                <Download size={15} />
                <span>CSV</span>
              </button>
              <button
                title="Copy all promos as text"
                aria-label="Copy all promos as text"
                onClick={onCopy}
              >
                <Copy size={15} />
              </button>
            </div>
          </div>
          <p className="qualified-count">
            {results.promos.length} of up to 10 promos qualified across{" "}
            {results.summary.episodesParsed} episodes
          </p>
          <RunSummary summary={results.summary} />
          {results.promos.length ? (
            results.promos.map((p) => (
              <PromoCard key={p.rank} promo={p} onNotice={onNotice} />
            ))
          ) : (
            <div className="no-promos">
              <Sparkles size={25} />
              <h3>No cuts met all three criteria.</h3>
              <p>
                We keep the bar high. Check the rejected candidates in the JSON
                download for reasons, or try another show.
              </p>
            </div>
          )}
          <div className="shortlist-footnote">
            “Post first” highlights rank, not a publishing guarantee. Review
            source footage and rights before posting.
          </div>
          {!chatDisabled && (
            <FollowUpChips onSelect={onChat} disabled={chatBusy} />
          )}
        </section>
      )}
      {chats.map((m) => (
        <div
          key={m.id}
          className={`chat-message ${m.role} ${m.error ? "chat-error" : ""}`}
        >
          {m.role === "assistant" && <Logo small />}
          <div>
            <p>{m.text}</p>
            {m.citations && m.citations.length > 0 && (
              <div className="citations">
                {m.citations.map((c, i) => (
                  <span key={`${c}-${i}`}>{c}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
      {chatBusy && (
        <div className="chat-message assistant" role="status">
          <Logo small />
          <span className="thinking">
            Looking at the evidence<span>…</span>
          </span>
        </div>
      )}
    </div>
  );
}
