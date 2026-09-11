"use client";

import { useContracts } from "@/lib/tcms/components/contracts/contract-store";
import Link from "next/link";

export interface ContractFilterValues {
  search: string;
  year: string;
  status: string;

  leadDepartment: string;
  participantDepartment: string;

  warning: string;
  sortBy: string;
}

interface ContractFiltersProps {
  filters: ContractFilterValues;

  leadDepartments: string[];
  participantDepartments: string[];

  resultCount: number;
  totalCount: number;

  onChange: (filters: ContractFilterValues) => void;
  onReset: () => void;
}

const statusLabels: Record<string, string> = {
  DRAFT: "Nháp",
  ACTIVE: "Đã kích hoạt",
  IN_PROGRESS: "Đang thực hiện",
  TECHNICAL_COMPLETION: "Hoàn thành kỹ thuật",
  COMPLETED: "Đã hoàn thành",
  CLOSED: "Đã đóng",
  SUSPENDED: "Tạm dừng",
  CANCELLED: "Đã hủy",
};

const sortLabels: Record<string, string> = {
  priority: "Ưu tiên quản lý",
  "remaining-asc": "Còn lại: ít → nhiều",
  "remaining-desc": "Còn lại: nhiều → ít",
  "progress-asc": "Hoàn thành: thấp → cao",
  "progress-desc": "Hoàn thành: cao → thấp",
  "enddate-asc": "KT hợp đồng: gần → xa",
  "enddate-desc": "KT hợp đồng: xa → gần",
  stt: "Theo STT",
};

export function ContractFilters({
  filters,
  leadDepartments,
  participantDepartments,
  resultCount,
  totalCount,
  onChange,
  onReset,
}: ContractFiltersProps) {
  const { canCreate } = useContracts();
  function updateFilter(
    field: keyof ContractFilterValues,
    value: string
  ) {
    onChange({
      ...filters,
      [field]: value,
    });
  }

  const hasActiveFilter =
    filters.search !== "" ||
    filters.year !== "all" ||
    filters.status !== "all" ||
    filters.leadDepartment !== "all" ||
    filters.participantDepartment !== "all" ||
    filters.warning !== "all" ||
    filters.sortBy !== "priority";

  const activeChips: string[] = [];

  if (filters.search.trim()) {
    activeChips.push(`Tìm: ${filters.search.trim()}`);
  }

  if (filters.year !== "all") {
    activeChips.push(`Năm ${filters.year}`);
  }

  if (filters.status !== "all") {
    activeChips.push(
      statusLabels[filters.status] ?? filters.status
    );
  }

  if (filters.leadDepartment !== "all") {
    activeChips.push(
      `Chủ trì: ${filters.leadDepartment}`
    );
  }

  if (filters.participantDepartment !== "all") {
    activeChips.push(
      `Tham gia: ${filters.participantDepartment}`
    );
  }

  if (filters.warning !== "all") {
    activeChips.push(filters.warning);
  }

  if (filters.sortBy !== "priority") {
    activeChips.push(
      `Sắp xếp: ${
        sortLabels[filters.sortBy] ?? filters.sortBy
      }`
    );
  }

  const controlClassName =
    "h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-medium text-slate-600 outline-none transition hover:border-slate-300 focus:border-blue-300 focus:ring-2 focus:ring-blue-100";

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* =====================================================
          HÀNG 1 - SEARCH + ACTION
      ===================================================== */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
        <div className="relative min-w-[300px] flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <span className="text-[13px] text-slate-400">
              ⌕
            </span>
          </div>

          <input
            type="text"
            value={filters.search}
            onChange={(event) =>
              updateFilter(
                "search",
                event.target.value
              )
            }
            placeholder="Tìm số HĐ, gói thầu, nhà thầu, nhân sự..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-[11px] text-slate-700 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <button
          type="button"
          className="h-9 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          ▦ Cột hiển thị
        </button>

        {canCreate && <Link
          href="/documents/contracts/list/new"
          className="inline-flex h-9 items-center whitespace-nowrap rounded-lg bg-blue-700 px-3.5 text-[10px] font-semibold text-white shadow-sm transition hover:bg-blue-800"
        >
          ＋ Thêm hợp đồng
        </Link>}
      </div>

      {/* =====================================================
          HÀNG 2 - FILTER
      ===================================================== */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
        <span className="mr-1 text-[9px] font-bold uppercase tracking-[0.06em] text-slate-400">
          Bộ lọc
        </span>

        {/* NĂM */}
        <select
          value={filters.year}
          onChange={(event) =>
            updateFilter(
              "year",
              event.target.value
            )
          }
          className={controlClassName}
        >
          <option value="all">
            Tất cả năm
          </option>

          <option value="2025">
            2025
          </option>

          <option value="2026">
            2026
          </option>
        </select>

        {/* TRẠNG THÁI */}
        <select
          value={filters.status}
          onChange={(event) =>
            updateFilter(
              "status",
              event.target.value
            )
          }
          className={controlClassName}
        >
          <option value="all">
            Tất cả trạng thái
          </option>

          <option value="DRAFT">
            Nháp
          </option>

          <option value="ACTIVE">
            Đã kích hoạt
          </option>

          <option value="IN_PROGRESS">
            Đang thực hiện
          </option>

          <option value="TECHNICAL_COMPLETION">
            Hoàn thành kỹ thuật
          </option>

          <option value="COMPLETED">
            Đã hoàn thành
          </option>

          <option value="CLOSED">
            Đã đóng
          </option>

          <option value="SUSPENDED">
            Tạm dừng
          </option>

          <option value="CANCELLED">
            Đã hủy
          </option>
        </select>

        {/* ĐƠN VỊ CHỦ TRÌ */}
        <select
          value={filters.leadDepartment}
          onChange={(event) =>
            updateFilter(
              "leadDepartment",
              event.target.value
            )
          }
          className={`${controlClassName} max-w-[155px]`}
        >
          <option value="all">
            Tất cả chủ trì
          </option>

          {leadDepartments.map(
            (department) => (
              <option
                key={department}
                value={department}
              >
                Chủ trì: {department}
              </option>
            )
          )}
        </select>

        {/* ĐƠN VỊ THAM GIA */}
        <select
          value={
            filters.participantDepartment
          }
          onChange={(event) =>
            updateFilter(
              "participantDepartment",
              event.target.value
            )
          }
          className={`${controlClassName} max-w-[165px]`}
        >
          <option value="all">
            Tất cả đơn vị tham gia
          </option>

          {participantDepartments.map(
            (department) => (
              <option
                key={department}
                value={department}
              >
                {department}
              </option>
            )
          )}
        </select>

        {/* CẢNH BÁO */}
        <select
          value={filters.warning}
          onChange={(event) =>
            updateFilter(
              "warning",
              event.target.value
            )
          }
          className={controlClassName}
        >
          <option value="all">
            Tất cả cảnh báo
          </option>

          <option value="Bình thường">
            Bình thường
          </option>

          <option value="Theo dõi">
            Theo dõi
          </option>

          <option value="Sắp hết hạn">
            Sắp hết hạn
          </option>

          <option value="Khẩn">
            Khẩn
          </option>

          <option value="Đã hết hạn">
            Đã hết hạn
          </option>

          <option value="Đã hoàn thành">
            Đã hoàn thành
          </option>
        </select>

        {/* SORT */}
        <select
          value={filters.sortBy}
          onChange={(event) =>
            updateFilter(
              "sortBy",
              event.target.value
            )
          }
          className={`${controlClassName} max-w-[185px]`}
        >
          <option value="priority">
            Ưu tiên quản lý
          </option>

          <option value="remaining-asc">
            Còn lại: ít → nhiều
          </option>

          <option value="remaining-desc">
            Còn lại: nhiều → ít
          </option>

          <option value="progress-asc">
            Hoàn thành: thấp → cao
          </option>

          <option value="progress-desc">
            Hoàn thành: cao → thấp
          </option>

          <option value="enddate-asc">
            KT hợp đồng: gần → xa
          </option>

          <option value="enddate-desc">
            KT hợp đồng: xa → gần
          </option>

          <option value="stt">
            Theo STT
          </option>
        </select>

        {/* RESET */}
        <button
          type="button"
          onClick={onReset}
          disabled={!hasActiveFilter}
          className="ml-auto h-8 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          × Xóa lọc
        </button>
      </div>

      {/* =====================================================
          HÀNG 3 - ACTIVE FILTER
      ===================================================== */}
      <div className="flex min-h-[32px] flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-3 py-1.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.06em] text-slate-400">
          Đang lọc:
        </span>

        {activeChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {activeChips.map((chip) => (
              <span
                key={chip}
                className="inline-flex max-w-[220px] items-center truncate rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700"
                title={chip}
              >
                {chip}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[9px] text-slate-400">
            Không có bộ lọc
          </span>
        )}

        <div className="ml-auto flex items-center gap-1 text-[10px] text-slate-500">
          <span>Hiển thị</span>

          <span className="font-bold text-slate-900">
            {resultCount}
          </span>

          <span>/</span>

          <span className="font-semibold text-slate-700">
            {totalCount}
          </span>

          <span>hợp đồng</span>
        </div>
      </div>
    </div>
  );
}
