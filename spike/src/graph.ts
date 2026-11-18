import { createHmac } from "node:crypto";
import type { Config } from "./env.js";

/**
 * Cliente mínimo da Graph API da Meta.
 * - Nunca registra o token em log (nem URLs, que carregam o token).
 * - Remove automaticamente campos que não existem nesta versão da API e anota quais foram.
 * - Diminui o tamanho da página quando a Meta pede "reduza a quantidade de dados".
 * - Avisa quando o uso da API passa de 75%.
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

  /** Mensagem amigável, sem token, para mostrar ao usuário. */
  describe(): string {
    const parts = [`[${this.code ?? "?"}${this.subcode ? `/${this.subcode}` : ""}] ${this.message}`];
    if (this.userTitle || this.userMessage) parts.push(`→ ${[this.userTitle, this.userMessage].filter(Boolean).join(": ")}`);
    if (this.fbtraceId) parts.push(`(fbtrace_id ${this.fbtraceId})`);
    return parts.join(" ");
  }
}

type Params = Record<string, string | number | boolean | object | undefined>;

export interface Paged<T> {
  data: T[];
  paging?: { next?: string; cursors?: { after?: string } };
}

export class Graph {
  /** Campos removidos por não existirem nesta versão, por tipo de nó. Vira achado da Fase 0. */
  readonly strippedFields = new Map<string, Set<string>>();
  requestCount = 0;

  constructor(private readonly cfg: Config & { accessToken: string }) {}

  get version() {
    return this.cfg.apiVersion;
  }

  private authParams(): Record<string, string> {
    const proof = createHmac("sha256", this.cfg.appSecret).update(this.cfg.accessToken).digest("hex");
    return { access_token: this.cfg.accessToken, appsecret_proof: proof };
  }

  private buildUrl(path: string, params: Params = {}): string {
    const url = new URL(`https://graph.facebook.com/${this.cfg.apiVersion}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries({ ...params, ...this.authParams() })) {
      if (v === undefined) continue;
      url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    return url.toString();
  }

  /** Códigos de limite de uso da Meta. Nesses casos, espera e tenta de novo. */
  private static RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80003, 80004, 80014]);
  private lastRegainMinutes = 0;

  private async raw(url: string, init?: RequestInit): Promise<any> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.rawOnce(url, init);
      } catch (e) {
        if (!(e instanceof GraphError) || !Graph.RATE_LIMIT_CODES.has(e.code ?? -1) || attempt > 8) throw e;
        const waitMin = Math.min(Math.max(this.lastRegainMinutes, attempt), 15);
        console.warn(`⏳ A Meta pediu uma pausa (limite de chamadas, código ${e.code}). Esperando ${waitMin} min e continuando…`);
        await new Promise((r) => setTimeout(r, waitMin * 60_000));
      }
    }
  }

  private async rawOnce(url: string, init?: RequestInit): Promise<any> {
    this.requestCount++;
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (e) {
      throw new GraphError(`Falha de rede ao falar com a Meta: ${(e as Error).message}`, 0);
    }
    this.watchUsage(res.headers);
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || body?.error) {
      const err = body?.error ?? {};
      throw new GraphError(
        err.message ?? `HTTP ${res.status}`,
        res.status,
        err.code,
        err.error_subcode,
        err.type,
        err.error_user_title,
        err.error_user_msg,
        err.fbtrace_id,
      );
    }
    return body;
  }

  private watchUsage(headers: Headers) {
    for (const name of ["x-business-use-case-usage", "x-ad-account-usage", "x-app-usage"]) {
      const value = headers.get(name);
      if (!value) continue;
      const regain = /"estimated_time_to_regain_access"\s*:\s*(\d+)/.exec(value);
      if (regain) this.lastRegainMinutes = Math.max(this.lastRegainMinutes, Number(regain[1]));
      const pct = maxPercent(value);
      if (pct >= 75) console.warn(`⚠  Uso da API em ${pct}% (${name}). Indo mais devagar…`);
    }
  }

  /**
   * GET com remoção automática de campos inexistentes.
   * `fields` aceita a sintaxe da Graph API, inclusive aninhada: "id,name,creative{id,body}".
   */
  async get<T = any>(path: string, params: Params = {}, nodeLabel = path): Promise<T> {
    let current = { ...params };
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        return await this.raw(this.buildUrl(path, current));
      } catch (e) {
        const field = e instanceof GraphError ? nonexistentField(e) : undefined;
        if (!field || typeof current.fields !== "string") throw e;
        const next = removeField(current.fields, field);
        if (next === current.fields) throw e;
        this.noteStripped(nodeLabel, field);
        current = { ...current, fields: next };
      }
    }
    throw new Error("Muitos campos inexistentes seguidos — verifique a lista de campos.");
  }

  /** Busca todas as páginas de um edge (ex.: act_123/campaigns). */
  async getAll<T = any>(path: string, params: Params = {}, nodeLabel = path): Promise<T[]> {
    let limit = Number(params.limit ?? 100);
    const out: T[] = [];
    let after: string | undefined;
    for (;;) {
      let page: Paged<T>;
      try {
        page = await this.get<Paged<T>>(path, { ...params, limit, after }, nodeLabel);
      } catch (e) {
        if (e instanceof GraphError && isTooMuchData(e) && limit > 5) {
          limit = Math.max(5, Math.floor(limit / 2));
          console.warn(`⚠  A Meta pediu menos dados por página. Tentando com ${limit} por vez…`);
          continue;
        }
        throw e;
      }
      out.push(...page.data);
      after = page.paging?.cursors?.after;
      if (!page.paging?.next || !after) return out;
    }
  }

  async post<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...body, ...this.authParams() })) {
      if (v === undefined) continue;
      form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    const url = `https://graph.facebook.com/${this.cfg.apiVersion}/${path.replace(/^\//, "")}`;
    return this.raw(url, { method: "POST", body: form });
  }

  private noteStripped(node: string, field: string) {
    if (!this.strippedFields.has(node)) this.strippedFields.set(node, new Set());
    this.strippedFields.get(node)!.add(field);
  }
}

/** Chamadas que não precisam de token de usuário (troca de token, debug). */
export async function graphPublic(apiVersion: string, path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || body?.error) {
    const err = body?.error ?? {};
    throw new GraphError(err.message ?? `HTTP ${res.status}`, res.status, err.code, err.error_subcode, err.type);
  }
  return body;
}

function nonexistentField(e: GraphError): string | undefined {
  // Ex.: "(#100) Tried accessing nonexisting field (advantage_state_info) on node type (Campaign)"
  const m = /nonexisting field \(([\w.]+)\)/i.exec(e.message);
  return m?.[1];
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

function maxPercent(headerValue: string): number {
  let max = 0;
  const walk = (v: unknown) => {
    if (typeof v === "number") return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      for (const [k, inner] of Object.entries(v)) {
        if (typeof inner === "number" && /call_count|total_cputime|total_time|acc_id_util_pct/.test(k)) max = Math.max(max, inner);
        else walk(inner);
      }
    }
  };
  try {
    walk(JSON.parse(headerValue));
  } catch {
    /* cabeçalho em formato inesperado: ignora */
  }
  return max;
}
