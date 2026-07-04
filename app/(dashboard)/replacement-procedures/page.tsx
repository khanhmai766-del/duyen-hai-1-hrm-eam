import { PageHeader } from "@/components/shared/page-header";
import MaterialTicketBoard from "@/components/materials/MaterialTicketBoard";

export default function ReplacementProceduresPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="QUY TRÌNH THAY THẾ" />
      <MaterialTicketBoard />
    </div>
  );
}
