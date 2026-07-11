const mongoose = require('mongoose');
const env = require('./env');

async function connectMongo() {
  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log(`[Mongo] Connected: ${env.MONGO_URI}`);
}

module.exports = { connectMongo };
