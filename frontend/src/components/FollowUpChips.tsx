export function FollowUpChips({
  onSelect,
  disabled,
}: {
  onSelect: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="follow-up-chips" aria-label="Suggested follow-up questions">
      {[
        "Why did #1 rank above #2?",
        "Which promo is safest to post first?",
        "Which cuts were rejected and why?",
      ].map((q) => (
        <button disabled={disabled} key={q} onClick={() => onSelect(q)}>
          {q}
          <span>↗</span>
        </button>
      ))}
    </div>
  );
}
