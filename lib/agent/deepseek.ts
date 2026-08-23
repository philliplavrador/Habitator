// Thin client for an OpenAI-compatible chat-completions API (DeepSeek by
// default). Deliberately fetch-based — no SDK dependency — and the vendor is
// CONFIG, not code: point AGENT_BASE_URL / AGENT_CHAT_MODEL at any compatible
// provider to swap models without an edit. SERVER-ONLY.

export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface CompletionResult {
  content: string;
  toolCalls: ToolCall[];
}

export function agentConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

function baseUrl(): string {
  return (process.env.AGENT_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
}

function model(): string {
  return process.env.AGENT_CHAT_MODEL || 'deepseek-chat';
}

/**
 * One chat-completions round trip. Non-streaming (the chat is low-verbosity by
 * design, so replies are short). Throws on transport/API errors — the route
 * turns that into a visible chat error rather than a silent drop.
 */
export async function chatComplete(
  messages: ApiMessage[],
  tools?: ToolDef[]
): Promise<CompletionResult> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY is not set.');

  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model(),
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Agent API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
  };
  const msg = data.choices?.[0]?.message;
  return { content: msg?.content ?? '', toolCalls: msg?.tool_calls ?? [] };
}
