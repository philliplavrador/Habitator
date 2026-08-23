// Thin client for an OpenAI-compatible chat-completions API (DeepSeek by
// default). Deliberately fetch-based — no SDK dependency — and the vendor is
// CONFIG, not code: point AGENT_BASE_URL / AGENT_CHAT_MODEL at any compatible
// provider to swap models without an edit. SERVER-ONLY.

import { DEFAULT_MODEL, findModel, type Effort } from './models';

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

/**
 * A multimodal user message is an array of these instead of a plain string.
 * Images ride as base64 data URLs — DeepSeek's `file` part accepts only image
 * formats too, so anything non-image is inlined as text by the caller.
 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface CompletionResult {
  content: string;
  toolCalls: ToolCall[];
}

export interface CompleteOptions {
  /** Overrides AGENT_CHAT_MODEL for this call (already validated upstream). */
  model?: string;
  /** 'off' disables thinking; the rest map to DeepSeek's reasoning_effort. */
  effort?: Effort;
}

export function agentConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

function baseUrl(): string {
  return (process.env.AGENT_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
}

/** The configured default, used whenever a call doesn't name a model. */
export function configuredModel(): string {
  return process.env.AGENT_CHAT_MODEL || DEFAULT_MODEL;
}

/**
 * One chat-completions round trip. Non-streaming (the chat is low-verbosity by
 * design, so replies are short). Throws on transport/API errors — the route
 * turns that into a visible chat error rather than a silent drop.
 */
export async function chatComplete(
  messages: ApiMessage[],
  tools?: ToolDef[],
  opts: CompleteOptions = {}
): Promise<CompletionResult> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY is not set.');

  const model = opts.model || configuredModel();
  // `thinking` / `reasoning_effort` are DeepSeek-shaped. Only send them for a
  // model we ship in the catalog, so pointing AGENT_BASE_URL at another
  // OpenAI-compatible provider keeps working with a plain request body.
  const thinking =
    opts.effort && findModel(model)
      ? opts.effort === 'off'
        ? { thinking: { type: 'disabled' } }
        : { thinking: { type: 'enabled' }, reasoning_effort: opts.effort }
      : {};

  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      ...thinking,
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
