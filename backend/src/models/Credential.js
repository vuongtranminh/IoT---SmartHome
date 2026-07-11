const mongoose = require('mongoose');

// Credential — public key WebAuthn của user (mỗi user có thể có nhiều passkey)
const credentialSchema = new mongoose.Schema(
  {
    userId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    credentialID:      { type: Buffer, required: true },   // WebAuthn credential ID (bytes)
    credentialPublicKey: { type: Buffer, required: true }, // COSE public key (bytes)
    counter:           { type: Number, default: 0 },
    transports:        [String],                            // ['internal', 'usb', 'ble', ...]
    createdAt:         { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model('Credential', credentialSchema);
