'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { m } from 'framer-motion';
import Link from 'next/link';
import AccountMenu from '@/components/AccountMenu';
import Sheet from '@/components/ui/Sheet';
import SegmentedControl from '@/components/ui/SegmentedControl';
import {
  CHAT_MODELS,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  EFFORTS,
  findModel,
  type Effort,
} from '@/lib/agent/models';

/**
 * The app's home screen and one constant: the chatbox. Everything else in
 * Habitator is furniture the agent behind this screen can add, change, or
 * remove — so this component stays deliberately small and self-contained
 * (its own fetches, no lib/client coupling) and sits on the build agent's
 * protected-paths list.
 */

interface ChatListItem {
  id: number;
  title: string;
  created_at: string;
}

interface Attachment {
  kind: 'image' | 'text';
  name: string;
  mime: string;
  /** Images: a base64 data URL. Text files: the decoded text. */
  data: string;
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  build_id: number | null;
  attachments?: Attachment[];
}

interface Props {
  username: string;
  initialChats: ChatListItem[];
}

const MAX_ATTACHMENTS = 6;
/** Long edge photos are downscaled to before upload — plenty for the model. */
const MAX_IMAGE_EDGE = 1400;
const MAX_TEXT_CHARS = 20000;
const PREFS_KEY = 'habitator.chat.prefs';

const TEXT_EXT =
  /\.(txt|md|markdown|csv|tsv|json|ya?ml|log|ts|tsx|js|jsx|mjs|css|html?|xml|sql|py|rb|go|rs|sh|toml|ini|conf|env)$/i;

function isTextFile(file: File): boolean {
  return (
    file.type.startsWith('text/') ||
    /json|xml|csv|javascript|typescript|markdown/.test(file.type) ||
    TEXT_EXT.test(file.name)
  );
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Shrink a photo before it ever leaves the phone: a 12MP camera shot is ~4MB of
 * base64 that bills as input tokens by area, and the model reads a 1400px copy
 * just as well.
 */
function downscale(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context.'));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('Could not decode that image.'));
    img.src = dataUrl;
  });
}

async function toAttachment(file: File): Promise<Attachment> {
  if (file.type.startsWith('image/')) {
    const raw = await readAsDataURL(file);
    try {
      const shrunk = await downscale(raw);
      return { kind: 'image', name: file.name || 'photo.jpg', mime: 'image/jpeg', data: shrunk };
    } catch {
      // HEIC and friends the browser can't decode — send the original and let
      // the API decide.
      return { kind: 'image', name: file.name || 'photo', mime: file.type, data: raw };
    }
  }
  if (isTextFile(file)) {
    const text = (await file.text()).slice(0, MAX_TEXT_CHARS);
    return { kind: 'text', name: file.name, mime: file.type || 'text/plain', data: text };
  }
  throw new Error(
    `Can't read ${file.name} — attach an image or a text file (PDFs and Office docs aren't supported).`
  );
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    let msg = `Request failed (${res.status}).`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  return res.json();
}

export default function ChatScreen({ username, initialChats }: Props) {
  const [chats, setChats] = useState<ChatListItem[]>(initialChats);
  const [chatId, setChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const [drafts, setDrafts] = useState<Attachment[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [effort, setEffort] = useState<Effort>(DEFAULT_EFFORT);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The model/effort pick is a device-level preference, not chat state — keep it
  // across sessions so the choice sticks. Read after mount (the server render
  // can't see localStorage) and written by the picker itself: a save *effect*
  // would fire once with the pre-load defaults and wipe what we just read.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (findModel(saved.model)) setModel(saved.model);
      if (EFFORTS.some((e) => e.value === saved.effort)) setEffort(saved.effort);
    } catch {
      /* no saved prefs */
    }
  }, []);

  function savePrefs(next: { model?: string; effort?: Effort }) {
    const merged = { model, effort, ...next };
    setModel(merged.model);
    setEffort(merged.effort);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
    } catch {
      /* private mode — the in-memory pick still works */
    }
  }

  const scrollDown = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    scrollDown();
  }, [messages, drafts, scrollDown]);

  // While a build is in flight, poll the open chat — the workflow's callback
  // appends the "✓ Live" / "✗ failed" message and this picks it up.
  useEffect(() => {
    if (!pending || chatId === null) return;
    const t = setInterval(async () => {
      try {
        const data = await getJson<{ messages: Message[]; pending: boolean }>(
          `/api/chat?chatId=${chatId}`
        );
        setMessages(data.messages);
        setPending(data.pending);
      } catch {
        /* transient — keep polling */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [pending, chatId]);

  async function openChat(id: number) {
    setHistoryOpen(false);
    setChatId(id);
    setError(null);
    try {
      const data = await getJson<{ messages: Message[]; pending: boolean }>(
        `/api/chat?chatId=${id}`
      );
      setMessages(data.messages);
      setPending(data.pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chat.');
    }
  }

  function newChat() {
    setHistoryOpen(false);
    setChatId(null);
    setMessages([]);
    setError(null);
    setPending(false);
    setDrafts([]);
    inputRef.current?.focus();
  }

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setAttachOpen(false);
    setError(null);
    const room = MAX_ATTACHMENTS - drafts.length;
    if (room <= 0) {
      setError(`At most ${MAX_ATTACHMENTS} attachments per message.`);
      return;
    }
    const picked = Array.from(list).slice(0, room);
    const added: Attachment[] = [];
    for (const file of picked) {
      try {
        added.push(await toAttachment(file));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not attach that file.');
      }
    }
    if (added.length > 0) setDrafts((prev) => [...prev, ...added]);
  }

  function removeDraft(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  async function send() {
    const text = input.trim();
    if ((text === '' && drafts.length === 0) || busy) return;
    const sending = drafts;
    setBusy(true);
    setError(null);
    setInput('');
    setDrafts([]);
    // Optimistic echo — replaced wholesale by the server's rows on success.
    setMessages((prev) => [
      ...prev,
      { id: -1, role: 'user', content: text, build_id: null, attachments: sending },
    ]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          message: text,
          attachments: sending,
          model,
          effort,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status}).`);
      const result = data as {
        chatId: number;
        userMessage: Message;
        reply: Message;
        buildQueued: boolean;
        attachments: Attachment[];
      };
      if (chatId === null) {
        setChatId(result.chatId);
        // Surface the new chat in the drawer list without a refetch.
        setChats((prev) => [
          {
            id: result.chatId,
            title: (text || sending[0]?.name || 'Attachment').slice(0, 60),
            created_at: '',
          },
          ...prev,
        ]);
      }
      setMessages((prev) => [
        ...prev.filter((msg) => msg.id !== -1),
        { ...result.userMessage, attachments: result.attachments ?? [] },
        result.reply,
      ]);
      if (result.buildQueued) setPending(true);
    } catch (e) {
      setMessages((prev) => prev.filter((msg) => msg.id !== -1));
      setInput(text);
      setDrafts(sending);
      setError(e instanceof Error ? e.message : 'Send failed.');
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends on hardware keyboards; Shift+Enter breaks a line. (Phones
    // send via the button — their Enter inserts a newline as usual.)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const hasImages = drafts.some((a) => a.kind === 'image');
  const selected = findModel(model);
  const effortLabel = EFFORTS.find((e) => e.value === effort)?.label ?? 'Low';

  return (
    <div className="flex h-dvh flex-col pb-2">
      {/* Header */}
      <header className="flex items-center justify-between py-3">
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          aria-label="Chat history"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary active:bg-surface2"
        >
          <HistoryIcon />
        </button>
        <h1 className="font-display text-lg font-bold">Habitator</h1>
        <div className="flex items-center gap-2">
          {/* The one route link on the home screen. The chat is still the front
              door (no bottom nav), but the day's tasks are a place you go back
              to constantly — worth a tap rather than a typed URL. */}
          <Link
            href="/tasks"
            aria-label="Tasks"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary active:bg-surface2"
          >
            <TasksIcon />
          </Link>
          <button
            type="button"
            onClick={newChat}
            aria-label="New chat"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary active:bg-surface2"
          >
            <PlusIcon />
          </button>
          <AccountMenu username={username} />
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="font-display text-xl font-bold">What do you want?</p>
            <p className="max-w-[260px] text-sm text-text-secondary">
              Ask about your data, log something, or tell me to change the app
              itself.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2 py-2">
            {messages.map((msg) => (
              <li
                key={msg.id}
                className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={
                    msg.role === 'user'
                      ? 'flex max-w-[85%] flex-col items-end gap-1'
                      : 'flex max-w-[85%] flex-col items-start gap-1'
                  }
                >
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1">
                      {msg.attachments.map((att, i) =>
                        att.kind === 'image' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={att.data}
                            alt={att.name || 'Attached image'}
                            className="max-h-40 max-w-[160px] rounded-xl border border-border object-cover"
                          />
                        ) : (
                          <span
                            key={i}
                            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary"
                          >
                            <FileIcon />
                            {att.name || 'file.txt'}
                          </span>
                        )
                      )}
                    </div>
                  )}
                  {msg.content && (
                    <div
                      className={
                        msg.role === 'user'
                          ? 'whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-white'
                          : 'whitespace-pre-wrap rounded-2xl rounded-bl-md bg-surface2 px-3.5 py-2 text-sm'
                      }
                    >
                      {msg.content}
                    </div>
                  )}
                </div>
              </li>
            ))}
            {busy && (
              <li className="flex justify-start">
                <m.div
                  className="rounded-2xl rounded-bl-md bg-surface2 px-3.5 py-2 text-sm text-text-secondary"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                >
                  …
                </m.div>
              </li>
            )}
            {pending && !busy && (
              <li className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-accent/40 bg-accent/10 px-3.5 py-2 text-xs text-accent-300">
                  <m.span
                    className="inline-block h-2 w-2 rounded-full bg-accent"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  Building — live in a few minutes
                </div>
              </li>
            )}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <p className="pb-1 text-center text-xs text-fail" role="alert">
          {error}
        </p>
      )}

      {/* Staged attachments */}
      {drafts.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2">
          {drafts.map((att, i) => (
            <div key={i} className="relative">
              {att.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={att.data}
                  alt={att.name || 'Attached image'}
                  className="h-16 w-16 rounded-xl border border-border object-cover"
                />
              ) : (
                <span className="flex h-16 max-w-[140px] items-center gap-1.5 truncate rounded-xl border border-border bg-surface px-2.5 text-xs text-text-secondary">
                  <FileIcon />
                  <span className="truncate">{att.name}</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => removeDraft(i)}
                aria-label={`Remove ${att.name || 'attachment'}`}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface3 text-text-secondary"
              >
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="safe-bottom border-t border-border pt-2">
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setAttachOpen(true)}
            aria-label="Add an attachment"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-secondary active:bg-surface2"
          >
            <PaperclipIcon />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message Habitator…"
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none placeholder:text-text-secondary/60 focus:border-accent/60"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || (input.trim() === '' && drafts.length === 0)}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-transform active:scale-95 disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setModelOpen(true)}
          className="mt-1.5 flex items-center gap-1.5 rounded-full px-1 py-0.5 text-[11px] text-text-secondary active:text-text-primary"
        >
          <SparkIcon />
          {hasImages ? 'Vision' : selected?.label ?? model} · {effortLabel}
          {hasImages && !selected?.vision && ' (auto)'}
        </button>
      </div>

      {/* Hidden pickers — the three ways a file gets in. `capture` opens the
          rear camera straight away on a phone; on desktop it's ignored. */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Attach sheet */}
      <Sheet open={attachOpen} onClose={() => setAttachOpen(false)} title="Attach">
        <ul className="flex flex-col">
          <li>
            <SheetAction
              icon={<CameraIcon />}
              label="Take a photo"
              hint="Opens the camera"
              onClick={() => cameraRef.current?.click()}
            />
          </li>
          <li>
            <SheetAction
              icon={<ImageIcon />}
              label="Photo library"
              hint="Pick one or more images"
              onClick={() => libraryRef.current?.click()}
            />
          </li>
          <li>
            <SheetAction
              icon={<FileIcon />}
              label="Files"
              hint="Images and text files (no PDFs)"
              onClick={() => fileRef.current?.click()}
            />
          </li>
        </ul>
      </Sheet>

      {/* Model + effort sheet */}
      <Sheet open={modelOpen} onClose={() => setModelOpen(false)} title="Model">
        <SegmentedControl
          aria-label="Model"
          size="sm"
          options={CHAT_MODELS.map((mo) => ({ value: mo.id, label: mo.label }))}
          value={model}
          onChange={(next) => savePrefs({ model: next })}
        />
        <p className="mt-2 px-1 text-xs text-text-secondary">
          {selected?.blurb ?? 'Configured default.'}
        </p>

        <h3 className="mb-2 mt-5 px-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Thinking
        </h3>
        <SegmentedControl
          aria-label="Reasoning effort"
          size="sm"
          options={EFFORTS.map((e) => ({ value: e.value, label: e.label }))}
          value={effort}
          onChange={(next) => savePrefs({ effort: next })}
        />
        <p className="mt-2 px-1 text-xs text-text-secondary">
          {EFFORTS.find((e) => e.value === effort)?.blurb}
        </p>
        <p className="mt-4 px-1 text-xs text-text-secondary/70">
          Attach an image and the turn runs on Vision whatever is picked here.
        </p>
      </Sheet>

      {/* History drawer */}
      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Chats">
        {chats.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-secondary">
            No chats yet.
          </p>
        ) : (
          <ul className="flex flex-col">
            {chats.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void openChat(c.id)}
                  className={`w-full truncate rounded-btn px-3 py-2.5 text-left text-sm active:bg-surface2 ${
                    c.id === chatId ? 'bg-surface2' : ''
                  }`}
                >
                  {c.title || 'Untitled'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}

function SheetAction({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-btn px-3 py-3 text-left active:bg-surface2"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-secondary">
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs text-text-secondary">{hint}</span>
      </span>
    </button>
  );
}

function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

/** Checklist glyph for the /tasks link in the header. */
function TasksIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m3 7 2 2 3.5-3.5M3 17l2 2 3.5-3.5M12 7h9M12 17h9" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12 14-7-4 7 4 7-14-7Z" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21.4 11.05 12.2 20.3a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.1-2h8.4l1.1 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 17 5-5 4 4 2.5-2.5L20 17" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  );
}
