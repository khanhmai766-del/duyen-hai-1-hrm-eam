const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

function positiveInteger(value: string | null, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : fallback;
}

/** Đếm trong đúng phạm vi/bộ lọc trước khi chọn trang, tránh bảng rỗng vì trang cũ vượt giới hạn. */
export async function loadPcccPage<T>(
  params: URLSearchParams,
  count: () => Promise<number>,
  findRows: (pagination: { skip: number; take: number }) => Promise<T[]>
) {
  const pageSize = Math.min(MAX_PAGE_SIZE, positiveInteger(params.get("pageSize"), DEFAULT_PAGE_SIZE));
  const total = await count();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, positiveInteger(params.get("page"), 1));
  const rows = await findRows({ skip: (page - 1) * pageSize, take: pageSize });
  return { rows, total, page, pageSize, pageCount };
}
