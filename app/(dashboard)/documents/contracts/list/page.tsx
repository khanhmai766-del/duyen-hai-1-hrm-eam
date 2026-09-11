"use client";
import { normalizeText } from "@/lib/nav";

import { useMemo, useState } from "react";


import { ContractSummary } from "@/lib/tcms/components/contracts/contract-summary";
import { useContracts } from "@/lib/tcms/components/contracts/contract-store";
import {
  ContractFilters,
  ContractFilterValues,
} from "@/lib/tcms/components/contracts/contract-filters";
import { ContractTable } from "@/lib/tcms/components/contracts/contract-table";

import {
  getContractWarning,
  getEffectiveEndDate,
  getRemainingDays,
} from "@/lib/tcms/lib/contract-utils";

/* =========================================================
   FILTER MẶC ĐỊNH
========================================================= */

const initialFilters: ContractFilterValues = {
  search: "",
  year: "all",
  status: "all",
  leadDepartment: "all",
  participantDepartment: "all",
  warning: "all",
  sortBy: "priority",
};

/* =========================================================
   CHUẨN HÓA TEXT
========================================================= */



/* =========================================================
   THỨ TỰ ƯU TIÊN CẢNH BÁO
========================================================= */

function getWarningPriority(warning: string) {
  const priorities: Record<string, number> = {
    Khẩn: 1,
    "Đã hết hạn": 2,
    "Sắp hết hạn": 3,
    "Theo dõi": 4,
    "Bình thường": 5,
    "Đã hoàn thành": 6,
  };

  return priorities[warning] ?? 99;
}

/* =========================================================
   PAGE
========================================================= */

export default function ContractsPage() {
  const { contracts, error } = useContracts();
  const [filters, setFilters] =
    useState<ContractFilterValues>(initialFilters);

  /* =======================================================
     DANH SÁCH ĐƠN VỊ CHỦ TRÌ
  ======================================================= */

  const leadDepartments = useMemo(() => {
    const values = contracts.map(
      (contract) => contract.leadDepartment
    );

    return Array.from(new Set(values))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "vi"));
  }, [contracts]);

  /* =======================================================
     DANH SÁCH ĐƠN VỊ THAM GIA GIÁM SÁT
  ======================================================= */

  const participantDepartments = useMemo(() => {
    const values = contracts.flatMap((contract) =>
      contract.supervisors.map(
        (supervisor) => supervisor.department
      )
    );

    return Array.from(new Set(values))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "vi"));
  }, [contracts]);

  /* =======================================================
     FILTER + SORT
  ======================================================= */

  const filteredContracts = useMemo(() => {
    const searchText = normalizeText(filters.search);

    /* -----------------------------------------------------
       FILTER
    ----------------------------------------------------- */

    const result = contracts.filter((contract) => {
      /* SEARCH */

      const searchableText = normalizeText(
        [
          contract.contractNumber,
          contract.packageName,
          contract.contractorName,
          contract.contractorRepresentative,
          contract.leadDepartment,
          contract.handoverDocument,
          contract.progressNote,
          contract.costNote,
          contract.managementDirection,

          ...contract.supervisors.flatMap(
            (supervisor) => [
              supervisor.fullName,
              supervisor.department,
              supervisor.role,
            ]
          ),
        ].join(" ")
      );

      const matchesSearch =
        searchText === "" ||
        searchableText.includes(searchText);

      /* NĂM */

      const contractYear = contract.contractStartDate
        ? new Date(
            `${contract.contractStartDate}T00:00:00`
          )
            .getFullYear()
            .toString()
        : "";

      const matchesYear =
        filters.year === "all" ||
        contractYear === filters.year;

      /* TRẠNG THÁI */

      const matchesStatus =
        filters.status === "all" ||
        contract.status === filters.status;

      /* ĐƠN VỊ CHỦ TRÌ */

      const matchesLeadDepartment =
        filters.leadDepartment === "all" ||
        contract.leadDepartment ===
          filters.leadDepartment;

      /* ĐƠN VỊ THAM GIA */

      const matchesParticipantDepartment =
        filters.participantDepartment === "all" ||
        contract.supervisors.some(
          (supervisor) =>
            supervisor.department ===
            filters.participantDepartment
        );

      /* CẢNH BÁO */

      const warning =
        getContractWarning(contract);

      const matchesWarning =
        filters.warning === "all" ||
        warning === filters.warning;

      return (
        matchesSearch &&
        matchesYear &&
        matchesStatus &&
        matchesLeadDepartment &&
        matchesParticipantDepartment &&
        matchesWarning
      );
    });

    /* -----------------------------------------------------
       SORT
    ----------------------------------------------------- */

    return [...result].sort((a, b) => {
      /* STT */

      if (filters.sortBy === "stt") {
        return a.stt - b.stt;
      }

      /* CÒN LẠI: ÍT → NHIỀU */

      if (filters.sortBy === "remaining-asc") {
        const aDays =
          getRemainingDays(a) ??
          Number.POSITIVE_INFINITY;

        const bDays =
          getRemainingDays(b) ??
          Number.POSITIVE_INFINITY;

        return aDays - bDays;
      }

      /* CÒN LẠI: NHIỀU → ÍT */

      if (filters.sortBy === "remaining-desc") {
        const aDays =
          getRemainingDays(a) ??
          Number.NEGATIVE_INFINITY;

        const bDays =
          getRemainingDays(b) ??
          Number.NEGATIVE_INFINITY;

        return bDays - aDays;
      }

      /* TIẾN ĐỘ: THẤP → CAO */

      if (filters.sortBy === "progress-asc") {
        return (
          a.progressPercent -
          b.progressPercent
        );
      }

      /* TIẾN ĐỘ: CAO → THẤP */

      if (filters.sortBy === "progress-desc") {
        return (
          b.progressPercent -
          a.progressPercent
        );
      }

      /* KT HỢP ĐỒNG: GẦN → XA */

      if (filters.sortBy === "enddate-asc") {
        const aDate =
          getEffectiveEndDate(a);

        const bDate =
          getEffectiveEndDate(b);

        const aTime =
          aDate?.getTime() ??
          Number.POSITIVE_INFINITY;

        const bTime =
          bDate?.getTime() ??
          Number.POSITIVE_INFINITY;

        return aTime - bTime;
      }

      /* KT HỢP ĐỒNG: XA → GẦN */

      if (filters.sortBy === "enddate-desc") {
        const aDate =
          getEffectiveEndDate(a);

        const bDate =
          getEffectiveEndDate(b);

        const aTime =
          aDate?.getTime() ??
          Number.NEGATIVE_INFINITY;

        const bTime =
          bDate?.getTime() ??
          Number.NEGATIVE_INFINITY;

        return bTime - aTime;
      }

      /* ---------------------------------------------------
         ƯU TIÊN QUẢN LÝ
      --------------------------------------------------- */

      const warningA =
        getContractWarning(a);

      const warningB =
        getContractWarning(b);

      const priorityDifference =
        getWarningPriority(warningA) -
        getWarningPriority(warningB);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      /* Nếu cùng cảnh báo:
         hợp đồng còn ít ngày hơn lên trước */

      const aDays =
        getRemainingDays(a) ??
        Number.POSITIVE_INFINITY;

      const bDays =
        getRemainingDays(b) ??
        Number.POSITIVE_INFINITY;

      if (aDays !== bDays) {
        return aDays - bDays;
      }

      return a.stt - b.stt;
    });
  }, [contracts, filters]);

  /* =======================================================
     RESET FILTER
  ======================================================= */

  function resetFilters() {
    setFilters(initialFilters);
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="min-h-full bg-slate-100">
      

      <div className="flex">
        

        <main className="min-w-0 flex-1 p-3">
          <div className="mx-auto max-w-[2000px]">
            {/* PAGE HEADER */}

            <div className="mb-3">
              <h1 className="text-xl font-bold text-slate-900">
                Hợp đồng
              </h1>

              <p className="mt-0.5 text-[11px] text-slate-500">
                Quản lý và theo dõi các hợp đồng dịch vụ kỹ thuật.
              </p>
            </div>

            {error && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                Không tải được dữ liệu tập trung: {error}
              </div>
            )}

            {/* KPI */}

            <ContractSummary
              contracts={contracts}
            />

            {/* FILTER */}

            <div className="mt-2.5">
              <ContractFilters
                filters={filters}
                leadDepartments={
                  leadDepartments
                }
                participantDepartments={
                  participantDepartments
                }
                resultCount={
                  filteredContracts.length
                }
                totalCount={
                  contracts.length
                }
                onChange={setFilters}
                onReset={resetFilters}
              />
            </div>

            {/* TABLE */}

            <div className="mt-2.5">
              <ContractTable
                contracts={filteredContracts}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
