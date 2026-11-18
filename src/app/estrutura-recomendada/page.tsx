import type { Metadata } from "next";
import { Building2, CircleCheck, Lock, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Estrutura recomendada" };

const MOTHER_ASSETS = ["Pixel / conjunto de dados", "Página do Facebook", "Instagram", "Domínio verificado", "Catálogo"];
const AD_BMS = [
  { name: "BM de anúncios 1", accounts: ["Conta 01", "Conta 02"] },
  { name: "BM de anúncios 2", accounts: ["Conta 03", "Conta 04"] },
];

const STEPS = [
  "Escolha (ou crie) uma BM que não vai rodar anúncios: ela vira a BM mãe.",
  "Deixe o pixel, a página, o Instagram, o domínio e o catálogo como ativos dessa BM.",
  "Nas configurações da BM mãe, compartilhe esses ativos com as BMs de anúncio como parceiras.",
  "Em cada BM de anúncio, atribua o pixel e a página às contas de anúncio.",
  "Rode as campanhas só nas BMs e contas de anúncio, nunca na BM mãe.",
];

export default function EstruturaPage() {
  return (
    <>
      <PageHeader
        title="Estrutura recomendada: BM mãe"
        description="Uma recomendação, não uma regra. Com ela, quando uma conta ou BM de anúncio cair, os ativos continuam seguros e a migração fica no caso mais fácil."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Como fica</CardTitle>
          <CardDescription>A BM mãe guarda os ativos e não roda anúncio. As BMs de anúncio recebem tudo compartilhado.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3">
            <div className="w-full max-w-md rounded-xl border-2 border-primary bg-primary-soft p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold text-primary">
                <ShieldCheck className="size-4" /> BM mãe
                <Badge variant="outline" className="ml-auto">
                  não roda anúncios
                </Badge>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {MOTHER_ASSETS.map((a) => (
                  <li key={a} className="rounded-md bg-card px-2 py-1 text-xs ring-1 ring-border">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-xs text-muted-foreground" aria-hidden>
              ↓ compartilha como parceira ↓
            </div>
            <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
              {AD_BMS.map((bm) => (
                <div key={bm.name} className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Building2 className="size-4 text-muted-foreground" /> {bm.name}
                  </div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {bm.accounts.map((acc) => (
                      <li key={acc}>▣ {acc}: usa o pixel e a página da BM mãe</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por que vale a pena</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {[
                "Se uma conta ou BM de anúncio cair, o pixel continua com todo o histórico de aprendizado.",
                "A nova conta já enxerga página e pixel: o Migra Ads reaproveita os posts e mantém a prova social.",
                "Menos risco de perder a página ou o domínio junto com uma BM restrita.",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                  {t}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Como montar</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {STEPS.map((t, i) => (
                <li key={t} className="flex gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        Proteja a BM mãe: autenticação em dois fatores para todos os admins, poucos administradores e nenhuma
        campanha rodando nela.
      </p>
    </>
  );
}
