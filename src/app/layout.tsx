import type { Metadata } from "next";
import { Suspense } from "react";
import "@fontsource-variable/inter";
import { ConnectionBanner } from "@/components/layout/connection-status";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Footer } from "@/components/layout/footer";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  title: { default: BRAND.appName, template: `%s · ${BRAND.appName}` },
  description: BRAND.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeProvider>
          <QueryProvider>
          <TooltipProvider>
            <div className="flex min-h-dvh">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <Topbar />
                <Suspense>
                  <ConnectionBanner />
                </Suspense>
                <MobileNav />
                <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
                <Footer />
              </div>
            </div>
          </TooltipProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
