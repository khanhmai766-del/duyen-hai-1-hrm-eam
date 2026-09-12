import TbycnnPage from "@/components/tbycnn/TbycnnPage";
import { RbacProtectedRoute } from "@/components/shared/rbac-protected-route";

export default function Page() {
  return (
    <RbacProtectedRoute permissionId="tbycnn-view" featureLabel="Thiết bị yêu cầu nghiêm ngặt về ATLĐ">
      <TbycnnPage />
    </RbacProtectedRoute>
  );
}
