import { Menu } from "lucide-react";
import { APP_NAME, USE_MOCK } from "../config";
import { Logo } from "./Logo";
export function TopBar({
  name,
  onMenu,
  onProfile,
  collapsed,
}: {
  name: string;
  onMenu: () => void;
  onProfile: () => void;
  collapsed: boolean;
}) {
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "E";
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <button
          className={`icon-button sidebar-toggle ${collapsed ? "show-toggle" : ""}`}
          aria-label="Open sidebar"
          onClick={onMenu}
        >
          <Menu size={19} />
        </button>
        <Logo />
        <span className="brand-name">{APP_NAME}</span>
        <span className="workspace-label">EDITOR WORKSPACE</span>
      </div>
      <div className="topbar-right">
        {USE_MOCK && (
          <span className="demo-badge">
            <span />
            Demo mode
          </span>
        )}
        <button
          className="avatar"
          aria-label="Edit your name"
          title="Edit your name"
          onClick={onProfile}
        >
          {initials}
        </button>
      </div>
    </header>
  );
}
