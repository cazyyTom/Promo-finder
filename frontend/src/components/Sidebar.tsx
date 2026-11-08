import {
  ArrowUpRight,
  Archive,
  PanelLeftClose,
  Search,
  SquarePen,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HistoryEntry } from "../api/types";
import { groupHistory } from "../lib/buckets";
import { HistoryItem } from "./HistoryItem";
export function Sidebar({
  items,
  loading,
  open,
  onClose,
  onNew,
  onSelect,
  selected,
  onRename,
  onRemove,
  onDownload,
  onHelp,
}: {
  items: HistoryEntry[];
  loading: boolean;
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  selected: string | null;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  onDownload: (id: string, format: "json" | "csv") => void;
  onHelp: () => void;
}) {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null),
    panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || !window.matchMedia("(max-width: 800px)").matches) return;
    const previous = document.activeElement;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function trap(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = panel.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]),input,summary",
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open, onClose]);
  useEffect(() => {
    function shortcut(e: globalThis.KeyboardEvent) {
      const target = e.target;
      if (
        open &&
        e.key === "/" &&
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        search.current?.focus();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [open]);
  const groups = groupHistory(items, query);
  return (
    <>
      <button
        className={`drawer-scrim ${open ? "visible" : ""}`}
        aria-label="Close sidebar"
        onClick={onClose}
        tabIndex={-1}
      />
      <aside
        ref={panel}
        className={`sidebar ${open ? "open" : "collapsed"}`}
        aria-label="Analysis history"
        aria-hidden={!open}
      >
        <div className="sidebar-tools">
          <button
            className="icon-button accent-icon"
            title="New analysis"
            aria-label="New analysis"
            onClick={onNew}
          >
            <SquarePen size={19} />
          </button>
          <button
            className="icon-button"
            title="Search all analyses"
            aria-label="Search all analyses"
            onClick={() => search.current?.focus()}
          >
            <Archive size={18} />
          </button>
          <button
            className="icon-button collapse-button"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            onClick={onClose}
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
        <div className="search-field">
          <Search size={15} />
          <input
            ref={search}
            aria-label="Search history"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your shows"
          />
          <kbd>/</kbd>
        </div>
        <div className="history-heading">
          <span>YOUR WORKSPACE</span>
          <span>
            {items.length ? String(items.length).padStart(2, "0") : "—"}
          </span>
        </div>
        <nav className="history-scroll" aria-label="Previous analyses">
          {loading ? (
            <div className="history-skeleton" aria-label="Loading history">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton" />
              ))}
            </div>
          ) : groups.length ? (
            groups.map((group) => (
              <section className="history-group" key={group.label}>
                <h2>{group.label}</h2>
                {group.items.map((item) => (
                  <HistoryItem
                    key={item.analysis_id}
                    item={item}
                    active={item.analysis_id === selected}
                    onSelect={() => onSelect(item.analysis_id)}
                    onRename={(title) => onRename(item.analysis_id, title)}
                    onRemove={() => onRemove(item.analysis_id)}
                    onDownload={(format) =>
                      onDownload(item.analysis_id, format)
                    }
                  />
                ))}
              </section>
            ))
          ) : (
            <div className="history-empty">
              <span className="empty-lines">
                <i />
                <i />
                <i />
              </span>
              <p>{query ? "No shows found" : "A home for your stories"}</p>
              <small>
                {query
                  ? "Try a different search."
                  : "Your analyses will appear here. Start with a ZIP or explore the sample."}
              </small>
            </div>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="another-show">
            <Sparkles size={20} />
            <h3>Have another show?</h3>
            <p>Find its can’t-scroll-past moment.</p>
            <button aria-label="Start another analysis" onClick={onNew}>
              <ArrowUpRight size={19} />
            </button>
          </div>
          <button className="help-link" onClick={onHelp}>
            <HelpCircle size={15} />
            <span>A little help finding the moment</span>
            <ArrowUpRight size={13} />
          </button>
          <div className="sidebar-footer">
            <span className="tiny-square" /> MADE FOR THE EDIT
          </div>
        </div>
      </aside>
    </>
  );
}
