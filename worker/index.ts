/** Cloudflare Worker entry point for 回页. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  DATA: R2Bucket;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type HuiyeData = {
  format: "huiye-backup";
  version: 1;
  exportedAt: string;
  entries: unknown[];
  echoes: unknown[];
  echoCheckedIds: unknown[];
};

function authenticatedEmail(request: Request): string | null {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  return email || null;
}

async function userDataKey(email: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return `users/${hash}/huiye-data.json`;
}

function isHuiyeData(value: unknown): value is HuiyeData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<HuiyeData>;
  return data.format === "huiye-backup"
    && data.version === 1
    && Array.isArray(data.entries)
    && Array.isArray(data.echoes)
    && Array.isArray(data.echoCheckedIds);
}

async function handleDataRequest(request: Request, env: Env): Promise<Response> {
  const email = authenticatedEmail(request);
  if (!email) return Response.json({ error: "Sign in with ChatGPT to access your data." }, { status: 401 });
  if (!env.DATA) return Response.json({ error: "Private storage is not configured." }, { status: 503 });

  const key = await userDataKey(email);
  if (request.method === "GET") {
    const object = await env.DATA.get(key);
    if (!object) return Response.json({ data: null, updatedAt: null });
    try {
      const data = JSON.parse(await object.text()) as unknown;
      if (!isHuiyeData(data)) throw new Error("Invalid stored data");
      return Response.json({ data, updatedAt: object.uploaded.toISOString() });
    } catch {
      return Response.json({ error: "Stored data could not be read." }, { status: 500 });
    }
  }

  if (request.method === "PUT") {
    const declaredSize = Number(request.headers.get("content-length") || 0);
    if (declaredSize > 30 * 1024 * 1024) {
      return Response.json({ error: "Data is too large to save." }, { status: 413 });
    }
    let data: unknown;
    try {
      data = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON." }, { status: 400 });
    }
    if (!isHuiyeData(data)) return Response.json({ error: "Invalid Huiye data." }, { status: 400 });

    const contents = JSON.stringify({ ...data, exportedAt: new Date().toISOString() });
    if (contents.length > 30 * 1024 * 1024) {
      return Response.json({ error: "Data is too large to save." }, { status: 413 });
    }
    await env.DATA.put(key, contents, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
    return Response.json({ saved: true, updatedAt: new Date().toISOString() });
  }

  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, PUT" } });
}

const ORGANIZE_PROMPT = `你是“回页”的轻量整理助手。

你的职责是降低用户未来回看日记时的管理成本和阅读成本。你不是作者、导师、心理咨询师或总结者；你不替用户思考，不替用户下结论。

用户原文是唯一事实来源。原文优先；整理稿必须尽可能保留用户原本的表达、语气、顺序与思考轨迹。AI 应该尽量隐形。

任务：为未命名或标题过于通用的记录提供建议标题；生成最小整理稿；提供 0–3 个标签建议。

不得添加原文中不存在的事实、因果、案例、动机、结论、建议或技术细节；不得删除有信息或思考价值的句子；不得改变原文推理顺序；不得消除犹豫、保留意见、括号、疑问、矛盾、跳跃、未完成句或自我提醒；不得将并列想法强行组织成完整论证；不得进行心理分析、人格判断、价值评判、鼓励式总结或温情化表达。

不得使用“总结”“启示”“核心结论”“建议”“为什么”等自行创造的概念性小标题。仅允许分段与留白、修正明显错别字或标点、把原文明确并列内容变为列表，以及将用户原本已有的转折词、例子提示、拆解词或延伸词单独成行作为轻微阅读锚点。不得自行创造锚点。

如果用户已有明确标题，原样保留；“未命名记录”“快速记录”等通用标题视为无标题。标签必须来自原文明确出现或可直接对应的具体概念；最多 3 个；不确定时宁可少给。`;

const OUTPUT_CONTRACT = `
STRICT OUTPUT FIELD BOUNDARIES (highest priority): Return a JSON object only, matching the schema. The title belongs only in "title". The cleaned diary body belongs only in "organized_content". Tags belong only in "tags". "organized_content" must contain only the diary body that the user could accept directly: never include a title, field names, labels, headings such as \"suggested title\" or \"minimal draft\", a tags line, parenthetical notes, explanations, or rationale.
`;

const ORGANIZATION_STANDARD = `
整理质量标准：
- “最小整理”不等于原样复写。只要不改变原意，可以通过分段、留白和列表，降低重新进入这段思考的阅读成本。
- 识别原文已经存在的转折、举例、拆解、并列项与推理阶段；在这些位置前后留出呼吸感。用户明确写出的“第一、第二、第三”等并列项可以改为列表。
- 不创造新的总结性小标题；如果需要阅读锚点，只能使用用户原文已有的词，如“举例”“再往下拆解”。
- 标题应指出这篇记录的真实张力、问题或推理路径，不要把两个概念机械并列。若无法给出贴切标题，宁可使用原有标题或“未命名记录”。
- 标签是未来找回这篇记录的检索路标，不是原句截取；只给 1–3 个具体、可辨认的概念。
- 保留用户的犹豫、括号、限定和自我保留，例如“这里我瞎说的”；不要把它们修成确定结论。
`;
function cleanOrganizedContent(value: string): string {
  const body = value.trim();
  const hasEmbeddedFields = /^(?:(?:\u5efa\u8bae\u6807\u9898|\u6807\u9898)\s*[:\uff1a][^\n]*\n+)?(?:\u6700\u5c0f\u6574\u7406\u7a3f|\u6574\u7406\u540e\u7684\u6b63\u6587|\u6b63\u6587)\s*[:\uff1a]/.test(body);
  if (!hasEmbeddedFields) return body;
  return body
    .replace(/^(?:(?:\u5efa\u8bae\u6807\u9898|\u6807\u9898)\s*[:\uff1a][^\n]*\n+)?(?:\u6700\u5c0f\u6574\u7406\u7a3f|\u6574\u7406\u540e\u7684\u6b63\u6587|\u6b63\u6587)\s*[:\uff1a]\s*/, "")
    .replace(/\n{2,}(?:\u6807\u7b7e|tags?)\s*[:\uff1a][\s\S]*$/i, "")
    .trim();
}
const ORGANIZE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    organized_content: { type: "string" },
    tags: { type: "array", items: { type: "string" }, maxItems: 3 },
  },
  required: ["title", "organized_content", "tags"],
};

async function organizeDiary(request: Request, env: Env): Promise<Response> {
  if (!env.OPENROUTER_API_KEY || !env.OPENROUTER_MODEL) return Response.json({ error: "AI 服务尚未配置。请先在服务端填入 OpenRouter Key 和模型名。" }, { status: 503 });
  let input: { title?: string; content?: string; systemPrompt?: string };
  try { input = await request.json(); } catch { return Response.json({ error: "请求格式不正确。" }, { status: 400 }); }
  const content = input.content?.trim();
  const requestedPrompt = typeof input.systemPrompt === "string" && input.systemPrompt.trim().length > 100 && input.systemPrompt.length <= 12000 ? input.systemPrompt.trim() : ORGANIZE_PROMPT;
  const systemPrompt = `${requestedPrompt}\n\n${ORGANIZATION_STANDARD}\n\n${OUTPUT_CONTRACT}`;
  if (!content) return Response.json({ error: "没有可整理的正文。" }, { status: 400 });

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `现有标题：${input.title || "未命名记录"}\n\n原文：\n${content}` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "diary_organization", strict: true, schema: ORGANIZE_SCHEMA } },
      provider: { require_parameters: true },
    }),
  });
  if (!response.ok) return Response.json({ error: "AI 整理暂时没有完成，请稍后再试。" }, { status: 502 });
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  try {
    const organized = JSON.parse(result.choices?.[0]?.message?.content || "") as { title: string; organized_content: string; tags: string[] };
    const cleanedContent = cleanOrganizedContent(organized.organized_content);
    return Response.json({ title: organized.title, content: cleanedContent || content, tags: organized.tags.slice(0, 3) });
  } catch { return Response.json({ error: "AI 返回了无法读取的结果，请重试。" }, { status: 502 }); }
}


type RecallCandidate = { id: number; title: string; content: string; createdAt?: string; date?: string };

const RECALL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    should_recall: { type: "boolean" },
    candidate_id: { type: "string" },
    quote: { type: "string" },
    reason: { type: "string" },
  },
  required: ["should_recall", "candidate_id", "quote", "reason"],
};

async function prepareRecall(request: Request, env: Env): Promise<Response> {
  if (!env.OPENROUTER_API_KEY || !env.OPENROUTER_MODEL) return Response.json({ error: "AI service is not configured." }, { status: 503 });
  let input: { current?: RecallCandidate; candidates?: RecallCandidate[] };
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const current = input.current;
  const candidates = (input.candidates || []).filter(candidate => candidate.id !== current?.id && candidate.content?.trim()).slice(0, 18);
  if (!current?.content?.trim() || !candidates.length) return Response.json({ echo: null });

  const system = `You are the recall gate for a private thinking journal. Decide whether exactly one older note is genuinely useful to bring back after the user has finished writing a new note. Similar keywords are not enough. Return true only when the older note offers a concrete earlier question, assumption, counterexample, condition, or unfinished thread that could help the user think further now. If uncertain, return false. Never make personality claims, life analysis, encouragement, or conclusions. When true, quote one short exact excerpt from the older note only, and provide one restrained Chinese sentence (max 42 Chinese characters) explaining the shared question. The explanation must be supported by both notes. When false, return empty strings for candidate_id, quote, and reason.`;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ current: { ...current, content: current.content.slice(0, 7000) }, candidates: candidates.map(candidate => ({ ...candidate, content: candidate.content.slice(0, 5000) })) }) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "journal_recall", strict: true, schema: RECALL_SCHEMA } },
      provider: { require_parameters: true },
    }),
  });
  if (!response.ok) return Response.json({ error: "Recall was not completed." }, { status: 502 });
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  try {
    const judged = JSON.parse(result.choices?.[0]?.message?.content || "") as { should_recall: boolean; candidate_id: string; quote: string; reason: string };
    const candidate = candidates.find(item => String(item.id) === String(judged.candidate_id));
    const quote = judged.quote?.trim() || "";
    const reason = judged.reason?.trim().slice(0, 80) || "";
    if (!judged.should_recall || !candidate || !quote || !candidate.content.includes(quote) || !reason) return Response.json({ echo: null });
    return Response.json({ echo: { candidateId: candidate.id, quote, reason } });
  } catch { return Response.json({ error: "Recall result could not be read." }, { status: 502 }); }
}
const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (url.pathname === "/api/organize" && request.method === "POST") return organizeDiary(request, env);
    if (url.pathname === "/api/recall" && request.method === "POST") return prepareRecall(request, env);
    if (url.pathname === "/api/data") return handleDataRequest(request, env);
    return handler.fetch(request, env, ctx);
  },
};

export default worker;
