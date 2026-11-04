// Tải thư viện SheetJS (đọc/ghi Excel) từ CDN ngay trên trình duyệt khi cần,
// dùng chung cho cả xuất Excel (dashboard) và nhập nhiều ngày từ Excel (bulk import).
// Không thêm vào package.json vì không có kênh chạy npm install trên máy.
export type SheetJsLib = {
  read: (data: ArrayBuffer, opts?: Record<string, unknown>) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: {
    json_to_sheet: (data: Record<string, unknown>[]) => unknown;
    aoa_to_sheet: (data: (string | number | null | undefined)[][]) => unknown;
    book_new: () => unknown;
    book_append_sheet: (workbook: unknown, worksheet: unknown, name: string) => void;
    sheet_to_csv: (worksheet: unknown) => string;
  };
  writeFile: (workbook: unknown, filename: string) => void;
};

export async function loadSheetJs(): Promise<SheetJsLib> {
  return await import("xlsx") as unknown as SheetJsLib;
}
