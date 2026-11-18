"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, CircleDashed, Clock, Hand, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PauseButton, StartButton } from "./run-buttons";

export interface ExecItem {
  id: string;
  level: string;
  name: string | null;
  status: string;
  destId: string | null;
  error: string | null;
  copyIndex?: number;
}

const LEVEL_LABEL: Record<string, string> = { campaign: "Campanha", adset: "Conjunto", ad: "Anúncio" };
const ORDER: Record<string, number> = { campaign: 0, adset: 1, ad: 3 };
const FINAL = ["done", "done_with_issues", "failed"];

/** Tela de Execução: progresso em tempo real via SSE. */
export function ExecutionView({
  migrationId,
  initialStatus,
  initialMessage,
  initialItems,
}: {
  migrationId: string;
  initialStatus: string;
  initialMessage?: string;
  initialItems: ExecItem[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState(initialMessage);
  const [items, setItems] = useState<ExecItem[]>(initialItems);
  const [wait, setWait] = useState<number | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/migrations/${migrationId}/events`);
    es.onmessage = (ev) => {
      const e = JSON.parse(ev.data);
      if (e.type === "snapshot") {
        setStatus(e.status);
        setMessage(e.message);
        setItems(e.items);
      } else if (e.type === "item") {
        setWait(null);
        setItems((prev) => prev.map((i) => (i.id === e.id ? { ...i, ...e } : i)));
      } else if (e.type === "wait") {
        setWait(e.minutes);
      } else if (e.type === "status") {
        setStatus(e.status);
        setMessage(e.message);
        if (FINAL.includes(e.status) || e.status === "paused") router.refresh();
      }
    };
    return () => es.close();
  }, [migrationId, router]);

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => (a.copyIndex ?? 1) - (b.copyIndex ?? 1) || (ORDER[a.level] ?? 2) - (ORDER[b.level] ?? 2),
      ),
    [items],
  );
  const multi = items.some((i) => (i.copyIndex ?? 1) > 1);
  const finished = items.filter((i) => i.status !== "pending").length;
  const pct = items.length ? Math.round((finished / items.length) * 100) : 0;
  const current = status === "running" ? sorted.find((i) => i.status === "pending") : undefined;
  const canResume = status === "paused" || (FINAL.includes(status) && items.some((i) => i.status === "failed"));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-semibold">
            {status === "running" && <Loader2 className="size-4 animate-spin text-primary" />}
            {status === "running" ? "Migrando…" : status === "paused" ? "Pausada" : FINAL.includes(status) ? "Terminou" : status}
            <span className="font-normal text-muted-foreground">
              {finished} de {items.length} ({pct}%)
            </span>
          </p>
          <div className="flex gap-2">
            {status === "running" && <PauseButton id={migrationId} />}
            {canResume && (
              <StartButton id={migrationId} resume label={status === "paused" ? "Retomar" : "Tentar de novo os que falharam"} />
            )}
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        {current && (
          <p className="mt-2 text-sm text-muted-foreground">
            Agora: {LEVEL_LABEL[current.level] ?? current.level} “{current.name}”
          </p>
        )}
        {wait !== null && status === "running" && (
          <p className="mt-2 flex items-center gap-2 text-sm text-warning">
            <Clock className="size-4" /> A Meta pediu uma pausa (limite de chamadas). Continuando sozinho em ~{wait} min…
          </p>
        )}
        {message && status === "paused" && <p className="mt-2 text-sm text-warning">{message}</p>}
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-sm">
        {sorted.map((i) => (
          <li key={i.id} className="flex items-start gap-3 px-4 py-2.5">
            <StatusIcon status={i.status} running={status === "running" && i === current} />
            <div className="min-w-0 flex-1">
              <p className="truncate">
                {multi && <span className="mr-1.5 rounded bg-primary-soft px-1.5 text-xs font-medium text-primary">C{i.copyIndex ?? 1}</span>}
                <span className="text-muted-foreground">{LEVEL_LABEL[i.level] ?? i.level} · </span>
                {i.name}
              </p>
              {i.error && (
                <p className={cn("text-xs", i.status === "manual" ? "text-warning" : "text-destructive")}>{i.error}</p>
              )}
            </div>
            {i.destId && <code className="shrink-0 text-xs text-muted-foreground">{i.destId}</code>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusIcon({ status, running }: { status: string; running?: boolean }) {
  if (running) return <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />;
  if (status === "done") return <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />;
  if (status === "failed") return <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />;
  if (status === "manual") return <Hand className="mt-0.5 size-4 shrink-0 text-warning" />;
  return <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
}
