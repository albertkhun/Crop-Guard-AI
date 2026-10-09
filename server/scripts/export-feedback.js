#!/usr/bin/env node
// Export user feedback as JSONL for retraining / error analysis.
//   node scripts/export-feedback.js [--out feedback.jsonl] [--labeled-only]
// Reads MONGODB_URI from the environment / .env (same as the server).
import fs from 'node:fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Scan } from '../src/models/Scan.js';
import { toTrainingRow } from '../src/services/feedbackExport.js';

dotenv.config({ path: ['.env', '../.env'], quiet: true });
const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'feedback_export.jsonl';
const labeledOnly = args.includes('--labeled-only');
if (!process.env.MONGODB_URI) { console.error('MONGODB_URI is not set.'); process.exit(1); }

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const stream = fs.createWriteStream(out);
const counts = { confirmed: 0, corrected: 0, rejected: 0 };
for await (const doc of Scan.find({ feedback: { $ne: null } }).sort({ _id: 1 }).lean().cursor()) {
  const row = toTrainingRow(doc);
  if (!row || (labeledOnly && !row.label)) continue;
  counts[row.label_kind] += 1;
  stream.write(`${JSON.stringify(row)}\n`);
}
await new Promise((r) => stream.end(r));
await mongoose.disconnect();
console.log(`wrote ${out}: ${JSON.stringify(counts)}`);
