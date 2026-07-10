import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { unauthorized } from '@/lib/apiRoute';
import { isDomainKey, removeUserDomain } from '@/lib/domains';
import { deleteVideoFile } from '@/lib/media';
import { pullupProgram } from '@/lib/pullups';
import { pushupProgram } from '@/lib/pushups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/domains/[domain] → drop the custom habit and everything logged in
// it. Mirrors DELETE /api/rep-programs/[id]: the rows go in one transaction, the
// orphaned video files are unlinked afterwards.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { domain: string } }
) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();
  const domain = params.domain;
  if (!isDomainKey(domain)) {
    return NextResponse.json({ error: 'Habit not found.' }, { status: 404 });
  }

  // Collect the video filenames BEFORE the delete drops the session rows.
  let files: string[] = [];
  if (domain === 'pushups' || domain === 'pullups') {
    const program = domain === 'pushups' ? pushupProgram : pullupProgram;
    const sessions = await program.list(userId);
    files = sessions
      .flatMap((s) => [s.video, ...s.videos])
      .filter((v): v is string => typeof v === 'string');
  }

  const removed = await removeUserDomain(userId, domain);
  if (!removed) {
    return NextResponse.json({ error: 'Habit not found.' }, { status: 404 });
  }
  for (const f of files) deleteVideoFile(f);
  return NextResponse.json({ ok: true });
}
