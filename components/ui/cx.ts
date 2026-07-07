/** A className value that's either a string or a falsy value to drop. */
export type ClassValue = string | false | null | undefined;

/**
 * Tiny className joiner: drops falsy parts and space-joins the rest. Replaces
 * the hand-rolled `[...].filter(Boolean).join(' ')` scattered across the UI.
 */
export const cx = (...parts: ClassValue[]): string => parts.filter(Boolean).join(' ');
