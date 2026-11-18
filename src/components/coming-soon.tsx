import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Tela vazia para funcionalidades das próximas fases do roadmap. */
export function ComingSoon({
  icon: Icon,
  title,
  description,
  phase,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  phase?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-6" />
      </div>
      {phase && (
        <Badge variant="secondary" className="mb-3">
          Chega na {phase}
        </Badge>
      )}
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
