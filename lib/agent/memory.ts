// The agent's durable memory — short preference notes the chat model records
// (its own initiative, source 'auto', or an explicit "remember X", source
// 'explicit'). Every chat turn and every build dispatch injects the full list,
// which is how the agent "learns as it goes". SERVER-ONLY.

import { many, one } from '../db';
import { nowISO } from '../dates';

export interface MemoryRow {
  id: number;
  user_id: number;
  content: string;
  source: 'auto' | 'explicit';
  created_at: string;
}

export async function listMemory(userId: number): Promise<MemoryRow[]> {
  return many<MemoryRow>(
    `SELECT * FROM agent_memory WHERE user_id = $1 ORDER BY id ASC`,
    [userId]
  );
}

export async function addMemory(
  userId: number,
  content: string,
  source: 'auto' | 'explicit'
): Promise<MemoryRow> {
  const row = await one<MemoryRow>(
    `INSERT INTO agent_memory (user_id, content, source, created_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, content.trim(), source, nowISO()]
  );
  return row as MemoryRow;
}

/** The memory block injected into prompts — empty string when nothing saved. */
export async function memoryBlock(userId: number): Promise<string> {
  const rows = await listMemory(userId);
  if (rows.length === 0) return '';
  return rows.map((r) => `- ${r.content}`).join('\n');
}
