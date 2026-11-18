"use client";

import { useState, useTransition } from "react";
import { Loader2, LogOut, RefreshCw, Replace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { disconnectAction, refreshAccountsAction, resetAppAction } from "@/app/conectar/actions";
import { FormMessage } from "./form-message";

export function RefreshAccountsButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: boolean; message?: string }>({});
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => start(async () => setMsg(await refreshAccountsAction()))}
      >
        {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {pending ? "Atualizando…" : "Atualizar contas"}
      </Button>
      {msg.message && !msg.ok && <FormMessage>{msg.message}</FormMessage>}
    </div>
  );
}

export function DisconnectButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (confirm("Desconectar da Meta? O token salvo neste computador será apagado.")) start(() => disconnectAction());
      }}
    >
      <LogOut /> Desconectar
    </Button>
  );
}

export function ResetAppButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (confirm("Trocar de app? O ID, a chave secreta e a conexão salvos serão apagados deste computador.")) {
          start(() => resetAppAction());
        }
      }}
    >
      <Replace /> Trocar de app
    </Button>
  );
}
