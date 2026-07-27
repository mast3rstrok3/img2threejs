/**
 * Cloudflare Access JWT verification for the capture-view write endpoint.
 *
 * Access already fronts the hostname, so in the normal case every request that reaches the Worker
 * has been through the login. This exists for the case that isn't normal: any additional route to
 * the same Worker (a workers.dev URL, a preview alias, a second custom domain) reaches the code
 * without passing the policy. Since this endpoint writes state, it authenticates the request
 * itself rather than trusting its own network position.
 *
 * Verifies the `Cf-Access-Jwt-Assertion` header against the team's public keys:
 * signature (RS256), `aud` matches this application, and the token is inside its validity window.
 */

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

export interface AccessConfig {
  teamDomain: string;
  aud: string;
}

/** Cached JWKS per team domain — fetching Cloudflare's keys on every write would be absurd. */
const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();
const JWKS_TTL_MS = 60 * 60 * 1000;

const b64urlToBytes = (input: string): Uint8Array => {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

async function getKeys(teamDomain: string): Promise<Jwk[]> {
  const cached = jwksCache.get(teamDomain);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;

  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`could not fetch Access certs (${res.status})`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  if (!Array.isArray(keys) || keys.length === 0) throw new Error('Access certs response had no keys');
  jwksCache.set(teamDomain, { keys, fetchedAt: Date.now() });
  return keys;
}

export interface AccessResult {
  ok: boolean;
  reason?: string;
  email?: string;
}

/**
 * Returns `{ ok: true }` only for a request carrying a valid Access token for `config.aud`.
 * Every failure path is a denial — there is no "could not check, so allow".
 */
export async function verifyAccessJwt(request: Request, config: AccessConfig): Promise<AccessResult> {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { ok: false, reason: 'no Cf-Access-Jwt-Assertion header' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' };
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { kid?: string; alg?: string };
  let payload: { aud?: string | string[]; exp?: number; nbf?: number; iss?: string; email?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64)));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
  } catch {
    return { ok: false, reason: 'token header/payload is not JSON' };
  }

  if (header.alg !== 'RS256') return { ok: false, reason: `unexpected alg ${header.alg}` };
  if (!header.kid) return { ok: false, reason: 'token has no kid' };

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(config.aud)) return { ok: false, reason: 'aud does not match this application' };

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && now >= payload.exp) return { ok: false, reason: 'token expired' };
  if (typeof payload.nbf === 'number' && now < payload.nbf) return { ok: false, reason: 'token not yet valid' };
  if (payload.iss && payload.iss !== `https://${config.teamDomain}`) {
    return { ok: false, reason: 'issuer does not match the configured team domain' };
  }

  let keys: Jwk[];
  try {
    keys = await getKeys(config.teamDomain);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }

  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: 'no Access key matches this token' };

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(signatureB64) as BufferSource,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`) as BufferSource,
  );
  if (!verified) return { ok: false, reason: 'signature verification failed' };

  return { ok: true, email: payload.email };
}
