// Hai cột "fireSafetyImpact" / "environmentSafetyImpact" nay đã nằm trong model
// Defect (prisma/schema.prisma) nên đọc/ghi trực tiếp qua Prisma — không cần raw SQL
// hay DDL self-heal nữa. Chỉ còn lại hàm chuẩn hoá giá trị đầu vào.
export function normalizeImpactValue(value: unknown) {
  return value === "Có" || value === "Không" ? value : null;
}
