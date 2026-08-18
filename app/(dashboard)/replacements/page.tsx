"use client";

import { Suspense } from "react";
import { RbacProtectedRoute } from "@/components/shared/rbac-protected-route";
import { ReplacementsPageContent } from "./replacements-view";

export default function ReplacementsPage() {
  return (
    <RbacProtectedRoute permissionId="replacement-manage" featureLabel="Lịch thay thế vật tư">
      <Suspense fallback={null}>
        <ReplacementsPageContent />
      </Suspense>
    </RbacProtectedRoute>
  );
}
