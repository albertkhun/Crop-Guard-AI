import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createAiClient } from './services/aiClient.js';
import { createClassCatalog } from './services/classCatalog.js';
import { createStorage } from './storage/index.js';

// server/.env first, then repo-root .env (first value wins; real env vars always win over both)
dotenv.config({ path: ['.env', '../.env'], quiet: true });

const config = loadConfig();
const storage = createStorage(config);
const ai = createAiClient(config.ai);
const catalog = createClassCatalog(ai);

await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
console.log(`[db] connected  [storage] ${storage.name}  [ai] ${config.ai.url}  [cors] ${config.clientOrigins.join(', ')}`);

const server = createApp({ config, storage, ai, catalog }).listen(config.port, () =>
  console.log(`[server] listening on :${config.port}`));
server.requestTimeout = 3 * 60_000; // up to two cold-start AI attempts + upload
server.headersTimeout = 30_000;

// Warm the AI service as soon as we boot (wakes a sleeping HF Space); failure is fine.
ai.health().then((h) => console.log(`[ai] health: ${h.status}`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[server] ${sig}, shutting down`);
    server.close(() => mongoose.disconnect().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
