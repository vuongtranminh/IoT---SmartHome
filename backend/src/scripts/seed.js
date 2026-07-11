// Seed 1 admin user để demo
require('dotenv').config();
const { connectMongo } = require('../config/mongo');
const User = require('../models/User');
const { hashPassword } = require('../services/auth.service');

async function main() {
  await connectMongo();

  const seedUsers = [
    { username: 'admin', password: 'admin@1234', role: 'admin' },
    { username: 'user',  password: 'user@1234',  role: 'user'  },
  ];

  for (const u of seedUsers) {
    const existing = await User.findOne({ username: u.username });
    if (existing) {
      console.log(`  ⏭  ${u.username} đã tồn tại, bỏ qua`);
      continue;
    }
    await User.create({
      username: u.username,
      passwordHash: await hashPassword(u.password),
      role: u.role,
    });
    console.log(`  ✅ ${u.username} / ${u.password} (role=${u.role})`);
  }

  console.log('Seed done.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
