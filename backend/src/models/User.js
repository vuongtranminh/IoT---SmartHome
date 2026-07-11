const mongoose = require('mongoose');

// User — tài khoản đăng nhập dashboard.
// Password dùng bcrypt+pepper; Passkey (WebAuthn) là phương thức chính, password chỉ để fallback.
const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true, lowercase: true, trim: true },
    passwordHash: { type: String },       // bcrypt hash (fallback login)
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    currentChallenge: String,              // dùng khi register/login Passkey
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model('User', userSchema);
