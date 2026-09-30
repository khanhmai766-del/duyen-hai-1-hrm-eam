import net from "node:net";

// Kiểm tra MỌI tệp người dùng tải lên trước khi lưu/xử lý (ISO/IEC 27001 A.8.26 — mục 6):
//   1. Định dạng thật theo chữ ký nhị phân đầu tệp — MIME/đuôi tệp do trình duyệt gửi
//      giả mạo được, "virus.exe" đổi tên thành "baocao.pdf" vẫn lọt qua kiểm tra đuôi.
//   2. Quét mã độc bằng ClamAV (clamd, lệnh INSTREAM) khi có cấu hình:
//        CLAMAV_SOCKET=/run/clamav/clamd.ctl        (ưu tiên, cùng máy)
//        CLAMAV_HOST=127.0.0.1  CLAMAV_PORT=3310     (hoặc TCP)
//        CLAMAV_TIMEOUT_MS=30000
//      Đã cấu hình thì FAIL-CLOSED: clamd không trả lời → từ chối tệp (503), không cho lọt.
//      Chưa cấu hình → chỉ kiểm định dạng, ghi cảnh báo một lần vào log.
//      clamd.conf cần StreamMaxLength ≥ 100M (mặc định 25M, nhỏ hơn giới hạn ZIP ảnh/chữ ký).
//
// KHÔNG import next/* hay lib/api: lib/s3.ts (script tsx cũng dùng) gọi file này.

export type FileKind = "jpeg" | "png" | "gif" | "webp" | "avif" | "tiff" | "pdf" | "zip" | "ole";

/** Ảnh sharp giải mã được — ảnh sau đó luôn được mã hóa lại, xoá mọi dữ liệu nhúng. */
export const IMAGE_KINDS: FileKind[] = ["jpeg", "png", "gif", "webp", "avif", "tiff"];
/** .xlsx/.docx là gói ZIP (OOXML). */
export const OFFICE_OPEN_XML_KINDS: FileKind[] = ["zip"];

/** Lỗi trả thẳng cho người dùng; lib/api.ts handle() đổi thành phản hồi `status` kèm câu này. */
export class UploadRejectedError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "UploadRejectedError";
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export function detectFileKind(buffer: Buffer): FileKind | null {
  const ascii = (start: number, end: number) => buffer.subarray(start, end).toString("latin1");
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "avif";
  if (ascii(0, 4) === "II*\0" || ascii(0, 4) === "MM\0*") return "tiff";
  // Chuẩn PDF cho phép "%PDF-" nằm trong 1024 byte đầu (Acrobat chấp nhận vậy).
  if (buffer.subarray(0, 1024).includes("%PDF-")) return "pdf";
  if (ascii(0, 4) === "PK\x03\x04" || ascii(0, 4) === "PK\x05\x06") return "zip";
  if (buffer.subarray(0, 8).equals(OLE_SIGNATURE)) return "ole";
  return null;
}

/**
 * Kiểm định dạng (khi truyền `kinds`) rồi quét virus. Ném UploadRejectedError nếu không đạt.
 * `label` là tên định dạng hiện trong câu báo lỗi, ví dụ "PDF", "ảnh", "Excel (.xlsx)".
 */
export async function inspectUpload(
  buffer: Buffer,
  { fileName, kinds, label }: { fileName?: string | null; kinds?: FileKind[]; label?: string }
) {
  const name = fileName?.trim() || "tải lên";
  if (!buffer.length) throw new UploadRejectedError(`Tệp "${name}" rỗng`);
  const kind = detectFileKind(buffer);
  if (kinds && (!kind || !kinds.includes(kind))) {
    throw new UploadRejectedError(`Tệp "${name}" không phải ${label ?? "định dạng được phép"} thật (nội dung không khớp đuôi tệp)`);
  }
  await scanForMalware(buffer, name);
  return kind;
}

type ClamTarget = { path: string } | { host: string; port: number };

function clamTarget(): ClamTarget | null {
  const socketPath = process.env.CLAMAV_SOCKET?.trim();
  if (socketPath) return { path: socketPath };
  const host = process.env.CLAMAV_HOST?.trim();
  if (host) return { host, port: Number(process.env.CLAMAV_PORT ?? 3310) };
  return null;
}

let warnedNoScanner = false;

export function malwareScannerConfigured() {
  return clamTarget() !== null;
}

export async function scanForMalware(buffer: Buffer, fileName: string) {
  const target = clamTarget();
  if (!target) {
    if (!warnedNoScanner) {
      warnedNoScanner = true;
      console.warn("[virus-scan] Chưa cấu hình CLAMAV_SOCKET/CLAMAV_HOST — tệp tải lên KHÔNG được quét virus.");
    }
    return;
  }

  let reply: string;
  try {
    reply = await clamdInstream(target, buffer);
  } catch (error) {
    console.error("[virus-scan] Không liên lạc được clamd:", error instanceof Error ? error.message : error);
    throw new UploadRejectedError("Dịch vụ quét virus tạm thời không phản hồi nên chưa nhận tệp. Vui lòng thử lại sau ít phút.", 503);
  }

  if (/:\s*OK$/.test(reply)) return;
  const found = /:\s*(.+)\s+FOUND$/.exec(reply);
  if (found) {
    console.warn(`[virus-scan] CHẶN tệp "${fileName}": ${found[1]}`);
    throw new UploadRejectedError(`Tệp "${fileName}" bị chặn vì phát hiện mã độc (${found[1]}).`, 422);
  }
  console.error(`[virus-scan] clamd trả lời bất thường cho "${fileName}": ${reply}`);
  if (/size limit exceeded/i.test(reply)) {
    throw new UploadRejectedError(`Tệp "${fileName}" vượt giới hạn dung lượng quét virus của máy chủ.`, 413);
  }
  throw new UploadRejectedError("Không quét virus được tệp này. Vui lòng thử lại hoặc báo Quản trị.", 503);
}

/** Giao thức clamd: "zINSTREAM\0", các khối [độ dài 4 byte big-endian][dữ liệu], kết thúc bằng khối độ dài 0. */
function clamdInstream(target: ClamTarget, buffer: Buffer): Promise<string> {
  const timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS ?? 30000);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(target);
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (error: Error | null, value?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value ?? "");
    };
    const replyText = () => Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim();

    socket.setTimeout(timeoutMs, () => finish(new Error(`clamd không trả lời sau ${timeoutMs} ms`)));
    socket.on("data", (data) => {
      chunks.push(data);
      if (data.includes(0)) finish(null, replyText());
    });
    // clamd có thể đóng kết nối giữa chừng (vượt StreamMaxLength) sau khi đã gửi câu trả lời.
    socket.on("end", () => (chunks.length ? finish(null, replyText()) : finish(new Error("clamd đóng kết nối không trả lời"))));
    socket.on("error", (error) => (chunks.length ? finish(null, replyText()) : finish(error)));
    socket.on("connect", async () => {
      try {
        await write(socket, Buffer.from("zINSTREAM\0"));
        const CHUNK = 64 * 1024;
        for (let offset = 0; offset < buffer.length && !settled; offset += CHUNK) {
          const part = buffer.subarray(offset, offset + CHUNK);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(part.length);
          await write(socket, Buffer.concat([size, part]));
        }
        if (!settled) await write(socket, Buffer.alloc(4));
      } catch (error) {
        if (!chunks.length) finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

function write(socket: net.Socket, data: Buffer) {
  return new Promise<void>((resolve, reject) => {
    socket.write(data, (error) => (error ? reject(error) : resolve()));
  });
}
