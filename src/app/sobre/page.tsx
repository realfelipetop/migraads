import type { Metadata } from "next";
import { Lock, Scale, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { LogoMark } from "@/components/layout/logo";
import { InstagramIcon, YoutubeIcon } from "@/components/layout/social-icons";
import { BRAND, META_API_VERSION } from "@/config/brand";
import pkg from "../../../package.json";

export const metadata: Metadata = { title: "Sobre" };

export default function SobrePage() {
  return (
    <>
      <PageHeader title="Sobre o Migra Ads" />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-5 py-2">
          <LogoMark className="size-16" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{BRAND.appName}</p>
            <p className="text-sm text-muted-foreground">{BRAND.tagline}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Versão {pkg.version} · Graph API {META_API_VERSION} · licença {BRAND.license}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Feito por {BRAND.author}</CardTitle>
          <CardDescription>
            Gestor de tráfego há 6 anos. Criei o Migra Ads para não perder mais horas recriando campanhas à mão quando
            uma conta cai. Ele é gratuito e de código aberto. Se te ajudou, me segue lá:
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <a href={BRAND.instagram} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
            <InstagramIcon /> Instagram {BRAND.handle}
          </a>
          <a href={BRAND.youtube} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
            <YoutubeIcon /> YouTube {BRAND.handle}
          </a>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: Lock,
            title: "Seus dados ficam com você",
            text: "Tudo roda no seu computador. O token da Meta fica criptografado na pasta data/. Não existe servidor do Migra Ads.",
          },
          {
            icon: ShieldCheck,
            title: "Seguro por padrão",
            text: "Tudo é criado pausado. Nada é publicado sem passar por uma tela de revisão.",
          },
          {
            icon: Scale,
            title: "Projeto independente",
            text: "Sem ligação com a Meta Platforms. Use dentro das Políticas de Publicidade da Meta. Detalhes em docs/termos-de-servico.md.",
          },
        ].map((c) => (
          <Card key={c.title} size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <c.icon className="size-4 text-primary" /> {c.title}
              </CardTitle>
              <CardDescription>{c.text}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </>
  );
}
