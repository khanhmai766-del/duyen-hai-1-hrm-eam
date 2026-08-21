import ChemicalInventoryPage from "@/components/chemical-inventory/ChemicalInventoryPage";
import { RbacProtectedRoute } from "@/components/shared/rbac-protected-route";

export const metadata = { title: "Tịnh kho hóa chất" };

export default function Page() {
  return (
    <RbacProtectedRoute permissionId="chemical-inventory-manage" featureLabel="Tịnh kho hóa chất">
      <ChemicalInventoryPage />
    </RbacProtectedRoute>
  );
}
