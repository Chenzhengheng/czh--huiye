import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const STORE_FORMAT = "huiye-local-store";
const STORE_VERSION = 1;
const BACKUP_FORMAT = "huiye-backup";
const BACKUP_VERSION = 1;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function safeName(value, fallback = "item") {
  const cleaned = String(value ?? "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

function assertBackup(data) {
  if (!data || typeof data !== "object") throw new Error("回页数据必须是对象");
  if (data.format !== BACKUP_FORMAT || data.version !== BACKUP_VERSION) {
    throw new Error("不支持的回页数据格式");
  }
  if (!Array.isArray(data.entries) || !Array.isArray(data.echoes) || !Array.isArray(data.echoCheckedIds)) {
    throw new Error("回页数据缺少 entries、echoes 或 echoCheckedIds");
  }
  const ids = new Set();
  for (const entry of data.entries) {
    if (!entry || typeof entry !== "object" || entry.id === undefined || typeof entry.content !== "string") {
      throw new Error("存在无效日记记录");
    }
    const id = String(entry.id);
    if (ids.has(id)) throw new Error(`日记 ID 重复：${id}`);
    ids.add(id);
    if (entry.thoughtLineIds !== undefined && (!Array.isArray(entry.thoughtLineIds) || entry.thoughtLineIds.some(value => typeof value !== "string" || !value))) {
      throw new Error(`日记 ${id} 的 thoughtLineIds 无效`);
    }
  }
  const thoughtLines = data.thoughtLines;
  if (thoughtLines !== undefined) {
    if (!Array.isArray(thoughtLines)) throw new Error("thoughtLines 必须是数组");
    const lineIds = new Set();
    const activeNames = new Set();
    for (const line of thoughtLines) {
      if (!line || typeof line.id !== "string" || !line.id || typeof line.name !== "string" || !line.name.trim()) throw new Error("存在无效思考线");
      if (lineIds.has(line.id)) throw new Error(`思考线 ID 重复：${line.id}`);
      lineIds.add(line.id);
      if (!new Set(["active", "archived", "merged"]).has(line.status)) throw new Error(`思考线状态无效：${line.id}`);
      if (typeof line.allowEcho !== "boolean") throw new Error(`思考线权限无效：${line.id}`);
      if (line.status !== "merged") {
        if (activeNames.has(line.name)) throw new Error(`思考线名称重复：${line.name}`);
        activeNames.add(line.name);
      }
    }
    for (const entry of data.entries) {
      for (const lineId of entry.thoughtLineIds ?? []) if (!lineIds.has(lineId)) throw new Error(`日记 ${entry.id} 引用了不存在的思考线：${lineId}`);
    }
  }
  if (data.caseRecords !== undefined) {
    if (!Array.isArray(data.caseRecords)) throw new Error("caseRecords 必须是数组");
    const caseIds = new Set();
    const caseEchoIds = new Set();
    const levels = new Set(["high", "medium", "low"]);
    const dimensionKeys = new Set(["relationValidity", "manifestationGain", "reencounterFeeling"]);
    for (const record of data.caseRecords) {
      if (!record || typeof record.id !== "string" || !record.id.trim()) throw new Error("存在无效 CaseRecord");
      if (caseIds.has(record.id)) throw new Error(`CaseRecord ID 重复：${record.id}`);
      caseIds.add(record.id);
      if (typeof record.echoRecordId !== "string" || !record.echoRecordId.trim()) throw new Error(`CaseRecord 缺少 EchoRecord：${record.id}`);
      if (caseEchoIds.has(record.echoRecordId)) throw new Error(`一条 EchoRecord 只能有一条 CaseRecord：${record.echoRecordId}`);
      caseEchoIds.add(record.echoRecordId);
      if (record.verdict !== undefined && !new Set(["good", "bad"]).has(record.verdict)) throw new Error(`CaseRecord verdict 无效：${record.id}`);
      if (record.feedback !== undefined && !new Set(["clarified", "already_known", "not_quite"]).has(record.feedback)) throw new Error(`CaseRecord feedback 无效：${record.id}`);
      if (record.promptVersion !== undefined && (typeof record.promptVersion !== "string" || !record.promptVersion.trim())) throw new Error(`CaseRecord PromptVersion 无效：${record.id}`);
      if (record.dimensions !== undefined) {
        if (!record.dimensions || typeof record.dimensions !== "object" || Array.isArray(record.dimensions)) throw new Error(`CaseRecord dimensions 无效：${record.id}`);
        for (const [key, value] of Object.entries(record.dimensions)) {
          if (!dimensionKeys.has(key) || !levels.has(value)) throw new Error(`CaseRecord 评测维度无效：${record.id}`);
        }
      }
    }
  }
  if (data.echoReplies !== undefined) {
    if (!Array.isArray(data.echoReplies)) throw new Error("echoReplies 必须是数组");
    const replyIds = new Set();
    const repliedEchoIds = new Set();
    for (const reply of data.echoReplies) {
      if (!reply || typeof reply.id !== "string" || !reply.id.trim()) throw new Error("存在无效回响回应");
      if (replyIds.has(reply.id)) throw new Error(`回响回应 ID 重复：${reply.id}`);
      replyIds.add(reply.id);
      if (typeof reply.echoRecordId !== "string" || !reply.echoRecordId.trim()) throw new Error(`回响回应缺少 EchoRecord：${reply.id}`);
      if (repliedEchoIds.has(reply.echoRecordId)) throw new Error(`一条回响只能保存一个回应：${reply.echoRecordId}`);
      repliedEchoIds.add(reply.echoRecordId);
      if (typeof reply.content !== "string" || !reply.content.trim()) throw new Error(`回响回应正文不能为空：${reply.id}`);
      for (const field of ["createdAt", "updatedAt"]) if (typeof reply[field] !== "string" || Number.isNaN(Date.parse(reply[field]))) throw new Error(`回响回应时间无效：${reply.id}`);
    }
  }
  return data;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readOptionalJson(filePath, fallback) {
  try { return await readJson(filePath); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

async function renameWithRetry(from, to) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      lastError = error;
      if (!["EPERM", "EACCES", "EBUSY", "ENOTEMPTY"].includes(error?.code) || attempt === 7) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw lastError;
}

function parseAttachmentData(data) {
  if (typeof data !== "string") return { encoding: "text", bytes: Buffer.from("") };
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,([\s\S]*)$/.exec(data);
  if (match) return { encoding: "base64", mimeType: match[1] || "application/octet-stream", bytes: Buffer.from(match[2], "base64") };
  return { encoding: "text", bytes: Buffer.from(data, "utf8") };
}

async function writeEntry(entriesDir, entry) {
  const entryDir = path.join(entriesDir, safeName(entry.id, "entry"));
  const attachmentsDir = path.join(entryDir, "attachments");
  await mkdir(attachmentsDir, { recursive: true });

  const { content, attachments = [], ...metadata } = entry;
  await writeFile(path.join(entryDir, "content.md"), content, { encoding: "utf8", flag: "wx" });

  const attachmentRecords = [];
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index] ?? {};
    const parsed = parseAttachmentData(attachment.data);
    const filename = `${String(index + 1).padStart(2, "0")}-${safeName(attachment.name, "attachment")}`;
    await writeFile(path.join(attachmentsDir, filename), parsed.bytes, { flag: "wx" });
    attachmentRecords.push({
      name: String(attachment.name || filename),
      type: String(attachment.type || parsed.mimeType || "application/octet-stream"),
      file: filename,
      encoding: parsed.encoding,
      sha256: sha256(parsed.bytes),
    });
  }

  await writeJson(path.join(entryDir, "record.json"), {
    format: "huiye-entry",
    version: 1,
    ...metadata,
    attachmentsPresent: Object.hasOwn(entry, "attachments"),
    attachments: attachmentRecords,
  });
}

async function readEntry(entryDir) {
  const record = await readJson(path.join(entryDir, "record.json"));
  if (record.format !== "huiye-entry" || record.version !== 1) throw new Error(`无效日记目录：${entryDir}`);
  const content = await readFile(path.join(entryDir, "content.md"), "utf8");
  const attachments = [];
  for (const item of Array.isArray(record.attachments) ? record.attachments : []) {
    const bytes = await readFile(path.join(entryDir, "attachments", safeName(item.file)));
    if (item.sha256 && sha256(bytes) !== item.sha256) throw new Error(`附件校验失败：${item.name}`);
    attachments.push({
      name: item.name,
      type: item.type,
      data: item.encoding === "text" ? bytes.toString("utf8") : `data:${item.type};base64,${bytes.toString("base64")}`,
    });
  }
  const { format: _format, version: _version, attachments: _attachments, attachmentsPresent, ...metadata } = record;
  return { ...metadata, content, ...(attachmentsPresent || attachments.length ? { attachments } : {}) };
}

async function readGeneration(generationDir) {
  const generation = await readJson(path.join(generationDir, "generation.json"));
  if (generation.format !== STORE_FORMAT || generation.version !== STORE_VERSION) throw new Error("无效本地数据代次");

  const entriesDir = path.join(generationDir, "entries");
  const availableNames = (await readdir(entriesDir, { withFileTypes: true }))
    .filter(item => item.isDirectory())
    .map(item => item.name)
    .sort();
  let names = availableNames;
  try {
    const entryOrder = await readJson(path.join(generationDir, "relations", "entry-order.json"));
    if (Array.isArray(entryOrder)) {
      const ordered = entryOrder.map(id => safeName(id, "entry"));
      if (ordered.length === availableNames.length && ordered.every(name => availableNames.includes(name))) names = ordered;
    }
  } catch {
    // Older local generations can still be read in directory order.
  }
  const entries = [];
  for (const name of names) entries.push(await readEntry(path.join(entriesDir, name)));

  const thoughtLines = await readOptionalJson(path.join(generationDir, "relations", "thought-lines.json"), undefined);
  const caseRecords = await readOptionalJson(path.join(generationDir, "relations", "case-records.json"), undefined);
  const echoReplies = await readOptionalJson(path.join(generationDir, "relations", "echo-replies.json"), undefined);
  const data = assertBackup({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: generation.updatedAt,
    entries,
    echoes: await readJson(path.join(generationDir, "relations", "echoes.json")),
    echoCheckedIds: await readJson(path.join(generationDir, "relations", "echo-checked-ids.json")),
    ...(thoughtLines === undefined ? {} : { thoughtLines }),
    ...(caseRecords === undefined ? {} : { caseRecords }),
    ...(echoReplies === undefined ? {} : { echoReplies }),
  });
  if (generation.dataSha256 && generation.dataSha256 !== sha256(stableStringify(data))) throw new Error("本地数据代次校验失败");
  return { data, generation };
}

async function switchCurrentPointer(rootDir, generationId, updatedAt) {
  const historyDir = path.join(rootDir, "pointer-history");
  await mkdir(historyDir, { recursive: true });
  const currentPath = path.join(rootDir, "current.json");
  try {
    await stat(currentPath);
    await copyFile(currentPath, path.join(historyDir, `${generationId}.previous.json`));
  } catch {
    // The first valid generation has no previous pointer.
  }
  const nextPointer = path.join(rootDir, `current.${generationId}.next.json`);
  const pointerContents = `${JSON.stringify({ format: STORE_FORMAT, version: STORE_VERSION, generationId, updatedAt }, null, 2)}\n`;
  await writeFile(nextPointer, pointerContents, { encoding: "utf8", flag: "w" });
  try {
    await rename(nextPointer, currentPath);
  } catch {
    const archivedPointer = path.join(historyDir, `${generationId}.${Date.now()}.replaced.json`);
    try { await renameWithRetry(currentPath, archivedPointer); } catch { /* Current may not exist. */ }
    await renameWithRetry(nextPointer, currentPath);
  }
}

export async function recoverInterruptedWrites(rootDir) {
  let currentUpdatedAt = "";
  try {
    const current = await readJson(path.join(rootDir, "current.json"));
    const active = await readGeneration(path.join(rootDir, "generations", safeName(current.generationId, "generation")));
    currentUpdatedAt = active.generation.updatedAt || "";
  } catch {
    // A broken pointer can be recovered from a complete staging generation.
  }

  let names = [];
  try {
    names = (await readdir(path.join(rootDir, "generations"), { withFileTypes: true }))
      .filter(item => item.isDirectory() && item.name.startsWith(".staging-"))
      .map(item => item.name);
  } catch {
    return null;
  }

  const candidates = [];
  for (const name of names) {
    try {
      const staged = await readGeneration(path.join(rootDir, "generations", name));
      if ((staged.generation.updatedAt || "") > currentUpdatedAt) candidates.push({ name, ...staged });
    } catch {
      // Incomplete staging folders are preserved for manual inspection.
    }
  }
  candidates.sort((a, b) => String(b.generation.updatedAt).localeCompare(String(a.generation.updatedAt)));
  const newest = candidates[0];
  if (!newest) return null;

  const generationId = newest.generation.generationId;
  const stagingDir = path.join(rootDir, "generations", newest.name);
  const finalDir = path.join(rootDir, "generations", generationId);
  await renameWithRetry(stagingDir, finalDir);
  await switchCurrentPointer(rootDir, generationId, newest.generation.updatedAt);
  return { generationId, generation: newest.generation, data: newest.data };
}

async function listGenerationIds(rootDir) {
  const generationsDir = path.join(rootDir, "generations");
  try {
    return (await readdir(generationsDir, { withFileTypes: true }))
      .filter(item => item.isDirectory() && !item.name.startsWith(".staging-"))
      .map(item => item.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function readLocalData(rootDir) {
  await recoverInterruptedWrites(rootDir);
  let preferred = null;
  try {
    preferred = (await readJson(path.join(rootDir, "current.json"))).generationId;
  } catch {
    // A missing or interrupted pointer is recoverable from immutable generations.
  }
  const candidates = [...new Set([preferred, ...(await listGenerationIds(rootDir))].filter(Boolean))];
  let lastError = null;
  for (const generationId of candidates) {
    try {
      const result = await readGeneration(path.join(rootDir, "generations", generationId));
      return { ...result, generationId };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return null;
}

export async function writeLocalData(rootDir, input, options = {}) {
  const source = options.source || "local-app";
  const data = assertBackup(structuredClone(input));
  const updatedAt = new Date().toISOString();
  data.exportedAt = updatedAt;

  const generationId = `${updatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID()}`;
  const generationsDir = path.join(rootDir, "generations");
  const stagingDir = path.join(generationsDir, `.staging-${generationId}`);
  const finalDir = path.join(generationsDir, generationId);
  await mkdir(path.join(stagingDir, "entries"), { recursive: true });
  await mkdir(path.join(stagingDir, "relations"), { recursive: true });
  await mkdir(path.join(stagingDir, "associations"), { recursive: true });

  for (const entry of data.entries) await writeEntry(path.join(stagingDir, "entries"), entry);
  await writeJson(path.join(stagingDir, "relations", "entry-order.json"), data.entries.map(entry => entry.id));
  await writeJson(path.join(stagingDir, "relations", "echoes.json"), data.echoes);
  await writeJson(path.join(stagingDir, "relations", "echo-checked-ids.json"), data.echoCheckedIds);
  if (Array.isArray(data.thoughtLines)) await writeJson(path.join(stagingDir, "relations", "thought-lines.json"), data.thoughtLines);
  if (Array.isArray(data.caseRecords)) await writeJson(path.join(stagingDir, "relations", "case-records.json"), data.caseRecords);
  if (Array.isArray(data.echoReplies)) await writeJson(path.join(stagingDir, "relations", "echo-replies.json"), data.echoReplies);
  await writeJson(path.join(stagingDir, "backup.json"), data);
  await writeJson(path.join(stagingDir, "generation.json"), {
    format: STORE_FORMAT,
    version: STORE_VERSION,
    generationId,
    updatedAt,
    source,
    counts: {
      entries: data.entries.length,
      echoes: data.echoes.length,
      echoCheckedIds: data.echoCheckedIds.length,
      attachments: data.entries.reduce((sum, entry) => sum + (Array.isArray(entry.attachments) ? entry.attachments.length : 0), 0),
      thoughtLines: Array.isArray(data.thoughtLines) ? data.thoughtLines.length : 0,
      caseRecords: Array.isArray(data.caseRecords) ? data.caseRecords.length : 0,
      echoReplies: Array.isArray(data.echoReplies) ? data.echoReplies.length : 0,
    },
    dataSha256: sha256(stableStringify(data)),
  });

  const staged = await readGeneration(stagingDir);
  if (staged.data.entries.length !== data.entries.length) throw new Error("本地数据写入校验失败");
  await renameWithRetry(stagingDir, finalDir);
  await switchCurrentPointer(rootDir, generationId, updatedAt);

  return { generationId, updatedAt, counts: staged.generation.counts, dataSha256: staged.generation.dataSha256 };
}

export async function importBackupFile(rootDir, backupPath, options = {}) {
  const contents = await readFile(backupPath, "utf8");
  const data = assertBackup(JSON.parse(contents));
  const result = await writeLocalData(rootDir, data, { source: options.source || `import:${path.basename(backupPath)}` });
  return { ...result, sourceSha256: sha256(contents), sourceEntries: data.entries.length };
}

export const localDataConstants = { STORE_FORMAT, STORE_VERSION, BACKUP_FORMAT, BACKUP_VERSION };
