// The chat-lane orchestrator. One call = one user turn: persist the message,
// run the model's tool loop (guarded SQL, memory writes, build dispatches),
// persist and return the reply. The chatbox is the app's one constant; this
// module and its guards are on the build agent's protected-paths list, so the
// agent can never rewrite its own leash. SERVER-ONLY.

import { SCHEMA } from '../db';
import { many, run as dbRun } from '../db';
import {
  chatComplete,
  type ApiMessage,
  type ToolDef,
} from './deepseek';
import { checkSql } from './sqlGuard';
import { addMemory, memoryBlock } from './memory';
import {
  addMessage,
  createBuildRequest,
  createChat,
  getChat,
  listMessages,
  type ChatMessageRow,
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
- Existing screens still live at their old routes (/today, /insights, /fasts, /pushups, /pullups, /japanese, plus /habits/*, /rep-programs/*, /plank-programs/*). They're just unlinked from the home screen. If asked where something went, point at the route or offer to resurface it via build_app.
- For questions about their data, prefer run_sql over guessing. Dates in domain tables are TEXT 'YYYY-MM-DD' local days; timestamps are ISO TEXT.

Current database schema:
${SCHEMA}

${memory ? `Durable memory about the user:\n${memory}` : 'No durable memory saved yet.'}`;
}

/** Serialize recent history for the model (cap so old chats stay cheap). */
function toApiHistory(rows: ChatMessageRow[]): ApiMessage[] {
  return rows.slice(-30).map((m) => ({ role: m.role, content: m.content }));
}

export interface TurnResult {
  chatId: number;
  userMessage: ChatMessageRow;
  reply: ChatMessageRow;
  buildQueued: boolean;
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
  text: string
): Promise<TurnResult> {
  // Resolve or create the chat (scoped to the user — getChat returns nothing
  // for someone else's id, and we then refuse rather than write cross-user).
  let chat = chatId !== null ? await getChat(userId, chatId) : undefined;
  if (chatId !== null && !chat) throw new Error('Chat not found.');
  if (!chat) chat = await createChat(userId, text);

  const history = await listMessages(userId, chat.id);
  const userMessage = await addMessage(userId, chat.id, 'user', text);

  const memory = await memoryBlock(userId);
  const messages: ApiMessage[] = [
    { role: 'system', content: systemPrompt(userId, tz, today, memory) },
    ...toApiHistory(history),
    { role: 'user', content: text },
  ];

  let buildId: number | undefined;
  let finalText = '';

  // Tool loop — bounded so a confused model can't spin forever.
  for (let i = 0; i < 6; i++) {
    const result = await chatComplete(messages, TOOLS);

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
  return { chatId: chat.id, userMessage, reply, buildQueued: buildId !== undefined };
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
