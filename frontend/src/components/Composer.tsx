import { ArrowUp, Paperclip, Sparkles, X, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { MAX_UPLOAD_MB } from "../config";
import { fileSize } from "../lib/time";
export function Composer({
  model,
  file,
  onClear,
  onPick,
  onSend,
  busy,
  chatReady,
  thread,
}: {
  model: string;
  file: File | null;
  onClear: () => void;
  onPick: () => void;
  onSend: (text: string) => Promise<void>;
  busy: boolean;
  chatReady: boolean;
  thread: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  async function submit() {
    if (busy) return;
    if (!file && !text.trim()) {
      onPick();
      return;
    }
    const message = text.trim();
    setText("");
    await onSend(message);
  }
  function keyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }
  return (
    <div className="composer-wrap">
      <form
        className={`composer ${file ? "has-file" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {file && (
          <div className="pending-file">
            <Paperclip size={14} />
            <span>{file.name}</span>
            <small>{fileSize(file.size)}</small>
            <button
              type="button"
              className="icon-button"
              aria-label="Remove selected file"
              onClick={onClear}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <label className="sr-only" htmlFor="composer">
          {chatReady
            ? "Ask about your promos"
            : "Upload scripts or ask a question"}
        </label>
        <textarea
          id="composer"
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={keyDown}
          rows={1}
          maxLength={4000}
          placeholder={
            chatReady
              ? "Ask about your promos, or drop another ZIP…"
              : "Drop a ZIP of episode scripts, or ask a question..."
          }
          disabled={busy}
        />
        <div className="composer-controls">
          <div className="composer-tools">
            <button
              type="button"
              className="attach-button"
              aria-label="Attach a ZIP of episode scripts"
              onClick={onPick}
              disabled={busy}
            >
              <Paperclip size={17} />
            </button>
            <span className="engine-chip">
              <Sparkles size={13} />
              {model}
            </span>
            {!thread && (
              <span className="composer-limit">
                .zip · up to {MAX_UPLOAD_MB} MB
              </span>
            )}
          </div>
          <button
            type="submit"
            className="send-button"
            aria-label={
              file ? "Analyze ZIP" : text.trim() ? "Send message" : "Choose ZIP"
            }
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle size={20} className="spin" />
            ) : (
              <ArrowUp size={21} />
            )}
          </button>
        </div>
      </form>
      <p className="composer-caption">
        Your story. The strongest moments.{" "}
        <span>Always review cuts before posting.</span>
      </p>
    </div>
  );
}
