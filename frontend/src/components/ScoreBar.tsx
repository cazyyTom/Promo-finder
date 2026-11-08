export function ScoreBar({
  label,
  value,
  weighted = false,
}: {
  label: string;
  value: number;
  weighted?: boolean;
}) {
  return (
    <div className={`score-bar ${weighted ? "weighted" : ""}`}>
      <span>{label}</span>
      <div
        className="score-track"
        role="meter"
        aria-label={`${label} score`}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={5}
      >
        <i
          style={{ width: `${Math.max(0, Math.min(100, (value / 5) * 100))}%` }}
        />
      </div>
      <strong>
        {Number(value.toFixed(2))}
        <small>/5</small>
      </strong>
    </div>
  );
}
