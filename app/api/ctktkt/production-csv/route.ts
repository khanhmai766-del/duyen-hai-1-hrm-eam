import { ktktRoute } from "@/modules/ctktkt/server/ktkt-route";
import { POST as preview } from "@/modules/ctktkt/server/routes/production-csv/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const { POST } = ktktRoute("production-csv", { POST: preview });
