// The chat lane's model + reasoning-effort catalog.
//
// The vendor stays CONFIG (AGENT_BASE_URL / AGENT_CHAT_MODEL sets the default);
// this adds a per-turn override the chatbox can offer. Everything a request
// names is validated against this catalog server-side, so a crafted body can't
// point the API key at an arbitrary model string.
//
// Deliberately dependency-free — the client bundle imports it too, so no
// `process.env` reads and no server-only imports live here.

export type Effort = 'off' | 'low' | 'high' | 'max';

export interface ChatModel {
  id: string;
  /** Short name for the picker. */
  label: string;
  blurb: string;
  /** Accepts image parts in user messages. */
  vision: boolean;
}

/**
 * DeepSeek's current line-up (`GET /models`, Aug 2026). The old
 * `deepseek-chat` / `deepseek-reasoner` ids still resolve as aliases but no
 * longer appear in the listing — v4 replaced them, and thinking is now a
 * request parameter rather than a separate model.
 */
export const CHAT_MODELS: ChatModel[] = [
  {
    id: 'deepseek-v4-flash',
    label: 'Flash',
    blurb: 'Fast and cheap. The default.',
    vision: false,
  },
  {
    id: 'deepseek-v4-pro',
    label: 'Pro',
    blurb: 'Slower, ~3× the cost, better at hard asks.',
    vision: false,
  },
  {
    id: 'deepseek-v4-flash-vision-exp',
    label: 'Vision',
    blurb: 'Flash with eyes — reads attached images.',
    vision: true,
  },
];

export const EFFORTS: { value: Effort; label: string; blurb: string }[] = [
  { value: 'off', label: 'Off', blurb: 'No thinking. Fastest, cheapest.' },
  { value: 'low', label: 'Low', blurb: 'A short think before answering.' },
  { value: 'high', label: 'High', blurb: "DeepSeek's own default." },
  { value: 'max', label: 'Max', blurb: 'Longest chain of thought.' },
];

export const DEFAULT_MODEL = 'deepseek-v4-flash';
/** The model images are routed to, whatever else is selected. */
export const VISION_MODEL = 'deepseek-v4-flash-vision-exp';
/** Matches today's behaviour (the old alias ran non-thinking) but with a nudge. */
export const DEFAULT_EFFORT: Effort = 'low';

export function findModel(id: string): ChatModel | undefined {
  return CHAT_MODELS.find((m) => m.id === id);
}

/**
 * Pick the model for one turn: the requested one when we know it, else the
 * configured default. Images force the vision model — a turn that carries a
 * photo is useless on a text-only model, so the switch is silent rather than
 * an error the user has to resolve by hand.
 */
export function resolveModel(
  requested: unknown,
  fallback: string,
  hasImages: boolean
): string {
  if (hasImages) return VISION_MODEL;
  const id = typeof requested === 'string' ? requested : '';
  return findModel(id) ? id : fallback;
}

export function resolveEffort(requested: unknown): Effort {
  return EFFORTS.some((e) => e.value === requested)
    ? (requested as Effort)
    : DEFAULT_EFFORT;
}
