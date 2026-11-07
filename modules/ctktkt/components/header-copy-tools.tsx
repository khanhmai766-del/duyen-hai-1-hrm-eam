"use client";
import { usePathname } from "next/navigation";
import { SpreadsheetCopyTools } from "./spreadsheet-copy-tools";

/** Nút "Chọn ô để sao chép Excel" ở hàng tiêu đề phân hệ; ẩn ở trang không có bảng số liệu. */
export function HeaderCopyTools() {
  const pathname = usePathname() ?? "";
  if (/\/(tien-ich-dong-bo|phan-quyen|google-sheets)(\/|$)/.test(pathname)) return null;
  // key theo trang: đổi trang thì thoát chế độ chọn và bỏ vùng chọn cũ.
  return <SpreadsheetCopyTools key={pathname} />;
}
