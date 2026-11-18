"use client";

import { useState, useTransition } from "react";
import { DatabaseBackup, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { saveJobAction, backupNowAction, type JobInput } from "@/app/backups/actions";
import { cn } from "@/lib/utils";

const selectClass = "h-8 rounded-lg border border-input bg-card px-2 text-sm disabled:opacity-50";

/** Uma linha por conta: liga/desliga o backup automático e ajusta as opções. */
export function JobRow({
  account,
  name,
  meta,
  initial,
  lastRun,
  nextRun,
}: {
  account: string;
  name: string;
  meta: string;
  initial: JobInput;
  lastRun?: string | null;
  nextRun?: string | null;
}) {
  const [job, setJob] = useState<JobInput>(initial);
  const [saving, startSave] = useTransition();
  const [running, startRun] = useTransition();
  const [msg, setMsg] = useState<string>();

  const update = (patch: Partial<JobInput>) => {
    const next = { ...job, ...patch };
    setJob(next);
    startSave(async () => setMsg((await saveJobAction(account, next)).message));
  };

  return (
    <li className={cn("space-y-2 px-4 py-3", job.enabled && "bg-primary-soft/40")}>
      <div className="flex flex-wrap items-center gap-3">
        <Switch checked={job.enabled} onCheckedChange={(v) => update({ enabled: Boolean(v) })} aria-label={`Backup automático de ${name}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {meta}
            {lastRun && ` · último: ${new Date(lastRun).toLocaleString("pt-BR")}`}
            {job.enabled && nextRun && ` · próximo: ${new Date(nextRun).toLocaleString("pt-BR")}`}
          </p>
        </div>
        {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        <Button
          variant="outline"
          size="sm"
          disabled={running}
          onClick={() => startRun(async () => setMsg((await backupNowAction(account)).message))}
        >
          {running ? <Loader2 className="animate-spin" /> : <DatabaseBackup />}
          {running ? "Fazendo backup…" : "Fazer backup agora"}
        </Button>
      </div>
      {job.enabled && (
        <div className="flex flex-wrap items-center gap-2 pl-11 text-sm">
          <select className={selectClass} value={job.frequencyHours} onChange={(e) => update({ frequencyHours: Number(e.target.value) })} aria-label="Frequência">
            <option value={6}>A cada 6 h</option>
            <option value={12}>A cada 12 h</option>
            <option value={24}>A cada 24 h</option>
          </select>
          <select className={selectClass} value={job.scope} onChange={(e) => update({ scope: e.target.value as JobInput["scope"] })} aria-label="O que salvar">
            <option value="active">Só campanhas ativas</option>
            <option value="active_and_recent">Ativas + que gastaram em 30 dias</option>
          </select>
          <select className={selectClass} value={job.retention} onChange={(e) => update({ retention: Number(e.target.value) })} aria-label="Quantos guardar">
            {[3, 7, 14, 30].map((n) => (
              <option key={n} value={n}>
                Guardar os últimos {n}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" checked={job.includeMedia} onChange={(e) => update({ includeMedia: e.target.checked })} className="accent-primary" />
            Baixar imagens e vídeos (ocupa espaço)
          </label>
        </div>
      )}
      {msg && <p className="pl-11 text-sm text-destructive">{msg}</p>}
    </li>
  );
}
