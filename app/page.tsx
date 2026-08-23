import ChatScreen from '@/components/chat/ChatScreen';
import { requirePageContext } from '@/lib/pageContext';
import { getUsername } from '@/lib/auth';
import { listChats } from '@/lib/agent/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Home = the chatbox, Habitator's one constant. The old Today screen lives on
 * at /today (unlinked, like every legacy screen — reachable by URL or
 * resurfaceable by asking the chat). See docs/superpowers/specs/
 * 2026-08-23-chat-first-self-modifying-app-design.md.
 */
export default async function ChatPage() {
  const { userId } = await requirePageContext();
  const [username, chats] = await Promise.all([
    getUsername(userId),
    listChats(userId),
  ]);
  return (
    <ChatScreen
      username={username ?? ''}
      initialChats={chats.map(({ id, title, created_at }) => ({ id, title, created_at }))}
    />
  );
}
