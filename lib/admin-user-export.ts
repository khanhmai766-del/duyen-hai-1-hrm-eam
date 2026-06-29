import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

export async function exportUsersWorkbook() {
  const users = await prisma.user.findMany({
    orderBy: { employeeId: "asc" },
    select: {
      name: true,
      employeeId: true,
      phone: true,
      email: true,
      workEmail: true,
    },
  });

  const rows = users.map((user) => ({
    "Nhân viên": user.name,
    "Mã NV": user.employeeId,
    "Số điện thoại": user.phone ?? "",
    "Email công ty": user.email,
    "Email làm việc": user.workEmail ?? "",
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 16 },
    { wch: 30 },
    { wch: 30 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "nguoi_dung");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}
