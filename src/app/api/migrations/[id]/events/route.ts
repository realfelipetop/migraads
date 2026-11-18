import { getItems, getMigration } from "@/meta/migrations";
import { subscribe, type ProgressEvent } from "@/migration/events";

/** Progresso em tempo real (Server-Sent Events) para a tela de Execução. */
export async function GET(request: Request, ctx: RouteContext<"/api/migrations/[id]/events">) {
  const { id } = await ctx.params;
  const m = getMigration(id);
  if (!m) return new Response("Migração não encontrada", { status: 404 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      // Estado atual primeiro (a tela pode ter aberto no meio da execução).
      send({ type: "snapshot", status: m.status, message: m.run?.message, items: getItems(id) });
      const unsubscribe = subscribe(id, (e: ProgressEvent) => send(e));
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 15_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
