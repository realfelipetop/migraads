import { cn } from "@/lib/utils";

/**
 * Marca do Migra Ads (mesmo desenho de assets/icon.svg, simplificado para tamanhos pequenos).
 * Sem degradê de propósito: um <linearGradient> com id fixo quebra quando o logo aparece mais de
 * uma vez na página e uma das cópias está escondida (o navegador usa a definição escondida).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="64" height="64" rx="15" fill="#1D6FE0" />
      <rect x="10" y="18" width="18" height="28" rx="3.5" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2.5" />
      <rect x="36" y="18" width="18" height="28" rx="3.5" fill="#fff" />
      <rect x="39" y="21.5" width="12" height="9" rx="1.5" fill="#1D6FE0" />
      <circle cx="32" cy="32" r="8.5" fill="#fff" />
      <path d="M28.2 32h7.2M32.6 28.8 35.8 32l-3.2 3.2" fill="none" stroke="#1D6FE0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">Migra Ads</span>
    </span>
  );
}
