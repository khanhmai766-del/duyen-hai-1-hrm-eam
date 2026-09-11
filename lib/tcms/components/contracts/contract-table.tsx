import Link from "next/link";

import { Contract } from "@/lib/tcms/types/contract";
import {
  formatDate,
  formatRemainingDays,
  getContractWarning,
} from "@/lib/tcms/lib/contract-utils";

interface ContractTableProps {
  contracts: Contract[];
}

function WarningBadge({ warning }: { warning: string }) {
  const styles: Record<string, string> = {
    "Bình thường": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Theo dõi": "bg-blue-50 text-blue-700 border-blue-200",
    "Sắp hết hạn": "bg-amber-50 text-amber-700 border-amber-200",
    Khẩn: "bg-orange-50 text-orange-700 border-orange-200",
    "Đã hết hạn": "bg-red-50 text-red-700 border-red-200",
    "Đã hoàn thành": "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
        styles[warning] ?? "border-slate-200 bg-slate-100 text-slate-700"
      }`}
    >
      {warning}
    </span>
  );
}

export function ContractTable({ contracts }: ContractTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* ==================== TIÊU ĐỀ ==================== */}
      <div className="border-b border-slate-200 px-3 py-2">
        <h2 className="text-[13px] font-semibold text-slate-900">
          Sổ theo dõi hợp đồng
        </h2>

        <p className="mt-0.5 text-[9px] text-slate-500">
          Hiển thị tổng quan. Bấm vào số hợp đồng hoặc nội dung rút gọn để xem
          thông tin đầy đủ.
        </p>
      </div>

      {/* ==================== TABLE ==================== */}
      <div className="overflow-x-auto">
        <table className="min-w-[1900px] table-fixed border-collapse text-left text-[10px] leading-[1.25] text-slate-700">
          {/* ==================== HEADER ==================== */}
          <thead className="bg-slate-50 text-[9px] font-semibold uppercase leading-[1.2] text-slate-500">
            <tr>
              {/* STT */}
              <th className="sticky left-0 z-30 w-[28px] border-r border-slate-200 bg-slate-50 px-1 py-2 text-center align-middle">
                STT
              </th>

              {/* SỐ HỢP ĐỒNG */}
              <th className="sticky left-[28px] z-30 w-[112px] border-r-2 border-slate-300 bg-slate-50 px-1.5 py-2 text-center align-middle">
                <span className="block">
                  Số
                  <br />
                  hợp đồng
                </span>
              </th>

              {/* GÓI THẦU */}
              <th className="w-[205px] border-r border-slate-200 px-1.5 py-2 text-center align-middle">
                Gói thầu
              </th>

              {/* ĐƠN VỊ THỰC HIỆN */}
              <th className="w-[112px] border-r border-slate-200 px-1.5 py-2 text-center align-middle">
                <span className="block">
                  Đơn vị
                  <br />
                  thực hiện
                </span>
              </th>

              {/* NHÂN SỰ GIÁM SÁT */}
              <th className="w-[175px] border-r border-slate-200 px-1.5 py-2 text-center align-middle">
                <span className="block">
                  Nhân sự
                  <br />
                  giám sát
                </span>
              </th>

              {/* ĐẠI DIỆN NHÀ THẦU */}
              <th className="w-[76px] border-r border-slate-200 px-1.5 py-2 text-center align-middle">
                <span className="block">
                  Đại diện
                  <br />
                  NT
                </span>
              </th>

              {/* NGÀY GIAO HỢP ĐỒNG */}
              <th className="w-[92px] border-r border-slate-200 px-1.5 py-2 text-center align-middle">
                <span className="block">
                  Ngày giao
                  <br />
                  HĐ
                </span>
              </th>

              {/* THỜI GIAN THỰC HIỆN */}
              <th className="w-[58px] border-r border-slate-200 px-1 py-2 text-center align-middle">
                <span className="block">
                  TG thực
                  <br />
                  hiện
                </span>
              </th>

              {/* THỜI GIAN DỊCH VỤ */}
              <th className="w-[68px] border-r border-slate-200 px-1 py-2 text-center align-middle">
                <span className="block">
                  TG dịch
                  <br />
                  vụ
                </span>
              </th>

              {/* BẮT ĐẦU HỢP ĐỒNG */}
              <th className="w-[66px] border-r border-slate-200 px-1 py-2 text-center align-middle">
                <span className="block">
                  Bắt đầu
                  <br />
                  HĐ
                </span>
              </th>

              {/* BÀN GIAO MẶT BẰNG */}
              <th className="w-[68px] border-r border-slate-200 px-1 py-2 text-center align-middle">
                <span className="block">
                  Bàn giao
                  <br />
                  MB
                </span>
              </th>

              {/* KẾT THÚC GIAO HÀNG */}
              <th className="w-[70px] border-r border-slate-200 px-1 py-2 text-center align-middle">
                <span className="block">
                  KT giao
                  <br />
                  hàng
                </span>
              </th>

              {/* KẾT THÚC DỊCH VỤ */}
              <th className="w-[68px] border-r border-slate-200 px-1 py-2 text-center align-middle">
                <span className="block">
                  KT dịch
                  <br />
                  vụ
                </span>
              </th>

              {/* KẾT THÚC HỢP ĐỒNG */}
              <th className="w-[70px] border-r border-slate-200 px-1 py-2 text-center align-middle">
                <span className="block">
                  KT hợp
                  <br />
                  đồng
                </span>
              </th>

              {/* GIA HẠN */}
              <th className="w-[44px] border-r border-slate-200 px-1 py-2 text-center align-middle">
                <span className="block">
                  Gia
                  <br />
                  hạn
                </span>
              </th>

              {/* GIA HẠN ĐẾN */}
              <th className="w-[68px] border-r border-slate-200 px-1 py-2 text-center align-middle">
                <span className="block">
                  Gia hạn
                  <br />
                  đến
                </span>
              </th>

              {/* MỜI TRIỂN KHAI */}
              <th className="w-[70px] border-r border-slate-200 px-1 py-2 text-center align-middle">
                <span className="block">
                  Mời
                  <br />
                  triển khai
                </span>
              </th>

              {/* HOÀN THÀNH */}
              <th className="w-[72px] border-r border-slate-200 px-1 py-2 text-center align-middle">
                <span className="block">
                  Hoàn
                  <br />
                  thành
                </span>
              </th>

              {/* TIẾN ĐỘ */}
              <th className="w-[125px] border-r border-slate-200 px-1.5 py-2 text-center align-middle">
                <span className="block">
                  Tiến độ
                  <br />
                  thực hiện
                </span>
              </th>

              {/* GHI NHẬN KL/CP */}
              <th className="w-[112px] border-r border-slate-200 px-1.5 py-2 text-center align-middle">
                <span className="block">
                  Ghi nhận
                  <br />
                  KL / CP
                </span>
              </th>

              {/* CÒN LẠI */}
              <th className="w-[60px] border-r border-slate-200 px-1 py-2 text-center align-middle">
                <span className="block">
                  Còn
                  <br />
                  lại
                </span>
              </th>

              {/* CẢNH BÁO */}
              <th className="w-[76px] border-r border-slate-200 px-1 py-2 text-center align-middle">
                Cảnh báo
              </th>

              {/* THANH TOÁN */}
              <th className="w-[92px] border-r border-slate-200 px-1.5 py-2 text-center align-middle">
                <span className="block">
                  Thanh toán
                  <br />
                  / QT
                </span>
              </th>

              {/* BGĐ CHỈ ĐẠO - GIỮ CUỐI */}
              <th className="w-[110px] px-1.5 py-2 text-center align-middle">
                <span className="block">
                  BGĐ
                  <br />
                  chỉ đạo
                </span>
              </th>
            </tr>
          </thead>

          {/* ==================== BODY ==================== */}
          <tbody className="divide-y divide-slate-200">
            {contracts.map((contract) => {
              const warning = getContractWarning(contract);

              const visibleSupervisors = contract.supervisors.slice(0, 2);

              const hiddenSupervisorCount = Math.max(
                contract.supervisors.length - visibleSupervisors.length,
                0
              );

              return (
                <tr
                  key={contract.id}
                  className="align-top transition-colors hover:bg-slate-50"
                >
                  {/* STT */}
                  <td className="sticky left-0 z-20 border-r border-slate-200 bg-white px-1 py-1.5 text-center">
                    {contract.stt}
                  </td>

                  {/* SỐ HỢP ĐỒNG */}
                  <td className="sticky left-[28px] z-20 border-r-2 border-slate-300 bg-white px-1.5 py-1.5 font-semibold">
                    <Link
                      href={`/documents/contracts/list/${contract.id}`}
                      className="text-blue-700 hover:text-blue-900 hover:underline"
                      title="Xem chi tiết hợp đồng"
                    >
                      {contract.contractNumber}
                    </Link>
                  </td>

                  {/* GÓI THẦU */}
                  <td className="border-r border-slate-200 px-1.5 py-1.5">
                    <Link
                      href={`/documents/contracts/list/${contract.id}`}
                      className="block text-slate-800 hover:text-blue-700"
                      title={contract.packageName}
                    >
                      <p className="line-clamp-3">{contract.packageName}</p>
                    </Link>
                  </td>

                  {/* ĐƠN VỊ THỰC HIỆN */}
                  <td className="border-r border-slate-200 px-1.5 py-1.5">
                    <Link
                      href={`/documents/contracts/list/${contract.id}`}
                      className="block font-medium text-slate-800 hover:text-blue-700"
                      title={contract.contractorName}
                    >
                      <p className="line-clamp-2">{contract.contractorName}</p>
                    </Link>
                  </td>

                  {/* =========================================
                      NHÂN SỰ GIÁM SÁT
                      TÊN + ĐƠN VỊ + CT TRÊN CÙNG 1 HÀNG
                     ========================================= */}
                  <td className="border-r border-slate-200 px-1.5 py-1.5">
                    <div className="space-y-0.5">
                      {visibleSupervisors.map((supervisor) => {
                        const isLeadDepartment =
                          supervisor.department === contract.leadDepartment;

                        return (
                          <div
                            key={supervisor.id}
                            className="flex min-w-0 items-center gap-1 whitespace-nowrap"
                            title={`${supervisor.fullName} - ${
                              supervisor.department
                            }${
                              isLeadDepartment ? " - Đơn vị chủ trì" : ""
                            }`}
                          >
                            {/* TÊN - LUÔN MÀU ĐEN */}
                            <span className="min-w-0 truncate font-medium text-slate-800">
                              {supervisor.fullName}
                            </span>

                            <span className="shrink-0 text-slate-300">·</span>

                            {/* ĐƠN VỊ */}
                            <span
                              className={`shrink-0 text-[9px] ${
                                isLeadDepartment
                                  ? "font-bold text-red-600"
                                  : "text-slate-400"
                              }`}
                            >
                              {supervisor.department}
                            </span>

                            {/* BADGE CT */}
                            {isLeadDepartment && (
                              <span className="shrink-0 rounded border border-red-200 bg-red-50 px-1 py-px text-[7px] font-bold leading-[10px] text-red-600">
                                CT
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {hiddenSupervisorCount > 0 && (
                        <Link
                          href={`/documents/contracts/list/${contract.id}`}
                          className="inline-flex rounded bg-blue-50 px-1.5 py-0.5 text-[8px] font-semibold text-blue-600 hover:bg-blue-100 hover:underline"
                          title="Xem toàn bộ nhân sự giám sát"
                        >
                          +{hiddenSupervisorCount} người
                        </Link>
                      )}
                    </div>
                  </td>

                  {/* ĐẠI DIỆN NHÀ THẦU */}
                  <td className="border-r border-slate-200 px-1.5 py-1.5 text-center">
                    <p
                      className="line-clamp-2"
                      title={contract.contractorRepresentative ?? ""}
                    >
                      {contract.contractorRepresentative ?? "-"}
                    </p>
                  </td>

                  {/* NGÀY GIAO HỢP ĐỒNG */}
                  <td className="border-r border-slate-200 px-1.5 py-1.5 text-center">
                    <p
                      className="line-clamp-2"
                      title={contract.handoverDocument ?? ""}
                    >
                      {contract.handoverDocument ?? "-"}
                    </p>

                    {contract.handoverDate && (
                      <p className="mt-0.5 text-[9px] text-slate-500">
                        {formatDate(contract.handoverDate)}
                      </p>
                    )}
                  </td>

                  {/* THỜI GIAN THỰC HIỆN */}
                  <td className="border-r border-slate-200 px-1 py-1.5 text-center">
                    {contract.contractDurationDays
                      ? `${contract.contractDurationDays} ngày`
                      : "-"}
                  </td>

                  {/* THỜI GIAN DỊCH VỤ */}
                  <td className="border-r border-slate-200 px-1 py-1.5 text-center">
                    <p
                      className="line-clamp-3"
                      title={contract.serviceDurationText ?? ""}
                    >
                      {contract.serviceDurationText ?? "-"}
                    </p>
                  </td>

                  {/* BẮT ĐẦU HỢP ĐỒNG */}
                  <td className="border-r border-slate-200 px-1 py-1.5 text-center">
                    {formatDate(contract.contractStartDate)}
                  </td>

                  {/* BÀN GIAO MẶT BẰNG */}
                  <td className="border-r border-slate-200 px-1 py-1.5 text-center">
                    {formatDate(contract.siteHandoverDate)}
                  </td>

                  {/* KẾT THÚC GIAO HÀNG */}
                  <td className="border-r border-slate-200 px-1 py-1.5 text-center">
                    {formatDate(contract.goodsEndDate)}
                  </td>

                  {/* KẾT THÚC DỊCH VỤ */}
                  <td className="border-r border-slate-200 px-1 py-1.5 text-center">
                    {formatDate(contract.serviceEndDate)}
                  </td>

                  {/* KẾT THÚC HỢP ĐỒNG */}
                  <td className="border-r border-slate-200 px-1 py-1.5 text-center">
                    {formatDate(contract.contractEndDate)}
                  </td>

                  {/* GIA HẠN */}
                  <td className="border-r border-slate-200 px-1 py-1.5 text-center">
                    {contract.isExtended ? "Có" : "-"}
                  </td>

                  {/* GIA HẠN ĐẾN */}
                  <td className="border-r border-slate-200 px-1 py-1.5 text-center">
                    {formatDate(contract.extendedUntil)}
                  </td>

                  {/* MỜI TRIỂN KHAI */}
                  <td className="border-r border-slate-200 px-1 py-1.5 text-center">
                    {formatDate(contract.implementationInvitationDate)}
                  </td>

                  {/* HOÀN THÀNH */}
                  <td className="border-r border-slate-200 px-1 py-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <div className="h-1.5 w-6 shrink-0 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full bg-slate-800"
                          style={{
                            width: `${Math.min(
                              Math.max(contract.progressPercent, 0),
                              100
                            )}%`,
                          }}
                        />
                      </div>

                      <span className="whitespace-nowrap font-medium">
                        {contract.progressPercent}%
                      </span>
                    </div>
                  </td>

                  {/* TIẾN ĐỘ THỰC HIỆN */}
                  <td className="border-r border-slate-200 px-1.5 py-1.5">
                    <Link
                      href={`/documents/contracts/list/${contract.id}`}
                      className="block text-slate-700 hover:text-blue-700 hover:underline"
                      title={contract.progressNote ?? "Xem chi tiết tiến độ"}
                    >
                      <p className="line-clamp-2">
                        {contract.progressNote ?? "-"}
                      </p>
                    </Link>
                  </td>

                  {/* GHI NHẬN KL / CP */}
                  <td className="border-r border-slate-200 px-1.5 py-1.5">
                    <Link
                      href={`/documents/contracts/list/${contract.id}`}
                      className="block text-slate-700 hover:text-blue-700 hover:underline"
                      title={contract.costNote ?? "Xem chi tiết ghi nhận"}
                    >
                      <p className="line-clamp-2">
                        {contract.costNote ?? "-"}
                      </p>
                    </Link>
                  </td>

                  {/* CÒN LẠI */}
                  <td className="border-r border-slate-200 px-1 py-1.5 text-center font-medium">
                    {formatRemainingDays(contract)}
                  </td>

                  {/* CẢNH BÁO */}
                  <td className="border-r border-slate-200 px-1 py-1.5 text-center">
                    <WarningBadge warning={warning} />
                  </td>

                  {/* THANH TOÁN / QUYẾT TOÁN */}
                  <td className="border-r border-slate-200 px-1.5 py-1.5 text-center">
                    <p
                      className="line-clamp-2"
                      title={contract.paymentSettlementStatus ?? ""}
                    >
                      {contract.paymentSettlementStatus ?? "-"}
                    </p>
                  </td>

                  {/* BGĐ CHỈ ĐẠO */}
                  <td className="px-1.5 py-1.5">
                    <Link
                      href={`/documents/contracts/list/${contract.id}`}
                      className="block text-slate-700 hover:text-blue-700 hover:underline"
                      title={
                        contract.managementDirection ??
                        "Xem chi tiết chỉ đạo"
                      }
                    >
                      <p className="line-clamp-2">
                        {contract.managementDirection || "-"}
                      </p>
                    </Link>
                  </td>
                </tr>
              );
            })}

            {/* ==================== KHÔNG CÓ DỮ LIỆU ==================== */}
            {contracts.length === 0 && (
              <tr>
                <td
                  colSpan={24}
                  className="px-4 py-8 text-center text-xs text-slate-500"
                >
                  Không có hợp đồng phù hợp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}