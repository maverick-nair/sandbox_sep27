'use strict';
// Sessions, password hashing, and OpenID Connect single sign-on (authorisation code flow with PKCE).
const crypto = require('node:crypto');

const SESSION_DAYS = Number(process.env.SESSION_DAYS || 14);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const b64u = buf => Buffer.from(buf).toString('base64url');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
function checkPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, key] = stored.split('$');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 32, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(got, Buffer.from(key, 'hex'));
}

function createSession(db, userId) {
  const token = b64u(crypto.randomBytes(32));
  db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha(token), userId, Date.now() + SESSION_DAYS * 86400000);
  return token;
}
function sessionUser(db, token) {
  if (!token) return null;
  const s = db.get('SELECT * FROM sessions WHERE token_hash = ?', sha(token));
  if (!s || s.expires_at < Date.now()) return null;
  return db.get('SELECT * FROM users WHERE id = ?', s.user_id) || null;
}
function destroySession(db, token) { if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', sha(token)); }
function cookie(token, secure, maxAgeDays = SESSION_DAYS) {
  return `lp_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(maxAgeDays * 86400)}${secure ? '; Secure' : ''}`;
}

// ---------- OIDC ----------
const pending = new Map(); // state -> { verifier, nonce, cohort, exp }
let discovery = null, jwks = null, jwksAt = 0;
function oidcEnabled() { return Boolean(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_REDIRECT_URI); }
async function discover() {
  if (discovery) return discovery;
  const r = await fetch(process.env.OIDC_ISSUER.replace(/\/$/, '') + '/.well-known/openid-configuration');
  if (!r.ok) throw new Error('OIDC discovery failed');
  discovery = await r.json(); return discovery;
}
async function oidcStart(cohortCode) {
  const d = await discover();
  const state = b64u(crypto.randomBytes(16)), nonce = b64u(crypto.randomBytes(16)), verifier = b64u(crypto.randomBytes(32));
  pending.set(state, { verifier, nonce, cohort: cohortCode || '', exp: Date.now() + 600000 });
  for (const [k, v] of pending) if (v.exp < Date.now()) pending.delete(k);
  const u = new URL(d.authorization_endpoint);
  u.search = new URLSearchParams({ response_type: 'code', client_id: process.env.OIDC_CLIENT_ID, redirect_uri: process.env.OIDC_REDIRECT_URI, scope: 'openid email profile', state, nonce, code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' }).toString();
  return u.toString();
}
async function getKey(kid) {
  if (!jwks || Date.now() - jwksAt > 3600000 || !jwks.keys.some(k => k.kid === kid)) {
    const d = await discover(); const r = await fetch(d.jwks_uri); jwks = await r.json(); jwksAt = Date.now();
  }
  const jwk = jwks.keys.find(k => k.kid === kid); if (!jwk) throw new Error('Unknown signing key');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}
async function verifyIdToken(idToken, nonce) {
  const [h, p, s] = idToken.split('.'); if (!s) throw new Error('Malformed ID token');
  const header = JSON.parse(Buffer.from(h, 'base64url')), claims = JSON.parse(Buffer.from(p, 'base64url'));
  if (header.alg !== 'RS256') throw new Error('Unsupported ID token algorithm');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(h + '.' + p), await getKey(header.kid), Buffer.from(s, 'base64url'));
  if (!ok) throw new Error('Bad ID token signature');
  const iss = process.env.OIDC_ISSUER.replace(/\/$/, '');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss.replace(/\/$/, '') !== iss || !aud.includes(process.env.OIDC_CLIENT_ID) || claims.exp * 1000 < Date.now() || claims.nonce !== nonce) throw new Error('ID token claims rejected');
  return claims;
}
async function oidcCallback(params) {
  const st = pending.get(params.state); pending.delete(params.state);
  if (!st || st.exp < Date.now()) throw new Error('Sign-in expired. Please try again.');
  const d = await discover();
  const body = new URLSearchParams({ grant_type: 'authorization_code', code: params.code, redirect_uri: process.env.OIDC_REDIRECT_URI, client_id: process.env.OIDC_CLIENT_ID, code_verifier: st.verifier });
  if (process.env.OIDC_CLIENT_SECRET) body.set('client_secret', process.env.OIDC_CLIENT_SECRET);
  const r = await fetch(d.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) throw new Error('Token exchange failed');
  const tok = await r.json();
  const claims = await verifyIdToken(tok.id_token, st.nonce);
  if (!claims.email) throw new Error('Your identity provider did not share an email address.');
  return { email: String(claims.email).toLowerCase(), name: String(claims.name || claims.given_name || claims.email.split('@')[0]).slice(0, 80), cohort: st.cohort };
}

module.exports = { hashPassword, checkPassword, createSession, sessionUser, destroySession, cookie, oidcEnabled, oidcStart, oidcCallback, sha };
