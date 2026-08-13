import path from "node:path";
import { pruneLocalDataGenerations, readLocalData } from "../build/local-data-store.mjs";

const rootDir = path.resolve(process.argv[2] || "local-data");
const before = await readLocalData(rootDir);
if (!before) throw new Error("没有找到可清理的回页本地数据");

const result = await pruneLocalDataGenerations(rootDir, { force: true });
const after = await readLocalData(rootDir);
if (!after || after.generationId !== before.generationId) {
  throw new Error("清理后 current generation 校验失败");
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  currentGenerationId: after.generationId,
  deletedGenerations: result.deleted.length,
  retainedGenerations: result.retained.length,
  initialBackupPath: result.initialBackupPath,
}, null, 2)}\n`);
