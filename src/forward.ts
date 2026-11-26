/**
 * factdocs core: a forwarding client for the hosted
 * Ecuafact docsapi MCP server.
 *
 * Nothing about the documentation is computed here.
 * tools/list is answered from the literal definitions
 * below, which reproduce a live capture of the upstream
 * server word for word (name, description and
 * inputSchema exactly as captured; the capture carries
 * NO title keys on any tool, and two tools --
 * consultar_referencia and listar_guias -- carry no
 * `required` key, so none is served for them; some
 * properties carry `default` keys and they are served
 * verbatim). A tools/call travels upstream over a
 * streamable-HTTP JSON-RPC session: an initialize POST,
 * a notifications/initialized POST, then the tools/call
 * POST, carrying the Mcp-Session-Id response header on
 * later requests when the upstream issues one. The
 * session opens lazily on the first forwarded call and
 * is reused for the client's lifetime.
 *
 * The endpoint is pinned to
 * https://docsapi.ecuafact.com/mcp and may be replaced
 * with the FACTDOCS_MCP_URL environment variable
 * (that override is a labelled reconstruction). The
 * registry record declares NO headers on the upstream
 * remote, so no auth header is ever sent, under any
 * environment.
 *
 * A successful upstream result is returned exactly as
 * received, isError flag and extra fields included.
 * Failures -- an upstream JSON-RPC error, a non-2xx
 * status, a body that cannot be parsed, or a fetch
 * that throws or times out -- become an isError result
 * whose text begins with `factdocs error:` (that
 * rendering is a labelled reconstruction). Replies may
 * be plain JSON or SSE (`data:` lines); the JSON-RPC
 * message whose id matches the request wins.
 */
import type {
  FetchFn,
  FetchResponseLike,
  ForwardDeps,
  ToolArgs,
  ToolDef,
  ToolResult,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_ENDPOINT_URL = "https://docsapi.ecuafact.com/mcp";

export const DEFAULT_TIMEOUT_MS = 30000;

export const PROTOCOL_VERSION = "2025-03-26";

/* ------------------------------------------------------------------ */
/* Tool definitions (tools/list literals, verbatim from the live       */
/* capture in harness/fixtures/ecuafact-tools.json; generated           */
/* programmatically by parsing and re-serialising the fixture JSON,    */
/* never retyped). All 6 captured tools are built.                     */
/* ------------------------------------------------------------------ */

export const TOOL_DEFS: ToolDef[] = [
  {
    "description": "Devuelve un JSON de ejemplo valido para emitir un tipo de comprobante (01 factura, 03 liquidacion de compra, 04 nota de credito, 05 nota de debito, 06 guia de remision, 07 retencion), con el enlace a su guia.",
    "inputSchema": {
      "properties": {
        "tipo": {
          "description": "Tipo de comprobante: 01, 03, 04, 05, 06 o 07, o su nombre (factura, nota de credito...)."
        }
      },
      "required": [
        "tipo"
      ],
      "type": "object"
    },
    "name": "ejemplo_comprobante"
  },
  {
    "description": "Explica un codigo de error del catalogo de la API (tres digitos, por ejemplo 302 o 401): estado HTTP, mensaje, cuando ocurre, que hacer y si se reintenta. El codigo es el campo 'codigo' del cuerpo de error, no el estado HTTP.",
    "inputSchema": {
      "properties": {
        "codigo": {
          "description": "Codigo del catalogo, por ejemplo '302'."
        }
      },
      "required": [
        "codigo"
      ],
      "type": "object"
    },
    "name": "explicar_error"
  },
  {
    "description": "Devuelve una guia en Markdown. Con seccion, devuelve solo la seccion cuyo titulo coincide; las guias largas (por ejemplo las de SDK) conviene leerlas por seccion.",
    "inputSchema": {
      "properties": {
        "seccion": {
          "default": null,
          "description": "Titulo o parte del titulo de una seccion (opcional), por ejemplo 'Firma' o 'Catalogo de codigos'."
        },
        "slug": {
          "description": "Slug de la guia, por ejemplo 'emision-01' o 'webhooks'. Tambien acepta su URL."
        }
      },
      "required": [
        "slug"
      ],
      "type": "object"
    },
    "name": "leer_guia"
  },
  {
    "description": "Busca en la documentacion y devuelve las guias relevantes con un fragmento y su URL. Despues, lee la guia con leer_guia.",
    "inputSchema": {
      "properties": {
        "consulta": {
          "description": "Que buscar, por ejemplo 'nota de credito', 'firma de webhooks' o 'Idempotency-Key'."
        },
        "maximo": {
          "default": 8,
          "description": "Maximo de resultados (1 a 20, por defecto 8).",
          "type": "integer"
        }
      },
      "required": [
        "consulta"
      ],
      "type": "object"
    },
    "name": "buscar_documentacion"
  },
  {
    "description": "Consulta el contrato OpenAPI del API. Sin ruta, lista los endpoints. Con ruta (y metodo), devuelve los parametros, el cuerpo, las respuestas y los esquemas que usa.",
    "inputSchema": {
      "properties": {
        "metodo": {
          "default": null,
          "description": "Metodo HTTP: GET, POST, PUT o DELETE (opcional; por defecto el unico o el primero)."
        },
        "ruta": {
          "default": null,
          "description": "Ruta del endpoint como aparece en el listado, por ejemplo '/v1/contribuyentes/{identificacion}/comprobantes' (opcional)."
        }
      },
      "type": "object"
    },
    "name": "consultar_referencia"
  },
  {
    "description": "Lista las guias de la documentacion agrupadas por tema, con su slug, una descripcion corta y su URL.",
    "inputSchema": {
      "properties": {},
      "type": "object"
    },
    "name": "listar_guias"
  }
];
export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);

/** Whether `name` belongs to the captured built surface. */
export function isKnownTool(name: string): boolean {
  return TOOL_NAMES.includes(name);
}

/* ------------------------------------------------------------------ */
/* Forwarding client                                                   */
/* ------------------------------------------------------------------ */

function errorResult(detail: string): ToolResult {
  return {
    content: [{ type: "text", text: `factdocs error: ${detail}` }],
    isError: true,
  };
}

function rpcErrorMessage(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
    return JSON.stringify(error);
  }
  return String(error);
}

/**
 * Read a JSON-RPC response body, tolerating SSE framing.
 * Returns the message whose id matches `expectedId` when
 * present, otherwise the last parseable message, otherwise
 * null when nothing in the body parses.
 */
export function parseRpcBody(
  text: string,
  expectedId?: number,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const candidates: Record<string, unknown>[] = [];
  const tryPush = (payload: string): void => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not a JSON payload; skip this candidate.
    }
  };
  if (trimmed.includes("data:")) {
    for (const line of trimmed.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice("data:".length).trim();
      if (payload !== "" && payload !== "[DONE]") tryPush(payload);
    }
  } else {
    tryPush(trimmed);
  }
  if (candidates.length === 0) return null;
  if (expectedId !== undefined) {
    const match = candidates.find((c) => c.id === expectedId);
    if (match !== undefined) return match;
  }
  return candidates[candidates.length - 1];
}

async function defaultFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<FetchResponseLike> {
  return fetch(url, init) as unknown as FetchResponseLike;
}

/**
 * A forwarding client holding a single upstream session,
 * opened lazily on first use and reused from then on
 * (for the process lifetime in the MCP server, or for a
 * single invocation in the CLI).
 */
export class FactdocsClient {
  private readonly deps: ForwardDeps;
  private sessionId: string | null = null;
  private ready = false;
  private sessionPromise: Promise<void> | null = null;
  private idCounter = 0;

  constructor(deps: ForwardDeps = {}) {
    this.deps = deps;
  }

  private fetchFn(): FetchFn {
    return this.deps.fetchFn ?? defaultFetch;
  }

  private endpointUrl(): string {
    if (this.deps.url && this.deps.url.trim() !== "") return this.deps.url.trim();
    const raw = (this.deps.env ?? process.env).FACTDOCS_MCP_URL;
    if (raw && raw.trim() !== "") return raw.trim();
    return DEFAULT_ENDPOINT_URL;
  }

  private timeoutMs(): number {
    if (typeof this.deps.timeoutMs === "number" && this.deps.timeoutMs > 0) {
      return this.deps.timeoutMs;
    }
    return DEFAULT_TIMEOUT_MS;
  }

  private nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  private async post(
    body: unknown,
    withSession: boolean,
  ): Promise<FetchResponseLike> {
    // The registry record declares NO headers on the upstream
    // remote: no Authorization header is ever sent.
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (withSession && this.sessionId !== null) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      return await this.fetchFn()(this.endpointUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.ready) return;
    if (this.sessionPromise === null) {
      this.sessionPromise = (async () => {
        const initId = this.nextId();
        const initRes = await this.post(
          {
            jsonrpc: "2.0",
            id: initId,
            method: "initialize",
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "factdocs", version: VERSION },
            },
          },
          false,
        );
        const sessionId = initRes.headers.get("mcp-session-id");
        if (sessionId) this.sessionId = sessionId;
        const initText = await initRes.text();
        const initParsed = parseRpcBody(initText, initId);
        if (initParsed !== null && initParsed.error) {
          throw new Error(rpcErrorMessage(initParsed.error));
        }
        if (initRes.status < 200 || initRes.status >= 300) {
          throw new Error(`HTTP ${initRes.status}`);
        }
        if (initParsed === null && initText.trim() !== "") {
          throw new Error("malformed response");
        }
        const initializedRes = await this.post(
          { jsonrpc: "2.0", method: "notifications/initialized" },
          true,
        );
        try {
          await initializedRes.text();
        } catch {
          // Nothing needed from the notification response body.
        }
        this.ready = true;
      })();
    }
    try {
      await this.sessionPromise;
    } catch (err) {
      this.sessionPromise = null;
      this.sessionId = null;
      throw err;
    }
  }

  /** Forward one tool call; upstream failures come back as isError results. */
  async callTool(name: string, args: ToolArgs): Promise<ToolResult> {
    try {
      await this.ensureSession();
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }

    const callId = this.nextId();
    let callRes: FetchResponseLike;
    try {
      callRes = await this.post(
        {
          jsonrpc: "2.0",
          id: callId,
          method: "tools/call",
          params: { name, arguments: args ?? {} },
        },
        true,
      );
    } catch (err) {
      return errorResult(
        `request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const parsed = parseRpcBody(await callRes.text(), callId);
    if (parsed !== null && parsed.error) {
      return errorResult(rpcErrorMessage(parsed.error));
    }
    if (callRes.status < 200 || callRes.status >= 300) {
      return errorResult(`HTTP ${callRes.status}`);
    }
    if (parsed === null) return errorResult("malformed response");
    const result = parsed.result as ToolResult | undefined;
    if (result === undefined || result === null || typeof result !== "object") {
      return errorResult("malformed response");
    }
    // Hand the upstream result back exactly as received.
    return result;
  }
}

/** Build a forwarding client; tests inject a fake fetch and env through deps. */
export function createClient(deps: ForwardDeps = {}): FactdocsClient {
  return new FactdocsClient(deps);
}

/** One-shot helper: a fresh client for a single call (the CLI path). */
export async function callTool(
  name: string,
  args: ToolArgs,
  deps: ForwardDeps = {},
): Promise<ToolResult> {
  return new FactdocsClient(deps).callTool(name, args);
}
