import { DocumentCatalogPage } from "@/components/documents/document-catalog-page";

export default function ProcedureDocumentsPage() {
  return (
    <DocumentCatalogPage
      category="PROCEDURE"
      title="DANH MỤC QUY TRÌNH"
      description="Lưu trữ, tra cứu và chia sẻ các quy trình dùng trong phân xưởng"
      nameLabel="Tên quy trình"
      codeLabel="Số quyết định"
      linkLabel="Link tài liệu"
      addLabel="Thêm quy trình"
      emptyTitle="Chưa có danh mục quy trình"
      emptyDescription="Admin có thể thêm quy trình, số quyết định và link tài liệu liên kết tại đây."
      showEquipmentScope
      showPaginationFooter
      wideNameNarrowLinkLayout
    />
  );
}
