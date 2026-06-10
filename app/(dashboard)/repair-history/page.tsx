"use client";

import { useSession } from "next-auth/react";
import { DefectHistoryTab } from "@/components/repair/defect-history-tab";

export default function RepairHistoryPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;

  return (
    <div className="space-y-6">
      <DefectHistoryTab role={role} />
    </div>
  );
}
