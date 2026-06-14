import { DocumentCatalogPage } from "@/components/documents/document-catalog-page";

export default function PidDocumentsPage() {
  return (
    <DocumentCatalogPage
      category="PID"
      title="DANH MỤC SƠ ĐỒ P&ID"
      description="Tập trung sơ đồ công nghệ, bản vẽ P&ID và tài liệu kỹ thuật liên quan"
      nameLabel="Tên sơ đồ P&ID"
      codeLabel="Số bản vẽ"
      linkLabel="Link tài liệu"
      addLabel="Thêm sơ đồ P&ID"
      emptyTitle="Chưa có sơ đồ P&ID"
      emptyDescription="Admin có thể thêm tên sơ đồ, số bản vẽ và link tài liệu liên kết tại đây."
      showEquipmentScope
      showCodeField={false}
    />
  );
}
