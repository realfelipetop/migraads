"use client";

import { useMemo, useState } from "react";
import { Building2, ChevronRight, Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AccountSummary, AccountTree } from "@/meta/accounts";

const PERSONAL = "__personal__";

/**
 * Seletor de contas no formato do Gerenciador de Anúncios:
 * portfólios à esquerda ("A tua conta" + BMs), contas à direita, busca no topo.
 * Na Fase 3 ele vira o seletor de origem e de destino (via `onSelect`).
 */
export function AccountPicker({
  tree,
  value,
  onSelect,
}: {
  tree: AccountTree;
  value?: string;
  onSelect?: (account: AccountSummary) => void;
}) {
  const [group, setGroup] = useState<string>(tree.businesses[0]?.id ?? PERSONAL);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | undefined>(value);

  const allAccounts = useMemo(() => {
    const map = new Map<string, AccountSummary & { via: string }>();
    tree.personal.forEach((a) => map.set(a.id, { ...a, via: "A tua conta" }));
    tree.businesses.forEach((b) => [...b.owned, ...b.client].forEach((a) => !map.has(a.id) && map.set(a.id, { ...a, via: b.name })));
    return [...map.values()];
  }, [tree]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const results = searching
    ? allAccounts.filter((a) => a.name.toLowerCase().includes(q) || a.accountId.includes(q))
    : [];

  const bm = tree.businesses.find((b) => b.id === group);
  const sections: { title: string; accounts: AccountSummary[] }[] = searching
    ? [{ title: `${results.length} resultado(s)`, accounts: results }]
    : group === PERSONAL
      ? [{ title: `${tree.personal.length} contas de anúncios`, accounts: tree.personal }]
      : bm
        ? [
            { title: `${bm.owned.length} contas de anúncios`, accounts: bm.owned },
            ...(bm.client.length ? [{ title: `Compartilhadas com esta BM (${bm.client.length})`, accounts: bm.client }] : []),
          ]
        : [];

  const choose = (a: AccountSummary) => {
    setSelected(a.id);
    onSelect?.(a);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar uma conta de anúncios (nome ou ID)"
            className="pl-8"
            aria-label="Pesquisar conta de anúncios"
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,17rem)_1fr]">
        <nav
          aria-label="Portfólios de negócios"
          className={cn(
            "max-h-[28rem] overflow-y-auto border-b border-border bg-primary-soft/40 p-2 lg:border-r lg:border-b-0",
            searching && "opacity-50",
          )}
        >
          <p className="px-2 pt-1 pb-2 text-xs font-semibold text-muted-foreground">Portfólios de negócios</p>
          {tree.businesses.map((b) => (
            <GroupButton
              key={b.id}
              active={!searching && group === b.id}
              onClick={() => {
                setQuery("");
                setGroup(b.id);
              }}
              icon={<Building2 className="size-4" />}
              title={b.name}
              subtitle={`${b.owned.length} contas de anúncios${b.client.length ? ` · ${b.client.length} compartilhadas` : ""}`}
            />
          ))}
          <p className="px-2 pt-3 pb-2 text-xs font-semibold text-muted-foreground">A tua conta</p>
          <GroupButton
            active={!searching && group === PERSONAL}
            onClick={() => {
              setQuery("");
              setGroup(PERSONAL);
            }}
            icon={<User className="size-4" />}
            title={tree.me.name}
            subtitle={`${tree.personal.length} contas de anúncios`}
          />
        </nav>

        <div className="max-h-[28rem] overflow-y-auto p-3" role="radiogroup" aria-label="Contas de anúncios">
          {!searching && bm && <p className="mb-2 px-1 text-sm font-semibold">{bm.name}</p>}
          {sections.map((s) => (
            <section key={s.title} className="mb-3">
              <p className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">{s.title}</p>
              {s.accounts.length === 0 && <p className="px-1 text-sm text-muted-foreground">Nenhuma conta aqui.</p>}
              <ul className="space-y-1">
                {s.accounts.map((a) => (
                  <li key={`${s.title}-${a.id}`}>
                    <AccountRow
                      account={a}
                      selected={selected === a.id}
                      onClick={() => choose(a)}
                      showOwner={searching || a.owner?.id !== group}
                      via={searching ? allAccounts.find((x) => x.id === a.id)?.via : undefined}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function GroupButton(props: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-current={props.active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
        props.active ? "bg-card shadow-sm ring-1 ring-primary/40" : "hover:bg-card/70",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-card text-muted-foreground ring-1 ring-border">
        {props.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{props.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{props.subtitle}</span>
      </span>
      {props.active && <ChevronRight className="size-4 text-primary" />}
    </button>
  );
}

function AccountRow({
  account: a,
  selected,
  onClick,
  showOwner,
  via,
}: {
  account: AccountSummary;
  selected: boolean;
  onClick: () => void;
  /** Mostrar a BM dona só quando ela não é o portfólio aberto (como no Gerenciador). */
  showOwner: boolean;
  via?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
        selected ? "bg-primary-soft ring-1 ring-primary/40" : "hover:bg-muted",
      )}
    >
      <span
        className={cn(
          "mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-primary" : "border-muted-foreground/40",
        )}
        aria-hidden
      >
        {selected && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{a.name}</span>
        <span className="block text-xs text-muted-foreground">
          Identificação da conta de anúncios: {a.accountId}
        </span>
        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className={cn("inline-flex items-center gap-1.5", a.active ? "text-success" : "text-destructive")}>
            <span className={cn("size-1.5 rounded-full", a.active ? "bg-success" : "bg-destructive")} />
            {a.statusLabel}
          </span>
          <span className="text-muted-foreground">
            {a.currency} · {a.timezone}
          </span>
          {showOwner && a.owner && (
            <span className="rounded bg-muted px-1.5 text-muted-foreground">Dona: {a.owner.name}</span>
          )}
          {via && <span className="text-muted-foreground">em {via}</span>}
        </span>
      </span>
    </button>
  );
}
