/**
 * Fakes of the Claude, OpenAI and Gemini HTTP APIs, for tests only. Each one checks that a request has the
 * shape and credential placement its real counterpart documents (key in the right header, never in the URL;
 * alternating roles; required fields; tool definitions and tool results in the vendor's own format), answers
 * with that provider's response format, and can be told to misbehave.
 *
 * TOOL CALLING is scripted from the last plain user message, so tests can play the part of a model:
 *   [[tool:NAME {json}]]   call NAME (only if it was offered, like a well-behaved model)
 *   [[force:NAME {json}]]  call NAME even if it was NOT offered (like a manipulated or hallucinating model)
 * After the tool results come back the fake answers with text quoting them. Modes:
 *   "loop"              keep calling the first offered tool forever (tests the step limit)
 *   "obey-tool-results" also obey [[force:...]] found inside tool RESULTS (tests prompt injection through data)
 *
 * The formats are written from the vendors' public documentation. They are NOT proof that the real services
 * behave identically: `npm run ai:check` runs a live call with your keys.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type FakeMode =
  | "ok"
  | "always429"
  | "once500"
  | "500"
  | "503"
  | "401"
  | "400"
  | "slow"
  | "badjson"
  | "empty"
  | "filtered"
  | "echo-key"
  | "loop"
  | "obey-tool-results";
export type FakeId = "anthropic" | "openai" | "google";

export interface FakeAiProviders {
  url: string;
  close(): Promise<void>;
}

interface Recorded {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  query: string;
  body: Record<string, unknown>;
  malformed: string[];
}

interface Norm {
  kind: "user_text" | "assistant" | "tool_results";
  text: string;
  calls: { id: string; name: string }[];
  results: { id: string; name: string; content: string }[];
}

const FORBIDDEN_SCHEMA_KEYS = [
  "$schema",
  "additionalProperties",
  "anyOf",
  "oneOf",
  "allOf",
  "$ref",
  "$defs",
  "default",
  "pattern",
  "format",
];
function schemaProblems(node: unknown, path = "parameters"): string[] {
  if (!node || typeof node !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (FORBIDDEN_SCHEMA_KEYS.includes(k)) out.push(`${path}.${k} is not portable`);
    if (k === "properties" && v && typeof v === "object") {
      for (const [pk, pv] of Object.entries(v)) out.push(...schemaProblems(pv, `${path}.${pk}`));
    } else if (k === "items") out.push(...schemaProblems(v, `${path}[]`));
  }
  return out;
}

export function startFakeAiProviders(port: number, keys: Record<FakeId, string>): Promise<FakeAiProviders> {
  const modes: Record<FakeId, FakeMode> = { anthropic: "ok", openai: "ok", google: "ok" };
  const calls: Record<FakeId, number> = { anthropic: 0, openai: 0, google: 0 };
  const history: Record<FakeId, Recorded[]> = { anthropic: [], openai: [], google: [] };
  const failedOnce: Record<FakeId, boolean> = { anthropic: false, openai: false, google: false };
  let callCounter = 0;

  const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(data));
    });
  const tokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

  const DIRECTIVE = /\[\[(tool|force):([A-Za-z0-9_]+)\s*(\{[\s\S]*?\})?\]\]/g;
  const directives = (text: string, includeForce: boolean, offered: string[]) => {
    const out: { name: string; args: unknown }[] = [];
    for (const m of text.matchAll(DIRECTIVE)) {
      if (m[1] === "tool" && !offered.includes(m[2])) continue;
      if (m[1] === "force" && !includeForce) continue;
      let args: unknown = {};
      try {
        args = m[3] ? JSON.parse(m[3]) : {};
      } catch {
        args = { __unparseable: true };
      }
      out.push({ name: m[2], args });
    }
    return out;
  };

  /** Turns a vendor's messages into one common shape, recording anything malformed. */
  function normalise(
    id: FakeId,
    body: Record<string, unknown>,
    malformed: string[]
  ): { turns: Norm[]; offered: string[]; system: string } {
    const turns: Norm[] = [];
    let offered: string[] = [];
    let system = "";
    const seenCalls = new Map<string, string>();
    const check = (turn: Norm) => {
      for (const r of turn.results) {
        const expectedName = seenCalls.get(r.id);
        if (expectedName === undefined) malformed.push(`tool result for unknown call id ${r.id}`);
        else if (expectedName !== r.name)
          malformed.push(`tool result name ${r.name} does not match the call ${expectedName}`);
      }
      for (const c of turn.calls) seenCalls.set(c.id, c.name);
    };
    if (id === "anthropic") {
      system = String(body.system ?? "");
      const tools =
        (body.tools as { name: string; description: string; input_schema: Record<string, unknown> }[] | undefined) ??
        [];
      offered = tools.map((t) => t.name);
      for (const t of tools) {
        if (typeof t.name !== "string" || typeof t.description !== "string")
          malformed.push("tool needs name and description");
        if ((t.input_schema as { type?: string })?.type !== "object")
          malformed.push(`tool ${t.name}: input_schema.type must be object`);
        malformed.push(...schemaProblems(t.input_schema, `${t.name}.input_schema`));
      }
      const msgs = (body.messages as { role: string; content: string | Record<string, unknown>[] }[]) ?? [];
      msgs.forEach((m, i) => {
        if (m.role !== (i % 2 === 0 ? "user" : "assistant")) malformed.push("roles must alternate starting with user");
        if (typeof m.content === "string") {
          turns.push({ kind: m.role === "user" ? "user_text" : "assistant", text: m.content, calls: [], results: [] });
          return;
        }
        const blocks = m.content ?? [];
        if (m.role === "assistant") {
          const t: Norm = {
            kind: "assistant",
            text: blocks
              .filter((b) => b.type === "text")
              .map((b) => String(b.text))
              .join(""),
            calls: blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: String(b.id), name: String(b.name) })),
            results: [],
          };
          for (const b of blocks.filter((x) => x.type === "tool_use"))
            if (typeof b.input !== "object") malformed.push("tool_use.input must be an object");
          check(t);
          turns.push(t);
        } else {
          const results = blocks
            .filter((b) => b.type === "tool_result")
            .map((b) => ({
              id: String(b.tool_use_id),
              name: seenCalls.get(String(b.tool_use_id)) ?? "?",
              content: String(b.content),
            }));
          const t: Norm = {
            kind: results.length ? "tool_results" : "user_text",
            text: blocks
              .filter((b) => b.type === "text")
              .map((b) => String(b.text))
              .join(""),
            calls: [],
            results,
          };
          check(t);
          turns.push(t);
        }
      });
    } else if (id === "openai") {
      const tools =
        (body.tools as
          | { type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }[]
          | undefined) ?? [];
      offered = tools.map((t) => t.function?.name);
      for (const t of tools) {
        if (t.type !== "function" || typeof t.function?.name !== "string")
          malformed.push("tool must be {type:'function', function:{...}}");
        if ((t.function?.parameters as { type?: string })?.type !== "object")
          malformed.push(`tool ${t.function?.name}: parameters.type must be object`);
        malformed.push(...schemaProblems(t.function?.parameters, `${t.function?.name}.parameters`));
      }
      const msgs =
        (body.messages as {
          role: string;
          content: string | null;
          tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[];
          tool_call_id?: string;
        }[]) ?? [];
      let pendingResults: Norm | null = null;
      for (const m of msgs) {
        if (m.role === "system") {
          system = String(m.content ?? "");
          continue;
        }
        if (m.role === "tool") {
          if (!pendingResults) pendingResults = { kind: "tool_results", text: "", calls: [], results: [] };
          pendingResults.results.push({
            id: String(m.tool_call_id),
            name: seenCalls.get(String(m.tool_call_id)) ?? "?",
            content: String(m.content),
          });
          continue;
        }
        if (pendingResults) {
          check(pendingResults);
          turns.push(pendingResults);
          pendingResults = null;
        }
        if (m.role === "assistant" && m.tool_calls?.length) {
          for (const c of m.tool_calls) {
            try {
              JSON.parse(c.function.arguments);
            } catch {
              malformed.push("tool_calls[].function.arguments must be a JSON string");
            }
          }
          const t: Norm = {
            kind: "assistant",
            text: String(m.content ?? ""),
            calls: m.tool_calls.map((c) => ({ id: c.id, name: c.function.name })),
            results: [],
          };
          check(t);
          turns.push(t);
        } else
          turns.push({
            kind: m.role === "user" ? "user_text" : "assistant",
            text: String(m.content ?? ""),
            calls: [],
            results: [],
          });
      }
      if (pendingResults) {
        check(pendingResults);
        turns.push(pendingResults);
      }
    } else {
      const sys = body.systemInstruction as { parts?: { text: string }[] } | undefined;
      system = sys?.parts?.[0]?.text ?? "";
      const decls =
        (
          body.tools as
            | { functionDeclarations?: { name: string; description: string; parameters?: Record<string, unknown> }[] }[]
            | undefined
        )?.[0]?.functionDeclarations ?? [];
      offered = decls.map((d) => d.name);
      for (const d of decls) {
        if (typeof d.name !== "string" || typeof d.description !== "string")
          malformed.push("functionDeclaration needs name and description");
        if (d.parameters !== undefined) {
          if ((d.parameters as { type?: string }).type !== "object")
            malformed.push(`${d.name}: parameters.type must be object`);
          if (!Object.keys((d.parameters as { properties?: object }).properties ?? {}).length)
            malformed.push(`${d.name}: parameters must have properties (omit it for a function without arguments)`);
          malformed.push(...schemaProblems(d.parameters, `${d.name}.parameters`));
        }
      }
      const contents = (body.contents as { role: string; parts: Record<string, unknown>[] }[]) ?? [];
      contents.forEach((c, i) => {
        if (c.role !== (i % 2 === 0 ? "user" : "model")) malformed.push("roles must alternate starting with user");
        const parts = c.parts ?? [];
        if (c.role === "model") {
          const callParts = parts.filter((p) => p.functionCall);
          const t: Norm = {
            kind: "assistant",
            text: parts.map((p) => (typeof p.text === "string" ? p.text : "")).join(""),
            calls: callParts.map((p, k) => ({
              id: `g-${String((p.functionCall as { name: string }).name)}-${k}`,
              name: String((p.functionCall as { name: string }).name),
            })),
            results: [],
          };
          for (const cp of callParts)
            seenCalls.set(
              `g-${String((cp.functionCall as { name: string }).name)}`,
              String((cp.functionCall as { name: string }).name)
            );
          turns.push(t);
        } else {
          const fr = parts.filter((p) => p.functionResponse);
          if (fr.length) {
            const results = fr.map((p) => {
              const r = p.functionResponse as { name: string; response: Record<string, unknown> };
              if (!seenCalls.has(`g-${r.name}`))
                malformed.push(`functionResponse for a function that was not called: ${r.name}`);
              return {
                id: `g-${r.name}`,
                name: r.name,
                content: String(r.response?.content ?? r.response?.error ?? ""),
              };
            });
            turns.push({ kind: "tool_results", text: "", calls: [], results });
          } else {
            if (!parts.every((p) => typeof p.text === "string")) malformed.push("parts");
            turns.push({ kind: "user_text", text: parts.map((p) => String(p.text)).join(""), calls: [], results: [] });
          }
        }
      });
    }
    return { turns, offered, system };
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://fake");
    const path = url.pathname;
    if (path === "/__admin/mode") {
      const b = JSON.parse((await readBody(req)) || "{}");
      modes[b.provider as FakeId] = b.mode;
      failedOnce[b.provider as FakeId] = false;
      return json(res, 200, {});
    }
    if (path === "/__admin/last") {
      const p = url.searchParams.get("provider") as FakeId;
      return json(res, 200, { last: history[p].at(-1) ?? null, history: history[p], calls });
    }
    if (path === "/__admin/reset") {
      for (const id of ["anthropic", "openai", "google"] as FakeId[]) {
        modes[id] = "ok";
        calls[id] = 0;
        history[id] = [];
        failedOnce[id] = false;
      }
      return json(res, 200, {});
    }

    let id: FakeId | null = null;
    if (path === "/v1/messages") id = "anthropic";
    else if (path === "/v1/chat/completions") id = "openai";
    else if (/^\/v1beta\/models\/[^/]+:generateContent$/.test(path)) id = "google";
    if (!id || req.method !== "POST") return json(res, 404, { error: "not found" });

    const rawBody = await readBody(req);
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json(res, 400, { error: "invalid json" });
    }
    calls[id]++;
    const malformed: string[] = [];
    const key = keys[id];
    const mode = modes[id];

    let authed = false;
    if (id === "anthropic") {
      authed = req.headers["x-api-key"] === key;
      if (req.headers["anthropic-version"] !== "2023-06-01") malformed.push("anthropic-version header");
      if (typeof body.model !== "string") malformed.push("model");
      if (typeof body.max_tokens !== "number") malformed.push("max_tokens");
    } else if (id === "openai") {
      authed = req.headers.authorization === `Bearer ${key}`;
      if (typeof body.model !== "string") malformed.push("model");
      if (typeof body.max_completion_tokens !== "number") malformed.push("max_completion_tokens");
    } else {
      authed = req.headers["x-goog-api-key"] === key;
    }
    if (url.search.includes(key) || rawBody.includes(key)) malformed.push("key leaked into URL or body");

    const { turns, offered, system } = normalise(id, body, malformed);
    if (!turns.length || turns[0].kind !== "user_text")
      malformed.push("the conversation must start with a user message");
    const lastTurn = turns.at(-1);
    history[id].push({
      path,
      headers: { ...req.headers, "x-api-key": undefined, authorization: undefined, "x-goog-api-key": undefined },
      query: url.search,
      body,
      malformed,
    });
    if (history[id].length > 40) history[id].shift();

    if (!authed)
      return json(res, 401, { error: { message: `Incorrect API key provided: ${req.headers["x-api-key"] ?? ""}` } });
    if (malformed.length) return json(res, 400, { error: { message: `malformed request: ${malformed.join(", ")}` } });

    if (mode === "always429") return json(res, 429, { error: { message: "rate limited" } }, { "retry-after": "1" });
    if (mode === "500") return json(res, 500, { error: { message: "internal" } });
    if (mode === "503") return json(res, 503, { error: { message: "overloaded" } });
    if (mode === "401") return json(res, 401, { error: { message: "invalid x-api-key" } });
    if (mode === "400") return json(res, 400, { error: { message: "bad request" } });
    if (mode === "echo-key") return json(res, 400, { error: { message: `bad key ${key} and Bearer ${key}` } });
    if (mode === "once500" && !failedOnce[id]) {
      failedOnce[id] = true;
      return json(res, 500, { error: { message: "transient" } });
    }
    if (mode === "slow") await new Promise((r) => setTimeout(r, 4000));
    if (mode === "badjson") return json(res, 200, "<html>not json</html>");

    // ── decide what the "model" does ──
    let toolCalls: { id: string; name: string; args: unknown }[] = [];
    let answer = "";
    const lastUserText = [...turns].reverse().find((t) => t.kind === "user_text")?.text ?? "";
    if (mode === "loop" && offered.length) {
      toolCalls = [{ id: `call_${++callCounter}`, name: offered[0], args: {} }];
    } else if (lastTurn?.kind === "tool_results") {
      const injected =
        mode === "obey-tool-results"
          ? lastTurn.results.flatMap((r) => directives(r.content.replace(/\\"/g, '"'), true, offered))
          : [];
      if (injected.length)
        toolCalls = injected.map((d) => ({ id: `call_${++callCounter}`, name: d.name, args: d.args }));
      else
        answer = `[${id}] tool results: ${lastTurn.results.map((r) => `${r.name} => ${r.content.slice(0, 160)}`).join(" | ")}`;
    } else {
      const wanted = directives(lastUserText, true, offered);
      if (wanted.length) toolCalls = wanted.map((d) => ({ id: `call_${++callCounter}`, name: d.name, args: d.args }));
      else answer = mode === "empty" ? "" : `[${id}] echo: ${lastUserText.slice(0, 60)}`;
    }
    void system;

    const inChars = JSON.stringify(body).length;
    const inTok = tokens("x".repeat(Math.min(inChars, 200_000)));
    const outTok = tokens(answer + JSON.stringify(toolCalls));
    const filtered = mode === "filtered";

    if (id === "anthropic") {
      const content =
        filtered || (mode === "empty" && !toolCalls.length)
          ? []
          : [
              ...(answer ? [{ type: "text", text: answer }] : []),
              ...toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.args })),
            ];
      return json(
        res,
        200,
        {
          id: "msg_fake",
          type: "message",
          role: "assistant",
          model: body.model,
          content,
          stop_reason: filtered ? "refusal" : toolCalls.length ? "tool_use" : "end_turn",
          usage: { input_tokens: inTok, output_tokens: outTok },
        },
        { "request-id": "req_fake_anthropic" }
      );
    }
    if (id === "openai") {
      const message: Record<string, unknown> = {
        role: "assistant",
        content: filtered || (mode === "empty" && !toolCalls.length) ? null : answer || null,
      };
      if (toolCalls.length)
        message.tool_calls = toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        }));
      return json(
        res,
        200,
        {
          id: "chatcmpl-fake",
          model: body.model,
          choices: [
            {
              index: 0,
              message,
              finish_reason: filtered ? "content_filter" : toolCalls.length ? "tool_calls" : "stop",
            },
          ],
          usage: { prompt_tokens: inTok, completion_tokens: outTok, total_tokens: inTok + outTok },
        },
        { "x-request-id": "req_fake_openai" }
      );
    }
    if (filtered)
      return json(res, 200, { promptFeedback: { blockReason: "SAFETY" }, usageMetadata: { promptTokenCount: inTok } });
    const parts = [
      ...(answer ? [{ text: answer }] : []),
      ...toolCalls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
    ];
    return json(res, 200, {
      candidates: [
        { content: { role: "model", parts }, finishReason: mode === "empty" && !parts.length ? "OTHER" : "STOP" },
      ],
      usageMetadata: { promptTokenCount: inTok, candidatesTokenCount: outTok, totalTokenCount: inTok + outTok },
      modelVersion: String(url.pathname.split("/").pop()?.split(":")[0]),
    });
  }

  return new Promise((resolve) => {
    const server: Server = createServer((req, res) => {
      handle(req, res).catch((e) => {
        console.error("fake ai error", e);
        if (!res.headersSent) json(res, 500, { error: "fake server error" });
      });
    });
    server.listen(port, "127.0.0.1", () =>
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) })
    );
  });
}
