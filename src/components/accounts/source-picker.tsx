"use client";

import { useRouter } from "next/navigation";
import { AccountPicker } from "./account-picker";
import type { AccountTree } from "@/meta/accounts";

/** Seletor de origem: escolher a conta abre o Explorador dela. */
export function SourcePicker({ tree }: { tree: AccountTree }) {
  const router = useRouter();
  return <AccountPicker tree={tree} onSelect={(a) => router.push(`/migrar/${a.id}`)} />;
}
