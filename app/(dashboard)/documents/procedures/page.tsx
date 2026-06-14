import { DocumentCatalogPage } from "@/components/documents/document-catalog-page";

export default function ProcedureDocumentsPage() {
  return (
    <DocumentCatalogPage
      category="PROCEDURE"
      title="DANH MỤC QUY TRÌNH VẬN HÀNH"
      description="Lưu trữ, tra cứu và chia sẻ các quy trình vận hành dùng trong phân xưởng"
      nameLabel="Tên quy trình"
      codeLabel="Số quyết định"
      linkLabel="Link tài liệu"
      addLabel="Thêm quy trình"
      emptyTitle="Chưa có quy trình vận hành"
      emptyDescription="Admin có thể thêm quy trình, số quyết định và link tài liệu liên kết tại đây."
      showEquipmentScope
    />
  );
}
