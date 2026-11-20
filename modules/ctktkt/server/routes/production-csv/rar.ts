import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BLOCK_BYTES = 512;

export async function readRarCsv(buffer: Buffer, maxBytes: number, maxFiles: number) {
  const directory = await mkdtemp(join(tmpdir(), "vh1-rar-"));
  const tooLarge = "Tổng CSV sau giải nén vượt quá 5 MB.";
  try {
    await writeFile(join(directory, "upload.rar"), buffer);
    // Convert to ustar on stdout. The archive cannot create files or links on disk.
    const tar = await new Promise<Buffer>((resolve, reject) => {
      execFile(process.platform === "win32" ? "tar.exe" : "bsdtar",
        ["-cf", "-", "--format", "ustar", "@upload.rar"],
        { cwd: directory, encoding: "buffer", maxBuffer: maxBytes + 64 * 1024, timeout: 10_000, windowsHide: true },
        (error, stdout) => {
          if (!error) return resolve(stdout);
          if (error.code === "ENOENT") return reject(new Error("Máy chủ chưa có công cụ đọc RAR. Vui lòng dùng CSV hoặc ZIP."));
          if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return reject(new Error(tooLarge));
          reject(new Error("Không giải nén được RAR. Hãy kiểm tra tệp có bị hỏng, cần mật khẩu hoặc thuộc bộ nén nhiều phần."));
        });
    });
    const files: { name: string; bytes: Buffer }[] = [];
    let totalBytes = 0;
    for (let offset = 0; offset + BLOCK_BYTES <= tar.length;) {
      const header = tar.subarray(offset, offset + BLOCK_BYTES);
      if (header.every(byte => byte === 0)) break;
      const sizeField = header.toString("ascii", 124, 136).split("\0", 1)[0].trim();
      const size = Number.parseInt(sizeField, 8);
      const dataStart = offset + BLOCK_BYTES;
      if (!/^[0-7]+$/.test(sizeField) || dataStart + size > tar.length) throw new Error("Dữ liệu RAR sau giải nén không hợp lệ.");
      offset = dataStart + Math.ceil(size / BLOCK_BYTES) * BLOCK_BYTES;
      const type = header[156];
      if (type === 53) continue; // ustar directory
      const name = header.toString("utf8", 0, 100).split("\0", 1)[0].split(/[\\/]/).at(-1)!;
      if ((type !== 48 && type !== 0) || !/\.csv$/i.test(name) || files.length >= maxFiles) {
        throw new Error("RAR chỉ được chứa tệp CSV thường, tối đa 16 CSV cho mỗi lần nhập.");
      }
      totalBytes += size;
      if (totalBytes > maxBytes) throw new Error(tooLarge);
      files.push({ name, bytes: tar.subarray(dataStart, dataStart + size) });
    }
    if (!files.length) throw new Error("RAR không chứa tệp CSV.");
    return files;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
