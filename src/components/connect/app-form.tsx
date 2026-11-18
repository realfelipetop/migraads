"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAppAction, type ActionState } from "@/app/conectar/actions";
import { FormMessage } from "./form-message";

/** ID + chave secreta do app da Meta. A chave nunca volta para o navegador depois de salva. */
export function AppForm({ currentAppId }: { currentAppId?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveAppAction, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="appId">ID do app</Label>
          <Input
            id="appId"
            name="appId"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ex.: 1234567890123456"
            defaultValue={currentAppId}
            required
          />
          <p className="text-xs text-muted-foreground">Configurações do app → Básico → “Identificação da app”.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="appSecret">Chave secreta do app</Label>
          <Input
            id="appSecret"
            name="appSecret"
            type="password"
            autoComplete="off"
            placeholder={currentAppId ? "Deixe em branco para manter a atual" : "32 letras e números"}
            required={!currentAppId}
          />
          <p className="text-xs text-muted-foreground">
            Clique em “Mostrar” ao lado de “Chave secreta da app”. <strong>Não</strong> é o “Token do cliente”.
          </p>
        </div>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Meu app usa “Login do Facebook para Empresas”</summary>
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="loginConfigId">ID da configuração (opcional)</Label>
          <Input id="loginConfigId" name="loginConfigId" inputMode="numeric" autoComplete="off" />
          <p className="text-xs text-muted-foreground">
            Só se o login pedir. Crie uma configuração com “Token de acesso do usuário” e as permissões listadas acima.
          </p>
        </div>
      </details>
      <FormMessage ok={state.ok}>{state.message}</FormMessage>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Conferindo com a Meta…" : "Salvar e conferir"}
      </Button>
      <p className="text-xs text-muted-foreground">
        A chave fica criptografada só neste computador. Nunca mande ela em chat ou e-mail.
      </p>
    </form>
  );
}
