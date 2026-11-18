import { BRAND } from "@/config/brand";
import { InstagramIcon, YoutubeIcon } from "./social-icons";

export function Footer() {
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-border px-4 py-4 text-xs text-muted-foreground">
      <span>
        Feito por <strong className="font-semibold text-foreground">{BRAND.author}</strong>
      </span>
      <a
        href={BRAND.instagram}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 hover:text-primary"
      >
        <InstagramIcon className="size-3.5" />
        Instagram
      </a>
      <a
        href={BRAND.youtube}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 hover:text-primary"
      >
        <YoutubeIcon className="size-3.5" />
        YouTube
      </a>
      <span className="hidden sm:inline">·</span>
      <span>Open source · licença {BRAND.license} · sem ligação com a Meta</span>
    </footer>
  );
}
