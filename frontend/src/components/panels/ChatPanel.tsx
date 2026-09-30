import { useRef, useState } from "react";
import { Send, ChevronDown, Paperclip, X, Download } from "lucide-react";
import SidePanel from "./SidePanel";
import { formatBytes } from "@/lib/file";

/** A file attached to a chat message (stored as a file attachment). */
export interface ChatAttachment {
  name: string;
  size: number;
  mime: string;
  /** Remote file URL (live) or a local object URL (demo). */
  url: string;
}

export interface ChatMessageVM {
  id: string;
  senderName: string;
  toName: string;
  message: string;
  timestamp: string;
  isLocal: boolean;
  files?: ChatAttachment[];
}

/** Attachment size caps enforced client-side. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES = 2;

interface ChatPanelProps {
  messages: ChatMessageVM[];
  onSend: (text: string, files: File[]) => void | Promise<void>;
  onClose: () => void;
  /** Download a received attachment (mode-specific: live fetch vs local URL). */
  onDownloadFile?: (file: ChatAttachment) => void;
  /** Host disabled chat for participants: composer is locked but history stays. */
  disabled?: boolean;
}

export default function ChatPanel({
  messages,
  onSend,
  onClose,
  onDownloadFile,
  disabled = false,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // reset so re-picking the same file fires onChange
    if (!picked.length) return;

    const room = MAX_FILES - attachments.length;
    const withinSize = picked.filter((f) => f.size <= MAX_FILE_BYTES);
    const accepted = withinSize.slice(0, room);

    if (picked.length > withinSize.length) {
      setFileError("Each file must be under 10 MB.");
    } else if (accepted.length < picked.length) {
      setFileError(`You can attach up to ${MAX_FILES} files per message.`);
    } else {
      setFileError(null);
    }
    if (accepted.length) setAttachments((prev) => [...prev, ...accepted]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
    setFileError(null);
  };

  const send = async () => {
    if (disabled || sending) return;
    const text = draft.trim();
    if (!text && attachments.length === 0) return;
    setSending(true);
    setSendError(null);
    try {
      await onSend(text, attachments);
      // Only clear on confirmed success — draft is preserved if the send fails.
      setDraft("");
      setAttachments([]);
      setFileError(null);
    } catch {
      setSendError("Message failed to send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const canSend = !sending && (!!draft.trim() || attachments.length > 0);
  const attachFull = attachments.length >= MAX_FILES;

  return (
    <SidePanel
      title="Chat"
      onClose={onClose}
      footer={
        disabled ? (
          <div className="rounded-lg bg-tile px-3 py-2.5 text-center text-xs text-text-secondary">
            Chat has been disabled by the host.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button className="flex items-center gap-1 self-start rounded px-1 text-xs text-text-secondary hover:text-text-primary">
              To: <span className="font-medium text-text-primary">Everyone</span>
              <ChevronDown className="h-3 w-3" />
            </button>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 rounded bg-panel-2 px-2 py-1 text-xs text-text-primary"
                  >
                    <Paperclip className="h-3 w-3 shrink-0 text-text-secondary" />
                    <span className="max-w-[110px] truncate">{f.name}</span>
                    <span className="text-text-muted">{formatBytes(f.size)}</span>
                    <button
                      onClick={() => removeAttachment(i)}
                      disabled={sending}
                      className="text-text-secondary hover:text-text-primary disabled:opacity-40"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {fileError && (
              <p className="text-xs text-leave-hover">{fileError}</p>
            )}
            {sendError && (
              <p className="text-xs text-leave-hover" role="alert">{sendError}</p>
            )}

            <div className="flex items-end gap-2 rounded-lg bg-tile px-3 py-2">
              <textarea
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Type message here..."
                className="max-h-24 flex-1 resize-none bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFiles}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={attachFull || sending}
                title={
                  attachFull
                    ? `Up to ${MAX_FILES} files, 10 MB each`
                    : "Attach files"
                }
                className="text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Attach files"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                onClick={() => void send()}
                className="text-zoom-blue disabled:text-text-muted"
                disabled={!canSend}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )
      }
    >
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-text-secondary">
          No messages yet. Say hello!
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          {messages.map((m) => (
            <div key={m.id} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-text-primary">
                  {m.isLocal ? "You" : m.senderName}
                </span>
                <span className="text-xs text-text-secondary">to {m.toName}</span>
                <span className="ml-auto text-xs text-text-muted">{m.timestamp}</span>
              </div>
              {m.message && (
                <p className="text-sm leading-snug text-text-primary/90">{m.message}</p>
              )}
              {m.files && m.files.length > 0 && (
                <div className="mt-0.5 flex flex-col gap-1">
                  {m.files.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => onDownloadFile?.(f)}
                      className="flex items-center gap-2 rounded-md bg-tile px-2 py-1.5 text-left text-xs text-text-primary hover:bg-hover"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="shrink-0 text-text-muted">{formatBytes(f.size)}</span>
                      <Download className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SidePanel>
  );
}
