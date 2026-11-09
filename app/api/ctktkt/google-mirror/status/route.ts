import { ktktRoute } from "@/modules/ctktkt/server/ktkt-route";
import * as handlers from "@/modules/ctktkt/server/routes/google-mirror/status/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const { GET, POST, PUT, PATCH, DELETE } = ktktRoute("google-mirror/status", handlers);
