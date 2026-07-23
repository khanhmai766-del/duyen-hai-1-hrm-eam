const MAX_DEFECT_IMAGE_BYTES = 15 * 1024 * 1024;

/** Kiểm tra payload ảnh khiếm khuyết kể cả khi client gọi API trực tiếp. */
export function validateDefectImages(values: unknown[]) {
  if (values.length > 3) return "Chỉ được tải lên tối đa 3 ảnh khiếm khuyết";

  for (const value of values) {
    if (typeof value !== "string") return "Dữ liệu ảnh khiếm khuyết không hợp lệ";
    const match = value.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match) continue; // URL ảnh S3 đã lưu từ trước.
    if (!match[1].startsWith("image/")) return "Tệp tải lên phải là hình ảnh";

    // Base64 dùng 4 ký tự cho mỗi 3 byte; trừ tối đa 2 byte padding.
    const padding = match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0;
    const decodedBytes = Math.floor(match[2].length * 3 / 4) - padding;
    if (decodedBytes > MAX_DEFECT_IMAGE_BYTES) return "Mỗi ảnh khiếm khuyết tối đa 15MB";
  }

  return null;
}
