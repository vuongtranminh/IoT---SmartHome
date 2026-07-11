// Auth service — JWT (access + refresh) + WebAuthn/Passkey helpers
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

// ─── JWT ────────────────────────────────────────────────────
function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), username: user.username, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user._id.toString() },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_TTL }
  );
}

function verifyAccess(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

function verifyRefresh(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

// ─── Password (bcrypt + pepper) ────────────────────────────
async function hashPassword(plain) {
  return bcrypt.hash(plain + env.PASSWORD_PEPPER, 12);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain + env.PASSWORD_PEPPER, hash);
}

module.exports = {
  signAccessToken, signRefreshToken, verifyAccess, verifyRefresh,
  hashPassword, verifyPassword,
};
