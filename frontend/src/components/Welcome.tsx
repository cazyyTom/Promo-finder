import { Pencil, Sparkles } from "lucide-react";
import { Orb } from "./Orb";
export function Welcome({
  name,
  onEdit,
}: {
  name: string;
  onEdit: () => void;
}) {
  return (
    <div className="welcome">
      <Orb />
      <span className="eyebrow">
        <Sparkles size={12} /> EVERY STORY HAS A MOMENT
      </span>
      <h1>
        Welcome back, {name}!
        <button
          className="edit-name icon-button"
          aria-label="Edit welcome name"
          onClick={onEdit}
        >
          <Pencil size={15} />
        </button>
      </h1>
      <p>Which show do you want to find promos for today?</p>
    </div>
  );
}
