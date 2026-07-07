// Stateless signed-session tokens — shared by the Edge middleware and the Node
// route handlers, so it uses ONLY Web Crypto + Web text APIs (available in both
// the Edge and Node runtimes). It must never import node:crypto or pg, or it
// would break the middleware bundle.
//
// A token is `<payloadB64url>.<hmacB64url>`, where the payload is
// {uid, exp} JSON and the HMAC is SHA-256 over the payload segment, keyed by
// SESSION_SECRET. Verification checks the signature and the expiry — no session
// table, so the cookie alone identifies the user.

export interface SessionPayload {
  uid: number; // user id
  exp: number; // unix seconds; token invalid after this
}

// Explicit ArrayBuffer-backed arrays so the results type as BufferSource
// (crypto.subtle rejects the generic `Uint8Array<ArrayBufferLike>`).
function strToBytes(s: string): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder().encode(s);
  const out = new Uint8Array(new ArrayBuffer(enc.byteLength));
  out.set(enc);
  return out;
}
function bytesToStr(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}
function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  // Re-pad the (unpadded) base64url before atob. `'==='.slice((s.length+3)%4)`
  // yields the exact number of '=' needed: len%4 → pad  (0→0, 2→2, 3→1); the
  // len%4===1 case is invalid base64 and produces 3 pads, which atob rejects.
  // Runs on BOTH the Edge middleware and Node handlers, so it must stay pure
  // Web APIs (atob/btoa) — don't "fix" this with Buffer.
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    strToBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Sign a session token for `uid`, valid for `maxAgeSec` seconds. */
export async function signSession(
  uid: number,
  secret: string,
  maxAgeSec: number
): Promise<string> {
  const payload: SessionPayload = {
    uid,
    exp: Math.floor(Date.now() / 1000) + maxAgeSec,
  };
  const payloadB64 = bytesToB64url(strToBytes(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, strToBytes(payloadB64))
  );
  return `${payloadB64}.${bytesToB64url(sig)}`;
}

/**
 * Verify a token: valid signature AND not expired. Returns the payload, or null
 * for anything malformed/tampered/expired.
 */
export async function verifySession(
  token: string | undefined | null,
  secret: string
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let sig: Uint8Array<ArrayBuffer>;
  let payload: SessionPayload;
  try {
    sig = b64urlToBytes(sigB64);
  } catch {
    return null;
  }

  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify('HMAC', key, sig, strToBytes(payloadB64));
  if (!ok) return null;

  try {
    payload = JSON.parse(bytesToStr(b64urlToBytes(payloadB64))) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload?.uid !== 'number' || typeof payload?.exp !== 'number') {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
