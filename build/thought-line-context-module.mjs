import { maintainContext } from "./context-maintenance.mjs";
import { readThoughtLineContextSnapshot } from "./thought-line-context-store.mjs";

export function createContextModule({
  contextRoot,
  evaluationRoot,
  sourceReader,
  agentAdapter,
  promptVersions,
  prompts,
  now = () => new Date(),
}) {
  if (!contextRoot || !evaluationRoot) throw new Error("ContextModule 缺少数据目录");

  return Object.freeze({
    maintain(signal) {
      return maintainContext({ signal, contextRoot, sourceReader, agentAdapter, promptVersions, prompts, now });
    },
    inspect(thoughtLineId) {
      return readThoughtLineContextSnapshot({ contextRoot, evaluationRoot, thoughtLineId });
    },
  });
}
