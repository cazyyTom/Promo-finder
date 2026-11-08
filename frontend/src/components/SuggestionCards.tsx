import {
  FileArchive,
  Play,
  ChartNoAxesCombined,
  ArrowUpRight,
} from "lucide-react";
export function SuggestionCards({
  onUpload,
  onSample,
  onRanking,
  busy,
}: {
  onUpload: () => void;
  onSample: () => void;
  onRanking: () => void;
  busy: boolean;
}) {
  const cards = [
    {
      title: "Upload episode scripts",
      description: "One ZIP. Your whole story.",
      Icon: FileArchive,
      action: onUpload,
    },
    {
      title: "Try the sample show",
      description: "See a story become a shortlist.",
      Icon: Play,
      action: onSample,
    },
    {
      title: "How ranking works",
      description: "Great hooks. Clear stakes. More.",
      Icon: ChartNoAxesCombined,
      action: onRanking,
    },
  ];
  return (
    <div className="suggestions">
      {cards.map(({ title, description, Icon, action }) => (
        <button
          className="suggestion"
          key={title}
          onClick={action}
          disabled={busy}
        >
          <span className="suggestion-icon">
            <Icon size={19} />
          </span>
          <span>
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
          <ArrowUpRight className="suggestion-arrow" size={14} />
        </button>
      ))}
    </div>
  );
}
