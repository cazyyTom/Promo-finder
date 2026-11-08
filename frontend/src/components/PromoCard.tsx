import {
  ArrowUpRight,
  Clock3,
  Copy,
  ChevronDown,
  Quote,
  Zap,
} from "lucide-react";
import type { Promo } from "../api/types";
import { copyText, timestampsText } from "../lib/clipboard";
import { duration } from "../lib/time";
import { SegmentRow } from "./SegmentRow";
import { ScoreBar } from "./ScoreBar";
import { FlagChip } from "./FlagChip";
export function PromoCard({
  promo,
  onNotice,
}: {
  promo: Promo;
  onNotice: (text: string) => void;
}) {
  async function copy() {
    try {
      await copyText(timestampsText(promo));
      onNotice(`Promo #${promo.rank} timestamps copied`);
    } catch {
      onNotice(
        "Clipboard unavailable. Select and copy the timestamps manually.",
      );
    }
  }
  return (
    <article
      className={`promo-card ${promo.rank <= 3 ? "top-promo" : ""}`}
      aria-label={`Promo ${promo.rank}`}
      id={`promo-${promo.rank}`}
    >
      <header className="promo-header">
        <div className="rank-group">
          <span className={`rank ${promo.rank === 1 ? "first-rank" : ""}`}>
            #{promo.rank}
          </span>
          {promo.rank <= 3 && (
            <span className="post-first">
              <ArrowUpRight size={12} />
              Post first
            </span>
          )}
        </div>
        <div className="promo-metrics">
          <span className="duration-chip">
            <Clock3 size={13} />
            {duration(promo.total_seconds)}
          </span>
          <span className="weighted-pill">
            {Number(promo.scores.weighted.toFixed(2))}
            <small>/ 5</small>
          </span>
        </div>
      </header>
      <div className="segments">
        {promo.segments.map((segment, i) => (
          <SegmentRow
            key={`${segment.episode}-${segment.start_cs}-${i}`}
            segment={segment}
            index={i}
            onNotice={onNotice}
          />
        ))}
      </div>
      <button className="copy-timestamps" onClick={() => void copy()}>
        <Copy size={12} />
        Copy all timestamps
      </button>
      <div className="story-blocks">
        <div className="hook-block">
          <div className="block-label">
            <Zap size={12} />
            HOOK<span>lands at {duration(promo.hook.lands_at_seconds)}</span>
          </div>
          <h3>“{promo.hook.description}”</h3>
        </div>
        <div className="cliff-block">
          <div className="block-label">
            <Quote size={12} />
            CLIFFHANGER
          </div>
          <p>{promo.cliffhanger.open_question}</p>
        </div>
      </div>
      <div className="why-block">
        <span>WHY IT WORKS</span>
        <p>{promo.why_it_works || "No explanation supplied by the server."}</p>
      </div>
      <div className="score-grid">
        <ScoreBar label="Hook" value={promo.scores.hook} />
        <ScoreBar label="Cliffhanger" value={promo.scores.cliffhanger} />
        <ScoreBar label="Clarity" value={promo.scores.clarity} />
        <ScoreBar label="Weighted" value={promo.scores.weighted} weighted />
      </div>
      {(promo.flags.length > 0 || promo.answeredLaterEpisode) && (
        <div className="card-notes">
          {promo.flags.map((flag, i) => (
            <FlagChip key={`${flag}-${i}`} flag={flag} />
          ))}
          {promo.answeredLaterEpisode && (
            <span className="later-note">
              Answered later in episode {promo.answeredLaterEpisode}
            </span>
          )}
        </div>
      )}
      <details className="evidence">
        <summary>
          Evidence <ChevronDown size={14} />
        </summary>
        {Object.entries(promo.evidence).length ? (
          <dl>
            {Object.entries(promo.evidence).map(([criterion, id]) => (
              <div key={criterion}>
                <dt>{criterion}</dt>
                <dd>{id}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>No event evidence supplied.</p>
        )}
      </details>
    </article>
  );
}
