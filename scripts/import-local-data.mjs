import path from "node:path";
import { importBackupFile, readLocalData } from "../build/local-data-store.mjs";

const backupPath = process.argv[2];
if (!backupPath) {
  throw new Error("用法：node scripts/import-local-data.mjs <完整备份.json>");
}

const rootDir = path.resolve("local-data");
const result = await importBackupFile(rootDir, path.resolve(backupPath), { source: "verified-cloud-migration" });
const verified = await readLocalData(rootDir);
if (!verified || verified.data.entries.length !== result.sourceEntries) throw new Error("迁移后校验失败");

process.stdout.write(`${JSON.stringify({
  ok: true,
  generationId: result.generationId,
  entries: verified.data.entries.length,
  echoes: verified.data.echoes.length,
  echoCheckedIds: verified.data.echoCheckedIds.length,
  attachments: result.counts.attachments,
  sourceSha256: result.sourceSha256,
  dataSha256: result.dataSha256,
}, null, 2)}\n`);
