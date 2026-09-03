import { readFile } from "node:fs/promises";
import path from "node:path";

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function safeRunId(value) {
  const runId = String(value ?? "");
  if (!runId || !/^[\p{L}\p{N}._-]+$/u.test(runId)) throw new Error(`评测运行 ID 无效：${runId}`);
  return runId;
}

async function readIndexedRuns(root, indexPath, runsDirectory, expectedFormat) {
  const index = await readOptionalJson(path.join(root, indexPath));
  if (!index) return [];
  if (index.format !== expectedFormat || index.version !== 1 || !Array.isArray(index.runs)) {
    throw new Error(`评测索引无效：${indexPath}`);
  }
  const records = await Promise.all(index.runs.map(({ runId }) => {
    const safeId = safeRunId(runId);
    return readOptionalJson(path.join(root, runsDirectory, safeId, "result.json"));
  }));
  return records
    .filter(Boolean)
    .sort((left, right) => String(right.evaluatedAt).localeCompare(String(left.evaluatedAt)) || String(right.runId).localeCompare(String(left.runId)));
}

export async function readEvaluationWorkbench(evaluationRoot) {
  const [runs, historicalExperiments] = await Promise.all([
    readIndexedRuns(
      evaluationRoot,
      "index.json",
      "runs",
      "huiye-thought-line-relation-evaluation-index",
    ),
    readIndexedRuns(
      evaluationRoot,
      path.join("paired-runs", "index.json"),
      "paired-runs",
      "huiye-paired-relation-evaluation-index",
    ),
  ]);
  return {
    format: "huiye-evaluation-workbench",
    version: 1,
    currentScheme: "C",
    runs,
    historicalExperiments,
  };
}
