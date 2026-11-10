import { Prisma } from "@prisma/client";

/**
 * Lỗi phía MÁY CHỦ (DB, mạng, hệ điều hành), khác với lỗi dữ liệu người dùng gửi lên.
 *
 * Nhiều handler KTKT bọc cả phần kiểm dữ liệu lẫn phần ghi DB trong một `try` rồi trả `fail(error.message, 400)` —
 * cách đó đúng với câu báo lỗi tiếng Việt do code tự ném, nhưng với lỗi Prisma/mạng thì người dùng nhận câu tiếng Anh
 * kèm tên bảng, địa chỉ DB, và lỗi thật của máy chủ bị ghi thành 400 nên không hiện trong log/giám sát.
 */
export function isKtktServerFault(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientValidationError
  ) return true;
  // Lỗi hệ thống của Node: ECONNREFUSED, ETIMEDOUT, ENOENT, EPIPE…
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^E[A-Z]{2,}$/.test(code)) return true;
  // `fetch` hỏng mạng (undici) ném TypeError "fetch failed".
  return error instanceof TypeError && error.message === "fetch failed";
}

/**
 * Gọi ở dòng đầu khối `catch` trước `fail(error.message, …)`: lỗi máy chủ được ném tiếp để `handle()` (lớp bọc
 * `ktktRoute`) ghi log đầy đủ và trả 500 "Lỗi máy chủ"; lỗi dữ liệu đi tiếp như cũ.
 */
export function rethrowKtktServerFault(error: unknown): void {
  if (isKtktServerFault(error)) throw error;
}
