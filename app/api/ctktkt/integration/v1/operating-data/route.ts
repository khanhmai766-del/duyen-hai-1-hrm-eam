import { ktktRoute } from "@/modules/ctktkt/server/ktkt-route";
import * as handlers from "@/modules/ctktkt/server/routes/integration/v1/operating-data/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const { GET, POST, PUT, PATCH, DELETE } = ktktRoute("integration/v1/operating-data", handlers);
