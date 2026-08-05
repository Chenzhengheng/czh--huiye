import path from "node:path";
import { readEchoRecords } from "../build/echo-record-store.mjs";
import { readLocalData } from "../build/local-data-store.mjs";

const rootDir = path.resolve(process.argv[2] || "local-data");
const stored = await readLocalData(rootDir);
if (!stored) throw new Error("没有找到可验证的回页本地数据");

const entries = new Map(stored.data.entries.map(entry => [entry.id, entry]));
const records = await readEchoRecords(rootDir);
for (const record of records) {
  for (const entryId of record.sourceEntryIds) {
    if (!entries.has(entryId)) throw new Error(`${record.id} 引用了不存在的 Entry ${entryId}`);
  }
  for (const evidence of record.evidence) {
    const entry = entries.get(evidence.entryId);
    if (!entry.content.includes(evidence.quote)) throw new Error(`${record.id} 的证据无法在 Entry ${evidence.entryId} 原文中精确核验`);
  }
  for (const event of record.events) {
    if (event.resultEntryId !== undefined && !entries.has(event.resultEntryId)) {
      throw new Error(`${record.id} 的 continuation_saved 引用了不存在的 Entry ${event.resultEntryId}`);
    }
  }
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  echoRecords: records.length,
  relational: records.filter(record => record.mode === "relational").length,
  reflectiveRevisit: records.filter(record => record.mode === "reflective_revisit").length,
  verifiedContinuations: records.filter(record => record.events.some(event => event.type === "continuation_saved")).length,
}, null, 2)}\n`);
