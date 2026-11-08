import {
  MoreHorizontal,
  Pencil,
  Download,
  Trash2,
  MessageSquare,
  Check,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import type { HistoryEntry } from "../api/types";
import { terminal } from "../api/types";
export function HistoryItem({
  item,
  active,
  onSelect,
  onRename,
  onRemove,
  onDownload,
}: {
  item: HistoryEntry;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onRemove: () => void;
  onDownload: (format: "json" | "csv") => void;
}) {
  const [renaming, setRenaming] = useState(false),
    [title, setTitle] = useState(item.title);
  const details = useRef<HTMLDetailsElement>(null);
  function action(fn: () => void) {
    if (details.current) details.current.open = false;
    fn();
  }
  if (renaming)
    return (
      <form
        className="rename-form"
        onSubmit={(e) => {
          e.preventDefault();
          onRename(title);
          setRenaming(false);
        }}
      >
        <input
          aria-label="Analysis title"
          value={title}
          maxLength={100}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setRenaming(false);
          }}
        />
        <button className="icon-button" aria-label="Save title">
          <Check size={14} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Cancel rename"
          onClick={() => setRenaming(false)}
        >
          <X size={14} />
        </button>
      </form>
    );
  return (
    <div className={`history-item ${active ? "active" : ""}`}>
      <button
        className="history-select"
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
      >
        <MessageSquare size={14} />
        <span className="history-title">{item.title}</span>
        <span
          className={`status-dot ${item.lastStatus}`}
          title={item.lastStatus}
        />
        <span className="sr-only">{item.lastStatus}</span>
      </button>
      <details
        ref={details}
        className="history-menu"
        onKeyDown={(e) => {
          if (e.key === "Escape" && details.current) {
            details.current.open = false;
            details.current.querySelector("summary")?.focus();
          }
        }}
      >
        <summary aria-label={`Options for ${item.title}`}>
          <MoreHorizontal size={16} />
        </summary>
        <div className="menu-popover">
          <button onClick={() => action(() => setRenaming(true))}>
            <Pencil size={14} />
            Rename
          </button>
          <button
            disabled={!terminal(item.lastStatus)}
            onClick={() => action(() => onDownload("json"))}
          >
            <Download size={14} />
            Download JSON
          </button>
          <button
            disabled={!terminal(item.lastStatus)}
            onClick={() => action(() => onDownload("csv"))}
          >
            <Download size={14} />
            Download CSV
          </button>
          <button onClick={() => action(onRemove)}>
            <Trash2 size={14} />
            <span>
              Remove from list<small>Local only · server data stays</small>
            </span>
          </button>
        </div>
      </details>
    </div>
  );
}
