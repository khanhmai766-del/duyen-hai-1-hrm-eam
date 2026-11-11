/**
 * Nhận diện lỗi vi phạm khóa ngoại (Postgres SQLSTATE 23503) từ truy vấn raw của Prisma.
 * Dùng cho toggle like: nếu chủ đề/phản hồi vừa bị xóa, INSERT sẽ vi phạm FK → trả 404.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  const meta = (error as { meta?: { code?: string } } | null)?.meta;
  const message = error instanceof Error ? error.message : String(error);
  return meta?.code === "23503" || message.includes("23503") || /foreign key/i.test(message);
}
