import { TriangleAlert, Info } from "lucide-react";
export function FlagChip({ flag }: { flag: string }) {
  const timing = flag === "hook_timing_review";
  const tooltip =
    "The screenplay has no word-level timing, so the hook’s landing time needs a human check.";
  return (
    <span
      className={`flag-chip ${timing ? "timing" : ""}`}
      title={timing ? tooltip : flag.replaceAll("_", " ")}
      tabIndex={timing ? 0 : undefined}
      aria-label={timing ? `Check timing. ${tooltip}` : undefined}
    >
      {timing ? <TriangleAlert size={12} /> : <Info size={12} />}{" "}
      {timing ? "Check timing" : flag.replaceAll("_", " ")}
    </span>
  );
}
