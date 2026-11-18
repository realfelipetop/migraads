import { getSystemStatus } from "@/lib/system-status";

/** Usado pelo `npm start` e pelo CI para saber se o app subiu. */
export async function GET() {
  const status = await getSystemStatus();
  return Response.json(
    { ok: status.db.ok, app: "migra-ads", version: status.version, db: status.db },
    { status: status.db.ok ? 200 : 500 },
  );
}
