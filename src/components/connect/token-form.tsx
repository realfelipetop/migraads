"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { pasteTokenAction, type ActionState } from "@/app/conectar/actions";
import { FormMessage } from "./form-message";

/** Modo avançado: token do Graph API Explorer ou de usuário do sistema. */
export function TokenForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(pasteTokenAction, {});
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="token">Token de acesso</Label>
        <Textarea
          id="token"
          name="token"
          rows={3}
          autoComplete="off"
          spellCheck={false}
          placeholder="EAA…"
          className="font-mono text-xs"
          required
        />
        <p className="text-xs text-muted-foreground">
          Gere no Graph API Explorer escolhendo o seu app e as permissões ads_management, ads_read,
          business_management, pages_show_list e pages_read_engagement. Ele é trocado por um de ~60 dias e fica
          criptografado neste computador.
        </p>
      </div>
      <FormMessage ok={state.ok}>{state.message}</FormMessage>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Conferindo…" : "Usar este token"}
      </Button>
    </form>
  );
}
