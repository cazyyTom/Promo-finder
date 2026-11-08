import { Copy, Check } from "lucide-react";
import { useState } from "react";
import type { Segment } from "../api/types";
import { copyText, segmentText } from "../lib/clipboard";
export function SegmentRow({
  segment,
  index,
  onNotice,
}: {
  segment: Segment;
  index: number;
  onNotice: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await copyText(segmentText(segment));
      setCopied(true);
      onNotice("Timestamp copied");
    } catch {
      onNotice("Could not copy. Select the timestamp and copy it manually.");
    }
  }
  return (
    <div className="segment-row">
      <span className="segment-index">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="episode-label">Ep {segment.episode}</span>
      <span className="segment-time">
        {segment.start}
        <span className="time-arrow"> → </span>
        {segment.end}
      </span>
      <button
        className="icon-button"
        aria-label={`Copy segment ${index + 1} timestamps`}
        onClick={() => void copy()}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}
