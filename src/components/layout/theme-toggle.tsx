"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const ORDER = ["system", "light", "dark"] as const;
const LABEL = { system: "Tema: automático", light: "Tema: claro", dark: "Tema: escuro" } as const;
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

/** Alterna entre automático (segue o sistema) → claro → escuro. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- padrão do next-themes para evitar divergência na hidratação
  useEffect(() => setMounted(true), []);

  const current = (mounted ? theme : "system") as (typeof ORDER)[number];
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = ICON[current] ?? Monitor;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`${LABEL[current]}. Clique para mudar.`}
      title={LABEL[current]}
    >
      <Icon />
    </Button>
  );
}
