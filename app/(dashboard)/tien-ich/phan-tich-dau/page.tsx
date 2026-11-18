import OilAnalysisPage from "@/components/tien-ich/OilAnalysisPage";
import { UtilityAccessGate } from "@/components/tien-ich/UtilityAccessGate";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <UtilityAccessGate permissionId="utility-oil-analysis-view" label="Kết quả phân tích dầu">
      <OilAnalysisPage />
    </UtilityAccessGate>
  );
}
