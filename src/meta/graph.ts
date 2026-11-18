import { createHmac } from "node:crypto";
import { META_API_VERSION } from "@/config/brand";

/**
 * Cliente da Graph API da Meta (validado na Fase 0).
 * - Nunca registra o token em log (nem URLs, que carregam o token).
 * - Remove sozinho campos que não existem nesta versão da API e anota quais foram.
 * - Diminui o tamanho da página quando a Meta pede "reduza a quantidade de dados".
 * - Espera e tenta de novo quando bate no limite de chamadas.
 */

export class GraphError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
    public readonly subcode?: number,
    public readonly type?: string,
    public readonly userTitle?: string,
    public readonly userMessage?: string,
    public readonly fbtraceId?: string,
  ) {
    super(message);
    this.name = "GraphError";
  }

  /** Resumo técnico, sem token, para logs e relatórios. */
  describe(): string {
    const parts = [`[${this.code ?? "?"}${this.subcode ? `/${this.subcode}` : ""}] ${this.message}`];
    if (this.userTitle || this.userMessage) parts.push(`→ ${[this.userTitle, this.userMessage].filter(Boolean).join(": ")}`);
    if (this.fbtraceId) parts.push(`(fbtrace_id ${this.fbtraceId})`);
    return parts.join(" ");
  }
}

type ParamValue = string | number | boolean | object | undefined;
export type Params = Record<string, ParamValue>;

export interface Paged<T> {
  data: T[];
  paging?: { next?: string; cursors?: { after?: string } };
}

export interface GraphOptions {
  accessToken: string;
  appSecret?: string;
  apiVersion?: string;
  /** Chamado quando o cliente vai esperar por limite de chamadas (para mostrar na tela). */
  onWait?: (minutes: number, code: number) => void;
  /** Para testes: substitui o fetch global. */
  fetchImpl?: typeof fetch;
  /** Para testes: substitui a espera real. */
  sleep?: (ms: number) => Promise<void>;
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80003, 80004, 80014]);

export class Graph {
  readonly strippedFields = new Map<string, Set<string>>();
  requestCount = 0;
  readonly version: string;
  private lastRegainMinutes = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: GraphOptions) {
    this.version = opts.apiVersion ?? META_API_VERSION;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private authParams(): Record<string, string> {
    const p: Record<string, string> = { access_token: this.opts.accessToken };
    if (this.opts.appSecret) {
      p.appsecret_proof = createHmac("sha256", this.opts.appSecret).update(this.opts.accessToken).digest("hex");
    }
    return p;
  }

  private url(path: string, params: Params = {}): string {
    const url = new URL(`https://graph.facebook.com/${this.version}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries({ ...params, ...this.authParams() })) {
      if (v === undefined) continue;
      url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    return url.toString();
  }

  private async raw(url: string, init?: RequestInit): Promise<unknown> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.rawOnce(url, init);
      } catch (e) {
        if (!(e instanceof GraphError) || !RATE_LIMIT_CODES.has(e.code ?? -1) || attempt > 8) throw e;
        const minutes = Math.min(Math.max(this.lastRegainMinutes, attempt), 15);
        this.opts.onWait?.(minutes, e.code!);
        await this.sleep(minutes * 60_000);
      }
    }
  }

  private async rawOnce(url: string, init?: RequestInit): Promise<unknown> {
    this.requestCount++;
    let res: Response;
    try {
      res = await this.fetchImpl(url, init);
    } catch (e) {
      throw new GraphError(`Falha de rede ao falar com a Meta: ${(e as Error).message}`, 0);
    }
    this.watchUsage(res.headers);
    const body = (await res.json().catch(() => ({}))) as { error?: Record<string, unknown> };
    if (!res.ok || body?.error) throw toGraphError(res.status, body?.error);
    return body;
  }

  private watchUsage(headers: Headers) {
    for (const name of ["x-business-use-case-usage", "x-ad-account-usage", "x-app-usage"]) {
      const value = headers.get(name);
      const regain = value && /"estimated_time_to_regain_access"\s*:\s*(\d+)/.exec(value);
      if (regain) this.lastRegainMinutes = Math.max(this.lastRegainMinutes, Number(regain[1]));
    }
  }

  /** GET com remoção automática de campos inexistentes. Aceita campos aninhados: "id,creative{id,body}". */
  async get<T = unknown>(path: string, params: Params = {}, nodeLabel = path): Promise<T> {
    let current = { ...params };
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        return (await this.raw(this.url(path, current))) as T;
      } catch (e) {
        const field = e instanceof GraphError ? nonexistentField(e) : undefined;
        if (!field || typeof current.fields !== "string") throw e;
        const next = removeField(current.fields, field);
        if (next === current.fields) throw e;
        if (!this.strippedFields.has(nodeLabel)) this.strippedFields.set(nodeLabel, new Set());
        this.strippedFields.get(nodeLabel)!.add(field);
        current = { ...current, fields: next };
      }
    }
    throw new Error("Muitos campos inexistentes seguidos — verifique a lista de campos.");
  }

  /**
   * Busca todas as páginas de um edge (ex.: act_123/campaigns).
   * `max` corta a busca (contas grandes podem ter milhares de anúncios); `truncated` avisa se cortou.
   */
  async getAll<T = unknown>(path: string, params: Params = {}, nodeLabel = path, max = Infinity): Promise<T[] & { truncated?: boolean }> {
    let limit = Number(params.limit ?? 100);
    const out: T[] & { truncated?: boolean } = [];
    let after: string | undefined;
    for (;;) {
      let page: Paged<T>;
      try {
        page = await this.get<Paged<T>>(path, { ...params, limit, after }, nodeLabel);
      } catch (e) {
        if (e instanceof GraphError && isTooMuchData(e) && limit > 5) {
          limit = Math.max(5, Math.floor(limit / 2));
          continue;
        }
        throw e;
      }
      out.push(...page.data);
      after = page.paging?.cursors?.after;
      if (!page.paging?.next || !after) return out;
      if (out.length >= max) {
        out.length = max;
        out.truncated = true;
        return out;
      }
    }
  }

  async post<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...body, ...this.authParams() })) {
      if (v === undefined) continue;
      form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    const url = `https://graph.facebook.com/${this.version}/${path.replace(/^\//, "")}`;
    return (await this.raw(url, { method: "POST", body: form })) as T;
  }
}

/** Chamadas sem token de usuário (troca de código/token, debug_token, validar app). */
export async function graphPublic<T = unknown>(
  path: string,
  params: Record<string, string>,
  opts: { apiVersion?: string; fetchImpl?: typeof fetch } = {},
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${opts.apiVersion ?? META_API_VERSION}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url);
  } catch (e) {
    throw new GraphError(`Falha de rede ao falar com a Meta: ${(e as Error).message}`, 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: Record<string, unknown> };
  if (!res.ok || body?.error) throw toGraphError(res.status, body?.error);
  return body as T;
}

function toGraphError(status: number, err: Record<string, unknown> = {}): GraphError {
  return new GraphError(
    (err.message as string) ?? `HTTP ${status}`,
    status,
    err.code as number | undefined,
    err.error_subcode as number | undefined,
    err.type as string | undefined,
    err.error_user_title as string | undefined,
    err.error_user_msg as string | undefined,
    err.fbtrace_id as string | undefined,
  );
}

function nonexistentField(e: GraphError): string | undefined {
  // Ex.: "(#100) Tried accessing nonexisting field (advantage_state_info) on node type (Campaign)"
  return /nonexisting field \(([\w.]+)\)/i.exec(e.message)?.[1];
}

function isTooMuchData(e: GraphError): boolean {
  return /reduce the amount of data/i.test(e.message) || (e.code === 1 && e.subcode === 99);
}

/** Remove `name` de uma lista de campos (inclusive aninhada), junto com seus sub-campos. */
export function removeField(fields: string, name: string): string {
  const re = new RegExp(`(^|[,{])${name}(\\{[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\})?(?=[,}]|$)`, "g");
  return fields
    .replace(re, "$1")
    .replace(/,{2,}/g, ",")
    .replace(/\{,/g, "{")
    .replace(/,\}/g, "}")
    .replace(/^,|,$/g, "");
}
