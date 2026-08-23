// The chat-lane orchestrator. One call = one user turn: persist the message,
// run the model's tool loop (guarded SQL, memory writes, build dispatches),
// persist and return the reply. The chatbox is the app's one constant; this
// module and its guards are on the build agent's protected-paths list, so the
// agent can never rewrite its own leash. SERVER-ONLY.

import { SCHEMA } from '../db';
import { many, run as dbRun } from '../db';
import {
  chatComplete,
  configuredModel,
  type ApiMessage,
  type ContentPart,
  type ToolDef,
} from './deepseek';
import { findModel, resolveEffort, resolveModel, type Effort } from './models';
import { checkSql } from './sqlGuard';
import { addMemory, memoryBlock } from './memory';
import {
  addAttachments,
  addMessage,
  attachmentMetaByMessage,
  attachmentsForMessages,
  createBuildRequest,
  createChat,
  getChat,
  listMessages,
  type ChatAttachmentMeta,
  type ChatAttachmentRow,
  type ChatMessageRow,
  type NewAttachment,
} from './store';
import { dispatchBuild } from './dispatch';

const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'run_sql',
      description:
        "Run ONE SQL statement against the app's Postgres to answer questions or log data. SELECT/INSERT/UPDATE only — no DELETE/DDL. Always scope to the user's user_id.",
      parameters: {
        type: 'object',
        properties: { sql: { type: 'string', description: 'A single SQL statement.' } },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description:
        'Save a short durable note about what the user likes/dislikes or how they want things done. Use when the user says "remember ..." (explicit=true) or when you notice a lasting preference yourself (explicit=false).',
      parameters: {
        type: 'object',
        properties: {
          note: { type: 'string', description: 'One concise sentence.' },
          explicit: { type: 'boolean', description: 'True if the user asked to remember it.' },
        },
        required: ['note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'build_app',
      description:
        'Change the app itself: add/modify/remove screens, features, API routes, or database tables. A coding agent applies the change and deploys it (takes a few minutes). Write instructions as a clear brief for a developer: what to build, where it lives, how it should look/behave.',
      parameters: {
        type: 'object',
        properties: {
          instructions: {
            type: 'string',
            description: 'A complete, self-contained brief for the coding agent.',
          },
        },
        required: ['instructions'],
      },
    },
  },
];

function systemPrompt(userId: number, tz: string, today: string, memory: string): string {
  return `You are Habitator — the user's personal, self-modifying app. The chatbox is the app's home screen; you ARE the app talking.

STYLE — critical: be extremely brief. One or two short sentences. No filler, no repeating the question, no offering options unasked. Sound like a terse, competent assistant.

You have three tools:
- run_sql: read or add/update data to answer questions and log things. NEVER delete anything. Every domain table has user_id — always filter/insert with user_id = ${userId}.
- remember: save durable preferences (yours to use proactively when you notice one, or when told "remember ...").
- build_app: for ANY request that needs the app itself to change (new feature, new screen, new table, change or remove existing UI). Send a complete developer brief. After calling it, tell the user in one sentence that it's building and will be live in a few minutes.

Rules:
- The user is the app's only user (user_id = ${userId}). Their timezone: ${tz}. Today there: ${today}.
- Data is sacred: never DELETE/DROP anything, in SQL or in build instructions. Removing a feature = hide/archive it; its data stays.
- Existing screens still live at their old routes (/tasks, /today, /insights, /fasts, /pushups, /pullups, /japanese, plus /habits/*, /rep-programs/*, /plank-programs/*). They're just unlinked from the home screen. If asked where something went, point at the route or offer to resurface it via build_app.
- The user can attach photos (camera or library) and text files. Read what's in them and act: log what you can see with run_sql, answer what they ask about it. If a message is only an attachment, say what you see in one line and ask what to do with it — unless it's obviously loggable data, in which case just log it and say so.
- Daily tasks (the \`tasks\` table, shown at /tasks) are one-off to-dos, NOT habits. Add one with run_sql:
  INSERT INTO tasks (user_id, title, notes, date, at_time, done, sort_order, created_at) VALUES (${userId}, 'Call the dentist', '', '${today}', '14:30', 0, 0, now()::text)
  \`date\` is the owner-local day it's planned for — resolve "tomorrow"/"Friday"/"in 3 days" yourself from today (${today}) and write a literal 'YYYY-MM-DD'. \`at_time\` is 'HH:MM' 24-hour local, or NULL when they didn't give a time. Check one off with UPDATE tasks SET done = 1, done_at = now()::text WHERE id = ... AND user_id = ${userId}.
  Unfinished tasks roll to the next day on their own — never re-date them for that. When the user asks what's on today, read tasks for date = '${today}' and list them briefly.
- For questions about their data, prefer run_sql over guessing. Dates in domain tables are TEXT 'YYYY-MM-DD' local days; timestamps are ISO TEXT.

Current database schema:
${SCHEMA}

${memory ? `Durable memory about the user:\n${memory}` : 'No durable memory saved yet.'}`;
}

// How much of the past rides along. Images are the expensive part (they bill as
// input tokens by area), so only the newest few are re-sent; older ones degrade
// to a text placeholder the model can still reason about.
const HISTORY_MESSAGES = 30;
const MAX_IMAGES = 6;
const HISTORY_TEXT_CHARS = 1500;
const TURN_TEXT_CHARS = 20000;

/** Meta always; `data` only for the attachments we decided to send in full. */
type MaybeLoaded = ChatAttachmentMeta & { data?: string };

/**
 * Turn a message's attachments into content parts. An image becomes a data-URL
 * part when it was loaded and the model can see it, and a one-line placeholder
 * otherwise — so the model still knows a photo was there. Text files are
 * inlined under a filename header, truncated so one dump can't eat the window.
 */
function attachmentParts(rows: MaybeLoaded[], textChars: number): ContentPart[] {
  return rows.map((row) => {
    if (row.kind === 'image') {
      return row.data
        ? { type: 'image_url' as const, image_url: { url: row.data } }
        : { type: 'text' as const, text: `[image attached: ${row.name || 'photo'}]` };
    }
    if (!row.data) {
      return { type: 'text' as const, text: `[file attached: ${row.name || 'file.txt'}]` };
    }
    const body = row.data.slice(0, textChars);
    const cut = row.data.length > body.length ? '\n…[truncated]' : '';
    return {
      type: 'text' as const,
      text: `--- attached file: ${row.name || 'file.txt'} ---\n${body}${cut}`,
    };
  });
}

function countImages(rows: { kind: string }[] | undefined): number {
  return rows ? rows.filter((r) => r.kind === 'image').length : 0;
}

/**
 * Serialize recent history for the model (cap so old chats stay cheap), folding
 * each message's attachments back in. `loaded` holds the payloads chosen by
 * planHistoryAttachments; everything else degrades to a placeholder.
 */
function toApiHistory(
  rows: ChatMessageRow[],
  meta: Map<number, ChatAttachmentMeta[]>,
  loaded: Map<number, ChatAttachmentRow[]>,
  withImages: Set<number>
): ApiMessage[] {
  return rows.map((row) => {
    const source: MaybeLoaded[] = loaded.get(row.id) ?? meta.get(row.id) ?? [];
    if (source.length === 0) return { role: row.role, content: row.content };
    // A loaded message can still be over the image budget — keep its files,
    // drop the pixels.
    const atts = withImages.has(row.id)
      ? source
      : source.map((a) => (a.kind === 'image' ? { ...a, data: undefined } : a));
    const parts: ContentPart[] = [];
    if (row.content) parts.push({ type: 'text', text: row.content });
    parts.push(...attachmentParts(atts, HISTORY_TEXT_CHARS));
    return { role: row.role, content: parts };
  });
}

/**
 * Which past messages' attachments are worth re-sending: images newest-first
 * until the budget runs out (they bill by area, so older photos degrade to
 * placeholders), plus any message carrying a text file, which is cheap.
 */
function planHistoryAttachments(
  rows: ChatMessageRow[],
  meta: Map<number, ChatAttachmentMeta[]>,
  imageBudget: number
): { ids: number[]; withImages: Set<number> } {
  const ids: number[] = [];
  const withImages = new Set<number>();
  let budget = imageBudget;
  for (let i = rows.length - 1; i >= 0; i--) {
    const atts = meta.get(rows[i].id);
    if (!atts || atts.length === 0) continue;
    const images = countImages(atts);
    const hasFiles = atts.length > images;
    if (images > 0 && images <= budget) {
      withImages.add(rows[i].id);
      budget -= images;
      ids.push(rows[i].id);
    } else if (hasFiles) {
      ids.push(rows[i].id);
    }
  }
  return { ids, withImages };
}

export interface TurnOptions {
  attachments?: NewAttachment[];
  /** Model id the user picked; ignored unless it's in the catalog. */
  model?: unknown;
  /** Reasoning effort the user picked ('off' | 'low' | 'high' | 'max'). */
  effort?: unknown;
}

export interface TurnResult {
  chatId: number;
  userMessage: ChatMessageRow;
  reply: ChatMessageRow;
  buildQueued: boolean;
  /** What actually ran — images silently reroute to the vision model. */
  model: string;
  effort: Effort;
  attachments: ChatAttachmentRow[];
}

/**
 * Run one full chat turn. Tool loop is capped; every tool result goes back to
 * the model so it can compose the final (short) reply.
 */
export async function runTurn(
  userId: number,
  tz: string,
  today: string,
  chatId: number | null,
  text: string,
  opts: TurnOptions = {}
): Promise<TurnResult> {
  // Resolve or create the chat (scoped to the user — getChat returns nothing
  // for someone else's id, and we then refuse rather than write cross-user).
  let chat = chatId !== null ? await getChat(userId, chatId) : undefined;
  if (chatId !== null && !chat) throw new Error('Chat not found.');
  if (!chat) chat = await createChat(userId, text || opts.attachments?.[0]?.name || 'Attachment');

  const history = (await listMessages(userId, chat.id)).slice(-HISTORY_MESSAGES);
  const userMessage = await addMessage(userId, chat.id, 'user', text);
  const incoming = opts.attachments ?? [];
  const stored = incoming.length
    ? await addAttachments(userId, chat.id, userMessage.id, incoming)
    : [];

  // Metadata first — a chat's photos are megabytes of base64, and most turns
  // need none of them.
  const meta = await attachmentMetaByMessage(userId, chat.id);

  // Any image in play — this turn's or a recent one's — forces the vision
  // model; a photo on a text-only model is just a dropped question.
  const turnImages = countImages(stored);
  const historyImages = history.some((row) => countImages(meta.get(row.id)) > 0);
  const model = resolveModel(opts.model, configuredModel(), turnImages > 0 || historyImages);
  const effort = resolveEffort(opts.effort);
  const canSeeImages = findModel(model)?.vision ?? false;

  const plan = planHistoryAttachments(
    history,
    meta,
    canSeeImages ? Math.max(0, MAX_IMAGES - turnImages) : 0
  );
  const loaded = await attachmentsForMessages(userId, chat.id, plan.ids);

  const turnParts: ContentPart[] = stored.length
    ? [
        ...(text ? [{ type: 'text' as const, text }] : []),
        ...attachmentParts(
          canSeeImages
            ? stored
            : stored.map((a) => (a.kind === 'image' ? { ...a, data: undefined } : a)),
          TURN_TEXT_CHARS
        ),
      ]
    : [];

  const memory = await memoryBlock(userId);
  const messages: ApiMessage[] = [
    { role: 'system', content: systemPrompt(userId, tz, today, memory) },
    ...toApiHistory(history, meta, loaded, plan.withImages),
    { role: 'user', content: turnParts.length > 0 ? turnParts : text },
  ];

  let buildId: number | undefined;
  let finalText = '';

  // Tool loop — bounded so a confused model can't spin forever.
  for (let i = 0; i < 6; i++) {
    const result = await chatComplete(messages, TOOLS, { model, effort });

    if (result.toolCalls.length === 0) {
      finalText = result.content.trim();
      break;
    }

    messages.push({
      role: 'assistant',
      content: result.content || null,
      tool_calls: result.toolCalls,
    });

    for (const call of result.toolCalls) {
      let output: string;
      try {
        output = await execTool(userId, chat.id, call.function.name, call.function.arguments);
        if (call.function.name === 'build_app') {
          // execTool returns the build id in-band; remember it for the reply row.
          const parsed = JSON.parse(output) as { build_id?: number };
          if (parsed.build_id) buildId = parsed.build_id;
        }
      } catch (err) {
        output = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
      }
      messages.push({ role: 'tool', content: output, tool_call_id: call.id });
    }
  }

  if (!finalText) {
    finalText = buildId
      ? 'On it — building now, live in a few minutes.'
      : 'Sorry, I got stuck on that one. Try rephrasing?';
  }

  const reply = await addMessage(userId, chat.id, 'assistant', finalText, buildId);
  return {
    chatId: chat.id,
    userMessage,
    reply,
    buildQueued: buildId !== undefined,
    model,
    effort,
    attachments: stored,
  };
}

async function execTool(
  userId: number,
  chatId: number,
  name: string,
  rawArgs: string
): Promise<string> {
  const args = JSON.parse(rawArgs || '{}') as Record<string, unknown>;

  if (name === 'run_sql') {
    const checked = checkSql(String(args.sql ?? ''));
    if (!checked.ok) return JSON.stringify({ error: checked.error });
    if (/^select|^with/i.test(checked.sql)) {
      const rows = await many(checked.sql);
      return JSON.stringify({ rows: rows.slice(0, 200), count: rows.length });
    }
    await dbRun(checked.sql);
    return JSON.stringify({ ok: true });
  }

  if (name === 'remember') {
    const note = String(args.note ?? '').trim();
    if (!note) return JSON.stringify({ error: 'Empty note.' });
    await addMemory(userId, note, args.explicit === true ? 'explicit' : 'auto');
    return JSON.stringify({ ok: true });
  }

  if (name === 'build_app') {
    const instructions = String(args.instructions ?? '').trim();
    if (!instructions) return JSON.stringify({ error: 'Empty instructions.' });
    const build = await createBuildRequest(userId, chatId, instructions);
    const memory = await memoryBlock(userId);
    // Recent conversation rides along so the coder sees the intent, not just
    // the distilled brief.
    const recent = (await listMessages(userId, chatId))
      .slice(-12)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');
    await dispatchBuild(build.id, instructions, memory, recent);
    return JSON.stringify({ build_id: build.id, status: 'queued' });
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}
