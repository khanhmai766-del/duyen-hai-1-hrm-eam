import {requireSession} from "@/modules/ctktkt/lib/auth/server";
import {exportReport} from "@/modules/ctktkt/lib/report-exports/water";
export async function GET(request: Request) {
 const session = await requireSession(); if (!session.ok) return session.response;
 return exportReport(request);
}
