"use client";

import { useActionState, useTransition } from "react";
import { Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/connect/form-message";
import { removeUtmifyAction, saveUtmifyAction, type UtmifyState } from "@/app/configuracoes/actions";

export function UtmifyForm({ connectedDashboard }: { connectedDashboard?: string }) {
  const [state, action, pending] = useActionState<UtmifyState, FormData>(saveUtmifyAction, {});
  const [removing, startRemove] = useTransition();
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="utm-key">Chave da API oficial</Label>
        <Input
          id="utm-key"
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder={connectedDashboard ? "Deixe em branco para manter a atual" : "Utmify → Avançado → API Oficial → Novo Token"}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="utm-dash">ID do dashboard</Label>
        <Input id="utm-dash" name="dashboardId" defaultValue={connectedDashboard} autoComplete="off" placeholder="Ex.: 658d716f7e39b6ea213da344" />
      </div>
      <FormMessage ok={state.ok}>{state.message}</FormMessage>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Testando…" : connectedDashboard ? "Atualizar" : "Conectar Utmify"}
        </Button>
        {connectedDashboard && (
          <Button type="button" variant="ghost" size="sm" disabled={removing} onClick={() => startRemove(() => removeUtmifyAction())}>
            <Unplug /> Desconectar
          </Button>
        )}
      </div>
    </form>
  );
}
