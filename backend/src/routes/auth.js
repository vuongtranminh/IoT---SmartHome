// ═══════════════════════════════════════════════════════════════
// Auth routes — login username/password + Passkey (WebAuthn)
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const env = require('../config/env');
const User = require('../models/User');
const Credential = require('../models/Credential');
const {
  signAccessToken, signRefreshToken, verifyRefresh,
  hashPassword, verifyPassword,
} = require('../services/auth.service');
const { logAudit } = require('../services/audit.service');
const { requireAuth } = require('../middlewares/jwt');
const { loginLimiter } = require('../middlewares/ratelimit');

const router = express.Router();

// ─── Password login (fallback nếu chưa setup Passkey) ─────
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const user = await User.findOne({ username: (username || '').toLowerCase() });
  if (!user || !user.passwordHash) {
    await logAudit({ actor: `user:${username}`, action: 'user.login', ip: req.ip, ok: false, detail: { reason: 'not found' } });
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const ok = await verifyPassword(password || '', user.passwordHash);
  if (!ok) {
    await logAudit({ actor: `user:${username}`, action: 'user.login', ip: req.ip, ok: false, detail: { reason: 'wrong password' } });
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const access = signAccessToken(user);
  const refresh = signRefreshToken(user);
  res.cookie('refresh', refresh, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600_000 });
  await logAudit({ actor: `user:${user.username}`, action: 'user.login', ip: req.ip, ok: true, detail: { method: 'password' } });
  res.json({ access, user: { username: user.username, role: user.role } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('refresh');
  res.json({ ok: true });
});

router.post('/refresh', async (req, res) => {
  const token = req.cookies?.refresh;
  if (!token) return res.status(401).json({ error: 'no refresh cookie' });
  try {
    const payload = verifyRefresh(token);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'user not found' });
    const access = signAccessToken(user);
    res.json({ access, user: { username: user.username, role: user.role } });
  } catch {
    res.status(401).json({ error: 'invalid refresh' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.sub).select('username role');
  res.json(user);
});

// ─── Passkey / WebAuthn ────────────────────────────────────
// 1) Register options — trả về challenge cho browser
router.post('/passkey/register/options', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.sub);
  if (!user) return res.status(401).json({ error: 'user not found' });

  const existing = await Credential.find({ userId: user._id }).lean();
  const options = await generateRegistrationOptions({
    rpName: env.RP_NAME,
    rpID: env.RP_ID,
    userID: Buffer.from(user._id.toString()),
    userName: user.username,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    excludeCredentials: existing.map(c => ({ id: c.credentialID, type: 'public-key', transports: c.transports })),
  });

  user.currentChallenge = options.challenge;
  await user.save();
  res.json(options);
});

// 2) Register verify — nhận credential public key từ browser
router.post('/passkey/register/verify', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.sub);
  if (!user?.currentChallenge) return res.status(400).json({ error: 'no challenge' });

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: env.RP_ORIGIN,
      expectedRPID: env.RP_ID,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  if (!verification.verified) return res.status(400).json({ error: 'verification failed' });

  const { credential } = verification.registrationInfo;
  await Credential.create({
    userId: user._id,
    credentialID: Buffer.from(credential.id),
    credentialPublicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    transports: req.body.response?.transports || [],
  });

  user.currentChallenge = undefined;
  await user.save();

  await logAudit({ actor: `user:${user.username}`, action: 'passkey.register', ip: req.ip, ok: true });
  res.json({ ok: true });
});

// 3) Login options — không cần user info (usernameless)
router.post('/passkey/login/options', loginLimiter, async (req, res) => {
  const options = await generateAuthenticationOptions({
    rpID: env.RP_ID,
    userVerification: 'preferred',
  });
  // Lưu challenge trong Redis theo response.id later — dùng cookie ngắn hạn cho đơn giản
  res.cookie('pkChallenge', options.challenge, { httpOnly: true, sameSite: 'lax', maxAge: 5 * 60_000 });
  res.json(options);
});

// 4) Login verify
router.post('/passkey/login/verify', loginLimiter, async (req, res) => {
  const challenge = req.cookies?.pkChallenge;
  if (!challenge) return res.status(400).json({ error: 'no challenge' });

  const credRow = await Credential.findOne({ credentialID: Buffer.from(req.body.id, 'base64url') });
  if (!credRow) return res.status(401).json({ error: 'credential not registered' });

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: challenge,
      expectedOrigin: env.RP_ORIGIN,
      expectedRPID: env.RP_ID,
      credential: {
        id: credRow.credentialID,
        publicKey: credRow.credentialPublicKey,
        counter: credRow.counter,
      },
    });
  } catch (e) {
    return res.status(401).json({ error: e.message });
  }

  if (!verification.verified) return res.status(401).json({ error: 'verification failed' });

  credRow.counter = verification.authenticationInfo.newCounter;
  await credRow.save();

  const user = await User.findById(credRow.userId);
  const access = signAccessToken(user);
  const refresh = signRefreshToken(user);
  res.clearCookie('pkChallenge');
  res.cookie('refresh', refresh, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600_000 });
  await logAudit({ actor: `user:${user.username}`, action: 'user.login', ip: req.ip, ok: true, detail: { method: 'passkey' } });
  res.json({ access, user: { username: user.username, role: user.role } });
});

module.exports = router;
