import GroundingLightningPage from "@/components/grounding-lightning/GroundingLightningPage";
import { isPositionCode } from "@/lib/position-catalog";
import { isGroundingMachine } from "@/lib/grounding-lightning";
import type { GroundingFilters } from "@/hooks/useGroundingLightning";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const initialFilters: Partial<GroundingFilters> = {};
  if (typeof params.positionCode === "string" && isPositionCode(params.positionCode)) initialFilters.positionCode = params.positionCode;
  if (isGroundingMachine(params.machine)) initialFilters.machine = params.machine;
  return <GroundingLightningPage key={JSON.stringify(initialFilters)} initialFilters={initialFilters} />;
}
