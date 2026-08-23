'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { m } from 'framer-motion';
import AccountMenu from '@/components/AccountMenu';
import Sheet from '@/components/ui/Sheet';

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

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  build_id: number | null;
}

interface Props {
  username: string;
  initialChats: ChatListItem[];
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

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollDown = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    scrollDown();
  }, [messages, scrollDown]);

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
    inputRef.current?.focus();
  }

  async function send() {
    const text = input.trim();
    if (text === '' || busy) return;
    setBusy(true);
    setError(null);
    setInput('');
    // Optimistic echo — replaced wholesale by the server's rows on success.
    setMessages((prev) => [
      ...prev,
      { id: -1, role: 'user', content: text, build_id: null },
    ]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status}).`);
      const result = data as {
        chatId: number;
        userMessage: Message;
        reply: Message;
        buildQueued: boolean;
      };
      if (chatId === null) {
        setChatId(result.chatId);
        // Surface the new chat in the drawer list without a refetch.
        setChats((prev) => [
          { id: result.chatId, title: text.slice(0, 60), created_at: '' },
          ...prev,
        ]);
      }
      setMessages((prev) => [
        ...prev.filter((msg) => msg.id !== -1),
        result.userMessage,
        result.reply,
      ]);
      if (result.buildQueued) setPending(true);
    } catch (e) {
      setMessages((prev) => prev.filter((msg) => msg.id !== -1));
      setInput(text);
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
                      ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-white'
                      : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-surface2 px-3.5 py-2 text-sm'
                  }
                >
                  {msg.content}
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

      {/* Composer */}
      <div className="safe-bottom flex items-end gap-2 border-t border-border pt-2">
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
          disabled={busy || input.trim() === ''}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-transform active:scale-95 disabled:opacity-40"
        >
          <SendIcon />
        </button>
      </div>

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

function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 3" />
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
