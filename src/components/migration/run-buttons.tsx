"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, Loader2, Pause, Play, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/connect/form-message";
import { backToDestinationAction, pauseMigrationAction, startMigrationAction } from "@/app/migracoes/actions";

export function StartButton({ id, blocked, label = "Migrar agora", resume }: { id: string; blocked?: boolean; label?: string; resume?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        size="lg"
        disabled={blocked || pending}
        onClick={() =>
          start(async () => {
            const r = await startMigrationAction(id);
            if (r.message) setError(r.message);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : resume ? <Play /> : <Rocket />}
        {label}
      </Button>
      <FormMessage>{error}</FormMessage>
    </div>
  );
}

export function BackButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" disabled={pending} onClick={() => start(() => backToDestinationAction(id))}>
      <ArrowLeft /> Trocar destino
    </Button>
  );
}

export function PauseButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [asked, setAsked] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={pending || asked}
      onClick={() =>
        start(async () => {
          await pauseMigrationAction(id);
          setAsked(true);
        })
      }
    >
      <Pause /> {asked ? "Pausando após o item atual…" : "Pausar"}
    </Button>
  );
}
