import { FileArchive } from "lucide-react";
import { MAX_UPLOAD_MB } from "../config";
export function DropOverlay({ visible }: { visible: boolean }) {
  return visible ? (
    <div className="drop-overlay" role="status">
      <div>
        <FileArchive size={42} />
        <h2>Drop your next great story.</h2>
        <p>A ZIP of episode scripts · up to {MAX_UPLOAD_MB} MB</p>
      </div>
    </div>
  ) : null;
}
