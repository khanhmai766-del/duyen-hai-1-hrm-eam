import { runCoalPhotoCleanup } from "@/modules/ctktkt/lib/coal-photo-cleanup";
export async function GET(request: Request) {
  return runCoalPhotoCleanup(request);
}
