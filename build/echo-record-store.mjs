import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const ECHO_MODES = new Set(["relational", "reflective_revisit"]);
const EVENT_TYPES = new Set([
  "presented",
  "opened",
  "feedback_submitted",
  "response_started",
  "response_saved",
  "relation_rejected",
  "not_now",
  "continuation_started",
  "continuation_saved",
]);
const FEEDBACK_TYPES = new Set(["clarified", "already_known", "not_quite", "resonated", "accurate_no_resonance"]);
const RELATION_TYPES = new Set(["continuation", "revision", "branch", "conflict", "unresolved_question", "other"]);
const LIFECYCLE_TYPES = new Set(["candidate", "legacy_evaluation", "invalidated"]);
const REJECTION_SCOPES = new Set(["interpretation", "relationship", "evidence", "other"]);

function requireIsoDate(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field} 必须是有效 ISO 时间`);
}

function requireEntryId(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${field} 必须是正整数 Entry ID`);
}

function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} 不能为空`);
}

function safeRecordId(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(value)) throw new Error("EchoRecord ID 不安全");
  return value;
}

export function validateEchoRecord(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("EchoRecord 必须是对象");
  if (input.schemaVersion !== 2) throw new Error("EchoRecord schemaVersion 必须为 2");
  safeRecordId(input.id);
  if (!ECHO_MODES.has(input.mode)) throw new Error("EchoRecord mode 无效");
  if (input.thoughtLineId !== undefined) safeRecordId(input.thoughtLineId);
  if (input.relationType !== undefined && !RELATION_TYPES.has(input.relationType)) throw new Error("EchoRecord relationType 无效");
  if (input.lifecycle !== undefined && !LIFECYCLE_TYPES.has(input.lifecycle)) throw new Error("EchoRecord lifecycle 无效");
  if (!Array.isArray(input.sourceEntryIds)) throw new Error("sourceEntryIds 必须是数组");
  const sourceEntryIds = input.sourceEntryIds.map((id, index) => {
    requireEntryId(id, `sourceEntryIds[${index}]`);
    return id;
  });
  if (new Set(sourceEntryIds).size !== sourceEntryIds.length) throw new Error("sourceEntryIds 不能重复");
  if (input.mode === "relational" && sourceEntryIds.length < 2) throw new Error("联系回响至少需要两个 Entry");
  if (input.mode === "reflective_revisit" && sourceEntryIds.length !== 1) throw new Error("回看回响只能引用一个 Entry");
  if (input.triggerEntryId !== undefined) requireEntryId(input.triggerEntryId, "triggerEntryId");
  if (input.cooldownUntil !== undefined) requireIsoDate(input.cooldownUntil, "cooldownUntil");

  if (!Array.isArray(input.evidence) || !input.evidence.length) throw new Error("evidence 不能为空");
  for (const [index, evidence] of input.evidence.entries()) {
    requireEntryId(evidence?.entryId, `evidence[${index}].entryId`);
    if (!sourceEntryIds.includes(evidence.entryId)) throw new Error("evidence 必须引用 sourceEntryIds 中的 Entry");
    requireText(evidence.quote, `evidence[${index}].quote`);
  }

  if (!Array.isArray(input.sourceSummaries) || input.sourceSummaries.length !== sourceEntryIds.length) {
    throw new Error("sourceSummaries 必须为每个来源 Entry 保存一条 AI 浓缩");
  }
  const summaryIds = [];
  for (const [index, summary] of input.sourceSummaries.entries()) {
    requireEntryId(summary?.entryId, `sourceSummaries[${index}].entryId`);
    if (!sourceEntryIds.includes(summary.entryId)) throw new Error("sourceSummaries 必须引用 sourceEntryIds 中的 Entry");
    requireText(summary.text, `sourceSummaries[${index}].text`);
    summaryIds.push(summary.entryId);
  }
  if (new Set(summaryIds).size !== sourceEntryIds.length) throw new Error("sourceSummaries 不能缺少或重复 Entry");

  requireText(input.reason, "reason");
  if (input.question !== undefined) requireText(input.question, "question");
  requireIsoDate(input.discoveredAt, "discoveredAt");
  requireIsoDate(input.eligibleAfter, "eligibleAfter");
  requireText(input.ruleVersion, "ruleVersion");
  if (input.model !== undefined) requireText(input.model, "model");
  if (!Array.isArray(input.events)) throw new Error("events 必须是数组");
  for (const [index, event] of input.events.entries()) {
    if (!EVENT_TYPES.has(event?.type)) throw new Error(`events[${index}].type 无效`);
    if (event.id !== undefined) safeRecordId(event.id);
    requireIsoDate(event.createdAt, `events[${index}].createdAt`);
    if (event.presentationId !== undefined) safeRecordId(event.presentationId);
    if (event.resultEntryId !== undefined) requireEntryId(event.resultEntryId, `events[${index}].resultEntryId`);
    if (["continuation_saved", "response_saved"].includes(event.type) && event.resultEntryId === undefined) throw new Error(`${event.type} 必须包含 resultEntryId`);
    if (!["continuation_saved", "response_saved"].includes(event.type) && event.resultEntryId !== undefined) throw new Error("只有保存回应事件可以包含 resultEntryId");
    if (event.type === "feedback_submitted") {
      if (!FEEDBACK_TYPES.has(event.feedback)) throw new Error("feedback_submitted 必须包含有效 feedback");
      if (event.rejectionScope !== undefined && !REJECTION_SCOPES.has(event.rejectionScope)) throw new Error("rejectionScope 无效");
      if (event.feedback !== "not_quite" && event.rejectionScope !== undefined) throw new Error("只有 not_quite 可以包含 rejectionScope");
      if (event.reasonCodes !== undefined && (!Array.isArray(event.reasonCodes) || event.reasonCodes.some(value => typeof value !== "string" || !value.trim()))) throw new Error("reasonCodes 必须是非空字符串数组");
    } else if (event.feedback !== undefined || event.rejectionScope !== undefined || event.reasonCodes !== undefined) {
      throw new Error("只有 feedback_submitted 可以包含反馈字段");
    }
  }
  return structuredClone(input);
}

function echoDirectory(rootDir) {
  return path.join(rootDir, "echoes");
}

function recordPath(rootDir, id) {
  return path.join(echoDirectory(rootDir), `${safeRecordId(id)}.json`);
}

async function writeJsonAtomically(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, filePath);
}

export async function readEchoRecords(rootDir) {
  const directory = echoDirectory(rootDir);
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const records = [];
  for (const name of names.filter(name => name.endsWith(".json")).sort()) {
    const parsed = JSON.parse(await readFile(path.join(directory, name), "utf8"));
    records.push(validateEchoRecord(parsed));
  }
  return records.sort((left, right) => left.discoveredAt.localeCompare(right.discoveredAt));
}

export async function writeEchoRecord(rootDir, input) {
  const record = validateEchoRecord(input);
  await writeJsonAtomically(recordPath(rootDir, record.id), record);
  return record;
}

export async function appendEchoEvent(rootDir, echoRecordId, eventInput) {
  const filePath = recordPath(rootDir, echoRecordId);
  const record = validateEchoRecord(JSON.parse(await readFile(filePath, "utf8")));
  const event = {
    id: eventInput?.id || `event-${randomUUID()}`,
    type: eventInput?.type,
    createdAt: eventInput?.createdAt || new Date().toISOString(),
    ...(eventInput?.presentationId === undefined ? {} : { presentationId: eventInput.presentationId }),
    ...(eventInput?.feedback === undefined ? {} : { feedback: eventInput.feedback }),
    ...(eventInput?.rejectionScope === undefined ? {} : { rejectionScope: eventInput.rejectionScope }),
    ...(eventInput?.reasonCodes === undefined ? {} : { reasonCodes: eventInput.reasonCodes }),
    ...(eventInput?.resultEntryId === undefined ? {} : { resultEntryId: eventInput.resultEntryId }),
  };
  const updated = validateEchoRecord({ ...record, events: [...record.events, event] });
  await writeJsonAtomically(filePath, updated);
  return updated;
}
