import path from "node:path";
import { readLocalData } from "../build/local-data-store.mjs";

const rootDir = path.resolve(process.argv[2] || "local-data");
const stored = await readLocalData(rootDir);
if (!stored) throw new Error("没有找到可验证的回页本地数据");

const ids = stored.data.entries.map(entry => String(entry.id));
const uniqueIds = new Set(ids);
if (uniqueIds.size !== ids.length) throw new Error("本地日记 ID 存在重复");

process.stdout.write(`${JSON.stringify({
  ok: true,
  generationId: stored.generationId,
  updatedAt: stored.generation.updatedAt,
  entries: stored.data.entries.length,
  uniqueEntryIds: uniqueIds.size,
  echoes: stored.data.echoes.length,
  echoCheckedIds: stored.data.echoCheckedIds.length,
  attachments: stored.data.entries.reduce((sum, entry) => sum + (entry.attachments?.length || 0), 0),
  dataSha256: stored.generation.dataSha256,
}, null, 2)}\n`);
