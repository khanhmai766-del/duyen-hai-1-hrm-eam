"use client";

import { RbacProtectedRoute } from "@/components/shared/rbac-protected-route";
import { ReplacementsPageContent } from "./replacements-view";

export default function ReplacementsPage() {
  return (
    <RbacProtectedRoute permissionId="replacement-manage" featureLabel="Lịch thay thế vật tư">
      <ReplacementsPageContent />
    </RbacProtectedRoute>
  );
}
