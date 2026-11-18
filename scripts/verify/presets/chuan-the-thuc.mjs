import path from "node:path";

// Chuẩn thể thức nhúng trong iframe: chụp bước tải file và bước kết quả (nạp một mẫu .docx có sẵn trong templates/).
// Xử lý chạy hết trong trình duyệt, không ghi gì vào DB.
const SAMPLE = path.resolve("templates/bbkt-thang-di-dong.docx");

export const chuanTheThucPreset = {
  prepare: async () => ({}),
  routes: () => ["/tien-ich/chuan-the-thuc?ui=upload", "/tien-ich/chuan-the-thuc?ui=result"],
  async interact(page, route) {
    const app = page.frameLocator('iframe[title="Chuẩn thể thức văn bản"]');
    await app.locator("#drop").waitFor();
    if (!route.endsWith("ui=result")) return;
    await app.locator("#fileInput").setInputFiles(SAMPLE);
    await app.locator("#stageWork:not([hidden]) #preview .docx").first().waitFor({ timeout: 30_000 });
    // Web chính mặc định chuẩn NĐDH: cỡ chữ nội dung cố định 14 theo Phụ lục II
    if ((await app.locator("#standard").inputValue()) !== "nddh") throw new Error("Chuẩn mặc định không phải NĐDH");
    if ((await app.locator("#bodySize").inputValue()) !== "14" || !(await app.locator("#bodySize").isDisabled())) throw new Error("Ô cỡ chữ chưa khoá ở 14");
  },
};
