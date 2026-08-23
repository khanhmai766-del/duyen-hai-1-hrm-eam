/**
 * Thu nhỏ ảnh trong trình duyệt trước khi gửi lên — dùng chung cho ảnh hiện trường của BBNT
 * D-Office và ảnh phiếu xuất kho liên 3 của BBTHVT.
 *
 * CHỈ DÙNG Ở CLIENT COMPONENT: hàm đụng `FileReader`, `Image` và `canvas`.
 */

/**
 * Trần độ dài data URL gửi lên. nginx trước app mặc định chặn body 1MB, vượt là người dùng
 * nhận 413 chứ không phải thông báo tiếng Việt của mình.
 */
const MAX_UPLOAD_CHARS = 900 * 1024;

/**
 * Các bậc [cạnh dài tối đa, chất lượng] thử lần lượt cho tới khi lọt trần trên.
 *
 * Bậc đầu cố ý rộng tay: khâu nén thật nằm ở máy chủ (sharp, lọc Lanczos), nên việc ở đây chỉ
 * là đưa cho sharp bản gốc còn nguyên chi tiết. Nén chặt ngay tại đây là nén hai lần, vết nén
 * cộng dồn và chữ trong ảnh chụp giấy tờ nhòe hẳn.
 */
const DOWNSCALE_STEPS: Array<[number, number]> = [
  [2048, 0.92],
  [1600, 0.88],
  [1280, 0.8],
];

/** Đọc tệp ảnh, thu nhỏ vừa trần dung lượng, trả về data URL JPEG. */
export function downscaleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không đọc được tệp ảnh"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(reader.result as string);
      img.onload = () => {
        const render = (maxSize: number, quality: number) => {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) return null;
          ctx.imageSmoothingQuality = "high"; // mặc định của canvas thu ảnh 4000px xuống là răng cưa
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/jpeg", quality);
        };

        let out: string | null = null;
        for (const [maxSize, quality] of DOWNSCALE_STEPS) {
          const url = render(maxSize, quality);
          if (!url) break;
          out = url;
          if (url.length <= MAX_UPLOAD_CHARS) break;
        }
        resolve(out ?? (reader.result as string));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
