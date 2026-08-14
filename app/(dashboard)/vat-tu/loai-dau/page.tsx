import { Suspense } from "react";
import OilGroupingPage from "@/components/vat-tu/OilGroupingPage";
import { RbacProtectedRoute } from "@/components/shared/rbac-protected-route";

export const metadata = { title: "Tồn kho vật tư theo nhóm" };

// Suspense bắt buộc vì OilGroupingPage dùng useSearchParams (?loai=...).
export default function Page() {
  return (
    <RbacProtectedRoute permissionId="erp-material-manage" featureLabel="Vật tư theo ERP">
      <Suspense fallback={null}>
        <OilGroupingPage />
      </Suspense>
    </RbacProtectedRoute>
  );
}
