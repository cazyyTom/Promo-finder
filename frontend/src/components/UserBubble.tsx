import { FileArchive } from "lucide-react";
import type { FileInfo } from "../api/types";
import { fileSize } from "../lib/time";
export function UserBubble({ file, files }: { file: FileInfo; files: number }) {
  return (
    <div className="user-bubble">
      <p>Find the strongest promo moments in this show.</p>
      <div className="file-chip">
        <FileArchive size={22} />
        <span>
          <strong>{file.name}</strong>
          <small>
            {file.size > 0 ? fileSize(file.size) : "Episode screenplay ZIP"}
            {files > 0 ? ` · ${files} files` : ""}
          </small>
        </span>
        <span className="zip-label">ZIP</span>
      </div>
    </div>
  );
}
