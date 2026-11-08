import { uniqueId } from "./lib/id";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  RotateCcw,
  X,
  ShieldCheck,
  Zap,
  Eye,
  CircleHelp,
} from "lucide-react";
import { api, ApiError, messageOf, validateUpload } from "./api/client";
import type { ChatMessage, FileInfo } from "./api/types";
import { APP_NAME, API_BASE_URL, STORAGE_PREFIX, USE_MOCK } from "./config";
import { useAnalysis } from "./hooks/useAnalysis";
import { useHistory } from "./hooks/useHistory";
import { useHealth } from "./hooks/useHealth";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Welcome } from "./components/Welcome";
import { Composer } from "./components/Composer";
import { SuggestionCards } from "./components/SuggestionCards";
import { Thread } from "./components/Thread";
import { DropOverlay } from "./components/DropOverlay";
import { Dialog } from "./components/Dialog";
import { ErrorCard } from "./components/ErrorCard";
import { copyText, promosText } from "./lib/clipboard";
import { downloadBlob, downloadJson } from "./lib/download";
function routeId() {
  const match = /^\/a\/([^/]+)\/?$/.exec(location.pathname);
  try {
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}
function storedName() {
  try {
    return localStorage.getItem("promo-finder:editor-name") || "Editor";
  } catch {
    return "Editor";
  }
}
function storedFile(id: string | null): FileInfo | null {
  try {
    const v: unknown = JSON.parse(
      localStorage.getItem(`${STORAGE_PREFIX}:file:${id}`) || "null",
    );
    if (
      typeof v === "object" &&
      v !== null &&
      "name" in v &&
      typeof v.name === "string" &&
      "size" in v &&
      typeof v.size === "number"
    )
      return { name: v.name, size: v.size };
  } catch {
    /* optional metadata */
  }
  return null;
}
export default function App() {
  const [id, setId] = useState<string | null>(routeId),
    [sidebarOpen, setSidebarOpen] = useState(
      () => window.matchMedia("(min-width: 801px)").matches,
    );
  const [name, setName] = useState(storedName),
    [nameDraft, setNameDraft] = useState(name),
    [dialog, setDialog] = useState<"name" | "ranking" | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null),
    [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<FileInfo | null>(() =>
      storedFile(id),
    ),
    [dragging, setDragging] = useState(false),
    [notice, setNotice] = useState("");
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({}),
    [chatBusy, setChatBusy] = useState(false),
    [chatDisabled, setChatDisabled] = useState<Record<string, boolean>>({}),
    [downloading, setDownloading] = useState(false);
  const picker = useRef<HTMLInputElement>(null),
    lastFiles = useRef(new Map<string, File>()),
    uploadController = useRef<AbortController | null>(null),
    chatController = useRef<AbortController | null>(null),
    dragCount = useRef(0),
    bottom = useRef<HTMLDivElement>(null);
  const history = useHistory(),
    health = useHealth(),
    analysis = useAnalysis(id);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const notify = useCallback((text: string) => setNotice(text), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    document.title = APP_NAME;
    const pop = () => {
      uploadController.current?.abort();
      setUploading(false);
      setId(routeId());
      setPendingFile(null);
      setUploadError(null);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    setActiveFile(storedFile(id));
    chatController.current?.abort();
    setChatBusy(false);
  }, [id]);
  useEffect(
    () => () => {
      uploadController.current?.abort();
      chatController.current?.abort();
    },
    [],
  );
  const updateHistoryStatus = history.setStatus;
  useEffect(() => {
    if (id && analysis.status) updateHistoryStatus(id, analysis.status.status);
  }, [id, analysis.status?.status, updateHistoryStatus]);
  useEffect(() => {
    if (chatBusy)
      bottom.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "end",
      });
  }, [chatBusy]);
  function navigate(next: string | null) {
    uploadController.current?.abort();
    setUploading(false);
    setId(next);
    window.history.pushState(
      {},
      "",
      next ? `/a/${encodeURIComponent(next)}` : "/",
    );
    setPendingFile(null);
    setUploadError(null);
    if (window.matchMedia("(max-width: 800px)").matches) setSidebarOpen(false);
  }
  function newAnalysis() {
    navigate(null);
    setActiveFile(null);
  }
  const pick = () => picker.current?.click();
  function selectFile(file: File) {
    const error = validateUpload(file);
    if (error) {
      setUploadError(error);
      return;
    }
    setPendingFile(file);
    setUploadError(null);
  }
  async function upload(file: File) {
    const invalid = validateUpload(file);
    if (invalid) {
      setUploadError(invalid);
      return;
    }
    uploadController.current?.abort();
    const controller = new AbortController();
    uploadController.current = controller;
    setUploading(true);
    setUploadError(null);
    setActiveFile({ name: file.name, size: file.size });
    try {
      const nextId = await api.upload(file, controller.signal);
      if (controller.signal.aborted) return;
      lastFiles.current.set(nextId, file);
      try {
        localStorage.setItem(
          `${STORAGE_PREFIX}:file:${nextId}`,
          JSON.stringify({ name: file.name, size: file.size }),
        );
      } catch {
        /* history hook reports storage availability */
      }
      history.add({
        analysis_id: nextId,
        title: file.name,
        createdAt: new Date().toISOString(),
        lastStatus: "uploaded",
      });
      setId(nextId);
      window.history.pushState({}, "", `/a/${encodeURIComponent(nextId)}`);
      setPendingFile(null);
    } catch (e) {
      if (!controller.signal.aborted) setUploadError(messageOf(e));
    } finally {
      if (!controller.signal.aborted) setUploading(false);
    }
  }
  async function sample() {
    if (uploading) return;
    setUploadError(null);
    try {
      const response = await fetch("/synthetic-show.zip");
      if (!response.ok) throw new Error("Sample ZIP could not be loaded.");
      await upload(
        new File([await response.blob()], "The last alibi · sample.zip", {
          type: "application/zip",
        }),
      );
    } catch (e) {
      if (USE_MOCK)
        await upload(
          new File(["synthetic fixture"], "sample-show.zip", {
            type: "application/zip",
          }),
        );
      else setUploadError(messageOf(e));
    }
  }
  async function chat(question: string) {
    if (!id || !analysis.results || chatBusy || chatDisabled[id]) return;
    const key = id;
    const controller = new AbortController();
    chatController.current = controller;
    setMessages((old) => ({
      ...old,
      [key]: [
        ...(old[key] || []),
        { id: uniqueId(), role: "user", text: question },
      ],
    }));
    setChatBusy(true);
    try {
      const reply = await api.chat(key, question, controller.signal);
      if (controller.signal.aborted) return;
      setMessages((old) => ({
        ...old,
        [key]: [
          ...(old[key] || []),
          {
            id: uniqueId(),
            role: "assistant",
            text: reply.answer,
            citations: reply.citations,
          },
        ],
      }));
    } catch (e) {
      if (controller.signal.aborted) return;
      const disabled = e instanceof ApiError && [404, 501].includes(e.status);
      if (disabled) setChatDisabled((old) => ({ ...old, [key]: true }));
      setMessages((old) => ({
        ...old,
        [key]: [
          ...(old[key] || []),
          {
            id: uniqueId(),
            role: "assistant",
            text: disabled
              ? "Follow-up chat is not enabled on this server"
              : messageOf(e),
            error: !disabled,
          },
        ],
      }));
    } finally {
      if (!controller.signal.aborted) setChatBusy(false);
    }
  }
  async function send(text: string) {
    if (pendingFile) {
      await upload(pendingFile);
      return;
    }
    if (analysis.results && id) {
      if (chatDisabled[id]) {
        notify("Follow-up chat is not enabled on this server.");
        return;
      }
      await chat(text);
      return;
    }
    if (/rank|score|how/i.test(text)) {
      setDialog("ranking");
      return;
    }
    notify(
      "Attach a ZIP first. You can ask questions about the promos once the analysis is complete.",
    );
  }
  async function download(idToDownload: string, format: "json" | "csv") {
    setDownloading(true);
    try {
      if (format === "csv")
        downloadBlob(await api.csv(idToDownload), `promos-${idToDownload}.csv`);
      else {
        const r =
          idToDownload === id && analysis.results
            ? analysis.results
            : await api.results(idToDownload);
        downloadJson(r.raw, `promos-${idToDownload}.json`);
      }
      notify(`Downloaded ${format.toUpperCase()}`);
    } catch (e) {
      notify(messageOf(e));
    } finally {
      setDownloading(false);
    }
  }
  async function copyAll() {
    if (!analysis.results) return;
    try {
      await copyText(promosText(analysis.results.promos));
      notify("All promos copied");
    } catch (e) {
      notify(messageOf(e));
    }
  }
  function retryUpload() {
    const file = id ? lastFiles.current.get(id) : pendingFile;
    if (file) void upload(file);
    else {
      notify(
        "Choose the original ZIP to retry. Files are not stored in your browser.",
      );
      pick();
    }
  }
  const thread = Boolean(id || uploading),
    file = activeFile || {
      name:
        history.items.find((h) => h.analysis_id === id)?.title ||
        "Episode scripts.zip",
      size: 0,
    };
  const onDrag = (e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    dragCount.current++;
    setDragging(true);
  };
  return (
    <div
      className="app-window"
      onDragEnter={onDrag}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files"))
          e.preventDefault();
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragCount.current--;
        if (dragCount.current <= 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragCount.current = 0;
        setDragging(false);
        if (uploading) return;
        const files = Array.from(e.dataTransfer.files);
        if (files.length !== 1) {
          setUploadError("Please upload one ZIP at a time.");
          return;
        }
        selectFile(files[0]);
      }}
    >
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Sidebar
        items={history.items}
        loading={history.loading}
        open={sidebarOpen}
        onClose={closeSidebar}
        onNew={newAnalysis}
        onSelect={navigate}
        selected={id}
        onRename={history.rename}
        onRemove={(key) => {
          history.remove(key);
          if (key === id) newAnalysis();
          notify("Removed from this list only. Server data was not deleted.");
        }}
        onDownload={(key, f) => void download(key, f)}
        onHelp={() => setDialog("ranking")}
      />
      <div className="main-window">
        <TopBar
          name={name}
          onMenu={() => setSidebarOpen(true)}
          onProfile={() => {
            setNameDraft(name);
            setDialog("name");
          }}
          collapsed={!sidebarOpen}
        />
        {health.unreachable && (
          <div className="server-banner" role="alert">
            <AlertTriangle size={17} />
            <div>
              <strong>Can’t reach the server</strong>
              <span>{API_BASE_URL}</span>
            </div>
            <button disabled={health.checking} onClick={health.retry}>
              <RotateCcw size={14} />
              {health.checking ? "Checking…" : "Retry"}
            </button>
          </div>
        )}
        {history.storageWarning && (
          <div className="storage-banner">
            Browser storage is unavailable. Keep this page open; history may not
            be saved.
          </div>
        )}
        <main
          id="main"
          className={`main-content ${thread ? "thread-mode" : "welcome-mode"}`}
        >
          <div className="main-texture" />
          {thread ? (
            <div className="thread-scroll">
              <Thread
                file={file}
                status={uploading ? null : analysis.status}
                results={uploading ? null : analysis.results}
                loading={!uploading && analysis.loading}
                error={analysis.error}
                onRefresh={analysis.refresh}
                onRetry={retryUpload}
                onNotice={notify}
                onDownload={(f) => {
                  if (id) void download(id, f);
                }}
                onCopy={() => void copyAll()}
                chats={id ? messages[id] || [] : []}
                onChat={(q) => void chat(q)}
                chatBusy={chatBusy}
                chatDisabled={Boolean(id && chatDisabled[id])}
                downloading={downloading}
              />
              <div ref={bottom} />
            </div>
          ) : (
            <div className="welcome-content">
              <Welcome
                name={name}
                onEdit={() => {
                  setNameDraft(name);
                  setDialog("name");
                }}
              />
              <div className="welcome-composer">
                {uploadError && (
                  <ErrorCard
                    message={uploadError}
                    onRetry={() =>
                      pendingFile ? void upload(pendingFile) : pick()
                    }
                    title="Couldn’t upload that ZIP"
                  />
                )}
                <Composer
                  model={health.health?.model || "Gemini"}
                  file={pendingFile}
                  onClear={() => setPendingFile(null)}
                  onPick={pick}
                  onSend={send}
                  busy={uploading}
                  chatReady={false}
                  thread={false}
                />
                <SuggestionCards
                  onUpload={pick}
                  onSample={() => void sample()}
                  onRanking={() => setDialog("ranking")}
                  busy={uploading}
                />
                <div className="welcome-footnote">
                  <ShieldCheck size={13} />
                  <span>Source-accurate timestamps</span>
                  <span className="footnote-dot" />
                  <span>Story-first ranking</span>
                </div>
              </div>
            </div>
          )}
          {thread && (
            <div className="composer-dock">
              {uploadError && (
                <ErrorCard
                  message={uploadError}
                  onRetry={retryUpload}
                  title="Couldn’t upload that ZIP"
                />
              )}
              <Composer
                key={id || "upload"}
                model={health.health?.model || "Gemini"}
                file={pendingFile}
                onClear={() => setPendingFile(null)}
                onPick={pick}
                onSend={send}
                busy={uploading || chatBusy}
                chatReady={Boolean(analysis.results)}
                thread
              />
            </div>
          )}
        </main>
      </div>
      <input
        className="sr-only"
        ref={picker}
        type="file"
        accept=".zip,application/zip"
        aria-label="ZIP file picker"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) selectFile(f);
          e.target.value = "";
        }}
        tabIndex={-1}
      />
      <DropOverlay visible={dragging} />
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {dialog === "name" && (
        <Dialog title="Make it your workspace" onClose={() => setDialog(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = nameDraft.trim() || "Editor";
              setName(value);
              try {
                localStorage.setItem("promo-finder:editor-name", value);
              } catch {
                notify("Name updated for this session.");
              }
              setDialog(null);
            }}
          >
            <label htmlFor="editor-name">What should we call you?</label>
            <input
              id="editor-name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={30}
              autoFocus
            />
            <button className="primary-button">Save name</button>
          </form>
        </Dialog>
      )}
      {dialog === "ranking" && (
        <Dialog
          title="A great promo earns its place."
          onClose={() => setDialog(null)}
        >
          <p className="dialog-lead">
            Eligibility comes first. A high score can’t rescue a cut that
            doesn’t work.
          </p>
          <div className="ranking-rules">
            <div>
              <Zap size={20} />
              <strong>A hook in 3 seconds</strong>
              <p>A specific line, action, or visual beat stops the scroll.</p>
              <b>40%</b>
            </div>
            <div>
              <CircleHelp size={20} />
              <strong>A real cliffhanger</strong>
              <p>
                An unanswered question gives the viewer a reason to keep
                watching.
              </p>
              <b>35%</b>
            </div>
            <div>
              <Eye size={20} />
              <strong>Standalone clarity</strong>
              <p>
                The immediate conflict and stakes make sense to a first-time
                viewer.
              </p>
              <b>25%</b>
            </div>
          </div>
          <div className="formula">
            Score = 0.40 × hook + 0.35 × cliffhanger + 0.25 × clarity
          </div>
          <p className="dialog-note">
            All three must pass. Eligible cuts are 20–60 seconds, use verified
            source boundaries, and preserve complete dialogue. Scores rank only
            the cuts that qualify.
          </p>
        </Dialog>
      )}
    </div>
  );
}
