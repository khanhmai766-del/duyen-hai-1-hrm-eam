"use client";

import Link from "next/link";


import { useContracts } from "@/lib/tcms/components/contracts/contract-store";
import { ContractItemsSection } from "@/lib/tcms/components/contracts/contract-items-section";
import { ContractGoodsItemsSection } from "@/lib/tcms/components/contracts/contract-goods-items-section";
import { ContractStructureSection } from "@/lib/tcms/components/contracts/contract-structure-section";
import {
  formatDate,
  formatRemainingDays,
  getContractWarning,
  getEffectiveEndDate,
} from "@/lib/tcms/lib/contract-utils";
import type { Contract, ContractStatus } from "@/lib/tcms/types/contract";

type ContractDetailPageProps = {
  params: { id: string };
};

const statusLabels: Record<ContractStatus, string> = {
  DRAFT: "Dự thảo",
  ACTIVE: "Có hiệu lực",
  IN_PROGRESS: "Đang thực hiện",
  TECHNICAL_COMPLETION: "Hoàn thành kỹ thuật",
  COMPLETED: "Đã hoàn thành",
  CLOSED: "Đã đóng",
  SUSPENDED: "Tạm dừng",
  CANCELLED: "Đã hủy",
};

const warningStyles: Record<string, string> = {
  "Bình thường": "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Theo dõi": "border-blue-200 bg-blue-50 text-blue-700",
  "Sắp hết hạn": "border-amber-200 bg-amber-50 text-amber-700",
  Khẩn: "border-orange-200 bg-orange-50 text-orange-700",
  "Đã hết hạn": "border-red-200 bg-red-50 text-red-700",
  "Đã hoàn thành": "border-slate-200 bg-slate-100 text-slate-700",
};

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {description && (
          <p className="mt-0.5 text-[10px] text-slate-500">{description}</p>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function InfoItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-line text-[11px] leading-5 text-slate-800">
        {value || "Chưa cập nhật"}
      </dd>
    </div>
  );
}

function TimelineItem({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value?: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        emphasized
          ? "border-blue-200 bg-blue-50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-xs font-semibold ${
          emphasized ? "text-blue-700" : "text-slate-800"
        }`}
      >
        {formatDate(value)}
      </p>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
      <p className="mt-1 text-[9px] text-slate-500">{note}</p>
    </div>
  );
}

function ProgressBar({ contract }: { contract: Contract }) {
  const progress = Math.min(Math.max(contract.progressPercent, 0), 100);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[10px]">
        <span className="font-medium text-slate-600">Mức độ hoàn thành</span>
        <span className="font-bold text-slate-900">{progress}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-blue-700"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function ContractDetailState({
  title,
  description,
  showBackLink = false,
}: {
  title: string;
  description: string;
  showBackLink?: boolean;
}) {
  return (
    <div className="min-h-full bg-slate-100">
      
      <div className="flex">
        
        <main className="flex min-h-[calc(100vh-52px)] min-w-0 flex-1 items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">{title}</h1>
            <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
            {showBackLink && (
              <Link
                href="/documents/contracts/list"
                className="mt-5 inline-flex h-9 items-center rounded-lg bg-blue-700 px-4 text-[11px] font-semibold text-white hover:bg-blue-800"
              >
                Quay lại danh sách hợp đồng
              </Link>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ContractDetailPage({
  params,
}: ContractDetailPageProps) {
  const { id } = params;
  const { ready, getContract, refresh, canEdit, error } = useContracts();
  const contract = getContract(id);
  if (error) return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;

  if (!ready) {
    return (
      <ContractDetailState
        title="Đang tải hợp đồng"
        description="Hệ thống đang đọc dữ liệu từ cơ sở dữ liệu tập trung."
      />
    );
  }

  if (!contract) {
    return (
      <ContractDetailState
        title="Không tìm thấy hợp đồng"
        description="Hợp đồng có thể đã bị xóa, đổi mã hoặc đường dẫn không còn chính xác."
        showBackLink
      />
    );
  }

  const warning = getContractWarning(contract);
  const effectiveEndDate = getEffectiveEndDate(contract);

  return (
    <div className="min-h-full bg-slate-100">
      

      <div className="flex">
        

        <main className="min-w-0 flex-1 p-3 sm:p-4">
          <div className="mx-auto max-w-[1600px]">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
              <Link href="/documents/contracts" className="hover:text-blue-700">
                Tổng quan
              </Link>
              <span>/</span>
              <Link href="/documents/contracts/list" className="hover:text-blue-700">
                Hợp đồng
              </Link>
              <span>/</span>
              <span className="font-medium text-slate-700">
                {contract.contractNumber}
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-1 text-[9px] font-bold ${
                        warningStyles[warning] ?? warningStyles["Theo dõi"]
                      }`}
                    >
                      {warning}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-600">
                      {statusLabels[contract.status]}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Mã hồ sơ: {contract.id}
                    </span>
                  </div>

                  <h1 className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">
                    {contract.contractNumber}
                  </h1>
                  <p className="mt-2 max-w-5xl text-xs leading-5 text-slate-600">
                    {contract.packageName}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {canEdit && <Link
                    href={`/documents/contracts/list/${contract.id}/edit`}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-700 px-3 text-[11px] font-semibold text-white transition hover:bg-blue-800"
                  >
                    Chỉnh sửa hợp đồng
                  </Link>}
                  <Link
                    href="/documents/contracts/list"
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    ← Quay lại danh sách
                  </Link>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <ProgressBar contract={contract} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryMetric
                label="Còn lại"
                value={formatRemainingDays(contract)}
                note="Tính đến thời hạn hiệu lực hiện tại"
              />
              <SummaryMetric
                label="Ngày kết thúc hiệu lực"
                value={
                  effectiveEndDate
                    ? formatDate(effectiveEndDate)
                    : "Chưa xác định"
                }
                note={contract.isExtended ? "Đã áp dụng thời hạn gia hạn" : "Theo hợp đồng"}
              />
              <SummaryMetric
                label="Đơn vị chủ trì"
                value={contract.leadDepartment}
                note={`${contract.supervisors.length} nhân sự giám sát`}
              />
              <SummaryMetric
                label="Thanh toán / quyết toán"
                value={contract.paymentSettlementStatus || "Chưa cập nhật"}
                note="Trạng thái hồ sơ tài chính"
              />
            </div>

            <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
              <div className="space-y-3">
                <SectionCard
                  title="Thông tin hợp đồng"
                  description="Thông tin nhận diện, phạm vi và bàn giao hợp đồng."
                >
                  <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    <InfoItem label="Số hợp đồng" value={contract.contractNumber} />
                    <InfoItem label="Đơn vị chủ trì" value={contract.leadDepartment} />
                    <InfoItem label="Tên gói thầu" value={contract.packageName} wide />
                    <InfoItem label="Văn bản giao hợp đồng" value={contract.handoverDocument} />
                    <InfoItem label="Ngày giao hợp đồng" value={formatDate(contract.handoverDate)} />
                    <InfoItem label="Ngày ký hợp đồng" value={formatDate(contract.signedDate)} />
                    <InfoItem
                      label="Tổng thời gian hợp đồng"
                      value={
                        contract.contractDurationDays != null
                          ? `${contract.contractDurationDays} ngày`
                          : undefined
                      }
                    />
                    <InfoItem
                      label="Thời gian cung cấp dịch vụ"
                      value={contract.serviceProvisionDurationDays != null ? `${contract.serviceProvisionDurationDays} ngày` : undefined}
                    />
                    <InfoItem
                      label="Thời gian thực hiện theo đơn vị / phạm vi"
                      value={contract.unitExecutionDurationDays != null
                        ? `${contract.unitExecutionDurationDays} ngày${contract.unitExecutionContinuous ? " liên tục" : ""}`
                        : undefined}
                    />
                    <InfoItem label="Mốc bắt đầu thời gian thực hiện" value={contract.unitExecutionTriggerText} />
                    <InfoItem label="Điều khoản thời gian dịch vụ" value={contract.serviceDurationText} wide />
                    <InfoItem label="Điều kiện có hiệu lực" value={contract.effectiveConditionText} wide />
                  </dl>
                </SectionCard>

                <ContractStructureSection contractId={contract.id} />

                <ContractItemsSection contractId={contract.id} onContractChanged={refresh} />

                <ContractGoodsItemsSection contractId={contract.id} />

                <SectionCard
                  title="Các mốc thời gian"
                  description="Theo dõi các mốc triển khai, bàn giao và kết thúc."
                >
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <TimelineItem label="Ngày ký hợp đồng" value={contract.signedDate} />
                    <TimelineItem label="Mời triển khai" value={contract.implementationInvitationDate} />
                    <TimelineItem label="Hiệu lực / bắt đầu thực tế" value={contract.contractStartDate} />
                    <TimelineItem label="Bàn giao mặt bằng" value={contract.siteHandoverDate} />
                    <TimelineItem label="Kết thúc giao hàng" value={contract.goodsEndDate} />
                    <TimelineItem label="Kết thúc dịch vụ" value={contract.serviceEndDate} />
                    <TimelineItem label="Kết thúc hợp đồng" value={contract.contractEndDate} />
                    {contract.isExtended && (
                      <TimelineItem
                        label="Gia hạn đến"
                        value={contract.extendedUntil}
                        emphasized
                      />
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Theo dõi thực hiện"
                  description="Tiến độ, khối lượng và chỉ đạo trong quá trình thực hiện."
                >
                  <div className="space-y-4">
                    <ProgressBar contract={contract} />
                    <dl className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                      <InfoItem label="Ghi nhận tiến độ" value={contract.progressNote} wide />
                      <InfoItem label="Ghi nhận khối lượng / chi phí" value={contract.costNote} />
                      <InfoItem label="Chỉ đạo quản lý" value={contract.managementDirection} />
                    </dl>
                  </div>
                </SectionCard>
              </div>

              <div className="space-y-3">
                <SectionCard title="Nhà thầu / đơn vị thực hiện">
                  <dl className="space-y-4">
                    <InfoItem label="Tên nhà thầu" value={contract.contractorName} />
                    <InfoItem label="Đại diện" value={contract.contractorRepresentative} />
                    <InfoItem label="Số điện thoại" value={contract.contractorPhone} />
                    <InfoItem label="Địa chỉ" value={contract.contractorAddress} />
                  </dl>
                </SectionCard>

                <SectionCard
                  title="Nhân sự giám sát"
                  description={`${contract.supervisors.length} nhân sự được phân công.`}
                >
                  <div className="space-y-2">
                    {contract.supervisors.map((supervisor) => {
                      const isLead = supervisor.department === contract.leadDepartment;

                      return (
                        <div
                          key={supervisor.id}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[11px] font-bold text-slate-800">
                                {supervisor.fullName}
                              </p>
                              <p className="mt-0.5 text-[9px] text-slate-500">
                                {supervisor.role || "Giám sát"}
                              </p>
                            </div>
                            {isLead && (
                              <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[8px] font-bold text-red-600">
                                CHỦ TRÌ
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-[9px] font-semibold text-slate-600">
                            {supervisor.department}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>

                <SectionCard title="Hồ sơ / tài liệu">
                  {contract.googleDriveFolderUrl ? (
                    <a
                      href={contract.googleDriveFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      <span>Mở thư mục hồ sơ hợp đồng</span>
                      <span>↗</span>
                    </a>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center">
                      <p className="text-[11px] font-semibold text-slate-600">
                        Chưa liên kết thư mục hồ sơ
                      </p>
                      <p className="mt-1 text-[9px] leading-4 text-slate-400">
                        Đường dẫn Google Drive sẽ hiển thị tại đây sau khi được cấu hình.
                      </p>
                    </div>
                  )}
                </SectionCard>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
