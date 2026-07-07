import type { Metadata } from "next";
import { PublicOrgChartClient } from "./public-org-chart-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sơ đồ tổ chức ca vận hành",
  description: "Danh sách nhân sự trực ca vận hành Duyên Hải 1",
};

export default function PublicOrgChartPage() {
  return <PublicOrgChartClient />;
}
