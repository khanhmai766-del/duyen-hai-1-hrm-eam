import { Contract } from "@/lib/tcms/types/contract";
import { getContractWarning } from "@/lib/tcms/lib/contract-utils";

interface ContractSummaryProps {
  contracts: Contract[];
}

type SummaryCardProps = {
  title: string;
  value: number;
  description: string;
  valueClassName: string;
  cardClassName: string;
  iconClassName: string;
  icon: string;
};

function SummaryCard({
  title,
  value,
  description,
  valueClassName,
  cardClassName,
  iconClassName,
  icon,
}: SummaryCardProps) {
  return (
    <div
      className={[
        "relative min-w-0 overflow-hidden rounded-xl border px-4 py-3",
        "transition-all duration-150 hover:-translate-y-[1px] hover:shadow-sm",
        cardClassName,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        {/* NỘI DUNG */}
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-600">
            {title}
          </p>

          <p
            className={[
              "mt-1.5 text-[36px] font-bold leading-none tracking-tight",
              valueClassName,
            ].join(" ")}
          >
            {value}
          </p>

          <p className="mt-2 truncate text-[11px] font-medium text-slate-500">
            {description}
          </p>
        </div>

        {/* ICON */}
        <div
          className={[
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
            "text-[18px] font-semibold",
            iconClassName,
          ].join(" ")}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export function ContractSummary({
  contracts,
}: ContractSummaryProps) {
  const totalContracts = contracts.length;

  const activeContracts = contracts.filter(
    (contract) =>
      contract.status === "ACTIVE" ||
      contract.status === "IN_PROGRESS" ||
      contract.status === "TECHNICAL_COMPLETION"
  ).length;

  const expiringContracts = contracts.filter((contract) => {
    const warning = getContractWarning(contract);

    return (
      warning === "Sắp hết hạn" ||
      warning === "Khẩn"
    );
  }).length;

  const overdueContracts = contracts.filter(
    (contract) =>
      getContractWarning(contract) === "Đã hết hạn"
  ).length;

  return (
    <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
      {/* TỔNG HỢP ĐỒNG */}
      <SummaryCard
        title="Tổng hợp đồng"
        value={totalContracts}
        description="Hợp đồng đang quản lý"
        valueClassName="text-slate-900"
        cardClassName="border-slate-200 bg-white"
        iconClassName="border-slate-200 bg-slate-50 text-slate-600"
        icon="▤"
      />

      {/* ĐANG THỰC HIỆN */}
      <SummaryCard
        title="Đang thực hiện"
        value={activeContracts}
        description="Hợp đồng đang triển khai"
        valueClassName="text-blue-700"
        cardClassName="border-blue-100 bg-blue-50/50"
        iconClassName="border-blue-100 bg-white/80 text-blue-600"
        icon="⌁"
      />

      {/* SẮP HẾT HẠN */}
      <SummaryCard
        title="Sắp hết hạn"
        value={expiringContracts}
        description="Cần theo dõi tiến độ"
        valueClassName="text-amber-700"
        cardClassName="border-amber-100 bg-amber-50/60"
        iconClassName="border-amber-100 bg-white/80 text-amber-600"
        icon="◷"
      />

      {/* QUÁ HẠN */}
      <SummaryCard
        title="Quá hạn"
        value={overdueContracts}
        description="Chưa hoàn thành đúng hạn"
        valueClassName="text-red-700"
        cardClassName="border-red-100 bg-red-50/60"
        iconClassName="border-red-100 bg-white/80 text-red-600"
        icon="!"
      />
    </div>
  );
}