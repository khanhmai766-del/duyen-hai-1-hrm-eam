import { readOperatingData } from "@/modules/ctktkt/lib/operating-data-api";
export async function GET(request: Request) {
  return readOperatingData(request);
}
