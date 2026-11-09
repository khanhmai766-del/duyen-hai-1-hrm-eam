import { ktktRoute } from "@/modules/ctktkt/server/ktkt-route";
import * as handlers from "@/modules/ctktkt/server/routes/bcsx-operation-import/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const { GET, POST, PUT, PATCH, DELETE } = ktktRoute("bcsx-operation-import", handlers);
