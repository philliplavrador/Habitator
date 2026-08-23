// Fires the build lane: a GitHub `repository_dispatch` that wakes
// .github/workflows/agent.yml. The workflow does the actual coding (aider +
// DeepSeek), verifies with `npm run build`, and pushes to main — Railway then
// auto-deploys. Needs GH_DISPATCH_TOKEN (a GitHub token with repo scope) in
// env. SERVER-ONLY.

const DEFAULT_REPO = 'philliplavrador/Habitator';

export function dispatchConfigured(): boolean {
  return Boolean(process.env.GH_DISPATCH_TOKEN);
}

/**
 * Queue a build on GitHub Actions. `memory` and `context` ride along in the
 * client_payload (trimmed — the payload has a size cap) so the runner's coder
 * sees the user's durable preferences and the conversation that led here.
 * Throws on failure — the chat surfaces the error instead of silently losing
 * the request.
 */
export async function dispatchBuild(
  buildId: number,
  instructions: string,
  memory: string,
  context: string
): Promise<void> {
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) throw new Error('GH_DISPATCH_TOKEN is not set.');
  const repo = process.env.AGENT_REPO || DEFAULT_REPO;

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      event_type: 'agent-build',
      client_payload: {
        build_id: buildId,
        instructions: instructions.slice(0, 20_000),
        memory: memory.slice(0, 8_000),
        context: context.slice(0, 12_000),
      },
    }),
  });

  // Success is 204 No Content.
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub dispatch failed (${res.status}): ${body.slice(0, 200)}`);
  }
}
