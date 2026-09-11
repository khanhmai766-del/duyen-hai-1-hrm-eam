"use client";
import { useTcmsTransport } from "@/hooks/use-tcms";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { ContractCreatePdfImport } from "@/lib/tcms/components/contracts/contract-create-pdf-import";
import { VietnameseDateInput } from "@/lib/tcms/components/contracts/vietnamese-date-input";
import { useContracts, type ContractInput } from "@/lib/tcms/components/contracts/contract-store";
import type { ContractFormImportDraft, PendingContractPdfImport } from "@/lib/tcms/types/contract-create-import";
import type { Contract, ContractStatus, Supervisor } from "@/lib/tcms/types/contract";
import type { Contractor } from "@/lib/tcms/types/contractor";

type ContractFormProps =
  | { mode: "create"; contractId?: never }
  | { mode: "edit"; contractId: string };

const statusOptions: Array<{ value: ContractStatus; label: string }> = [
  { value: "DRAFT", label: "Nháp" },
  { value: "ACTIVE", label: "Có hiệu lực" },
  { value: "IN_PROGRESS", label: "Đang thực hiện" },
  { value: "TECHNICAL_COMPLETION", label: "Hoàn thành kỹ thuật" },
  { value: "COMPLETED", label: "Đã hoàn thành" },
  { value: "CLOSED", label: "Đã đóng" },
  { value: "SUSPENDED", label: "Tạm dừng" },
  { value: "CANCELLED", label: "Đã hủy" },
];

const inputClassName =
  "mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[11px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100";

const textareaClassName =
  "mt-1 min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100";

function createBlankSupervisor(): Supervisor {
  return {
    id: `supervisor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fullName: "",
    department: "PXVH1",
    role: "Giám sát vận hành",
  };
}

function createBlankContract(): ContractInput {
  return {
    contractNumber: "",
    packageName: "",
    leadDepartment: "PXVH1",
    contractorId: undefined,
    contractorName: "",
    contractorAddress: "",
    contractorPhone: "",
    contractorRepresentative: "",
    supervisors: [createBlankSupervisor()],
    handoverDocument: "",
    handoverDate: "",
    signedDate: "",
    contractDurationDays: undefined,
    serviceProvisionDurationDays: undefined,
    serviceDurationText: "",
    unitExecutionDurationDays: undefined,
    unitExecutionContinuous: undefined,
    unitExecutionTriggerText: "",
    effectiveConditionText: "",
    contractStartDate: "",
    siteHandoverDate: "",
    goodsEndDate: "",
    serviceEndDate: "",
    contractEndDate: "",
    isExtended: false,
    extendedUntil: "",
    implementationInvitationDate: "",
    progressPercent: 0,
    progressNote: "",
    costNote: "",
    managementDirection: "",
    paymentSettlementStatus: "Chưa thanh toán",
    status: "DRAFT",
    googleDriveFolderUrl: "",
  };
}

function toContractInput(contract: Contract): ContractInput {
  const input: Partial<Contract> = { ...contract };
  delete input.id;
  delete input.stt;
  delete input.version;
  return input as ContractInput;
}

function optionalText(value?: string) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function Field({
  label,
  required = false,
  hint,
  children,
  wide = false,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : undefined}>
      <span className="text-[10px] font-semibold text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[9px] text-slate-400">{hint}</span>}
    </label>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-[10px] text-slate-500">{description}</p>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ContractEditor({
  mode,
  initialContract,
}: {
  mode: "create" | "edit";
  initialContract?: Contract;
}) {
  const request = useTcmsTransport();
  const router = useRouter();
  const { contracts, addContract, addContractWithItems, updateContract } = useContracts();
  const [draft, setDraft] = useState<ContractInput>(() =>
    initialContract ? toContractInput(initialContract) : createBlankContract()
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [pendingPdfImport, setPendingPdfImport] = useState<PendingContractPdfImport | null>(null);
  const [contractors, setContractors] = useState<Contractor[]>([]);

  useEffect(() => {
    let active = true;
    void request("/api/tcms/contractors", { cache:"no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({})) as { contractors?:Contractor[];message?:string };
      if (!response.ok) throw new Error(body.message ?? "Không thể tải danh mục nhà thầu.");
      if (active) setContractors(body.contractors ?? []);
    }).catch((reason) => { if (active) setErrors([reason instanceof Error ? reason.message : "Không thể tải danh mục nhà thầu."]); });
    return () => { active = false; };
  }, [request]);

  function updateField<K extends keyof ContractInput>(
    field: K,
    value: ContractInput[K]
  ) {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
  }

  function applyImportedContract(imported: ContractFormImportDraft) {
    const groundedFields = Object.fromEntries(
      Object.entries(imported).filter(([, value]) => value !== undefined),
    ) as Partial<ContractInput>;
    const matchedContractor = imported.contractorName
      ? contractors.find((item) => item.active && item.name.trim().toLocaleLowerCase("vi") === imported.contractorName!.trim().toLocaleLowerCase("vi"))
      : undefined;
    setDraft((currentDraft) => ({
      ...currentDraft,
      ...groundedFields,
      contractorId: matchedContractor?.id ?? currentDraft.contractorId,
      contractorName: matchedContractor?.name ?? groundedFields.contractorName ?? currentDraft.contractorName,
    }));
  }

  function selectContractor(contractorId:string) {
    const contractor=contractors.find((item)=>item.id===contractorId);
    if(!contractor){updateField("contractorId",undefined);return;}
    setDraft((current)=>({...current,contractorId:contractor.id,contractorName:contractor.name,
      contractorAddress:contractor.address??"",contractorPhone:contractor.phone??"",contractorRepresentative:contractor.representative??""}));
  }

  function updateSupervisor(
    supervisorId: string,
    field: "fullName" | "department" | "role",
    value: string
  ) {
    updateField(
      "supervisors",
      draft.supervisors.map((supervisor) =>
        supervisor.id === supervisorId
          ? { ...supervisor, [field]: value }
          : supervisor
      )
    );
  }

  function validate() {
    const validationErrors: string[] = [];
    const contractNumber = draft.contractNumber.trim();

    if (!contractNumber) validationErrors.push("Chưa nhập số hợp đồng.");
    if (!draft.packageName.trim()) validationErrors.push("Chưa nhập tên gói thầu.");
    if (!draft.leadDepartment.trim()) validationErrors.push("Chưa nhập đơn vị chủ trì.");
    if (!draft.contractorId) validationErrors.push("Chưa chọn nhà thầu/đơn vị thực hiện từ danh mục.");
    if (!draft.contractorName.trim()) validationErrors.push("Chưa nhập nhà thầu/đơn vị thực hiện.");

    const duplicate = contracts.some(
      (contract) =>
        contract.id !== initialContract?.id &&
        contract.contractNumber.trim().toLocaleLowerCase("vi") ===
          contractNumber.toLocaleLowerCase("vi")
    );

    if (duplicate) validationErrors.push("Số hợp đồng đã tồn tại trong hệ thống.");
    if (draft.progressPercent < 0 || draft.progressPercent > 100) {
      validationErrors.push("Tiến độ hoàn thành phải nằm trong khoảng 0 đến 100%.");
    }
    if (draft.isExtended && !draft.extendedUntil) {
      validationErrors.push("Hợp đồng đã gia hạn nhưng chưa nhập ngày gia hạn đến.");
    }

    if (pendingPdfImport) {
      if (!pendingPdfImport.items.length) validationErrors.push("Bản nháp PDF chưa có hạng mục để tạo.");
      if (pendingPdfImport.items.some((item) => !item.serviceDescription.trim())) {
        validationErrors.push("Mỗi hạng mục PDF phải có tên/nội dung.");
      }
      const totalWeight = pendingPdfImport.items.reduce((sum, item) => sum + (item.weightPercent ?? 0), 0);
      if (Math.abs(totalWeight - 100) > 0.005) {
        validationErrors.push("Tổng trọng số các hạng mục PDF phải bằng 100.00%.");
      }
    }

    const completeSupervisors = draft.supervisors.filter(
      (supervisor) => supervisor.fullName.trim() && supervisor.department.trim()
    );

    if (completeSupervisors.length === 0) {
      validationErrors.push("Cần có ít nhất một nhân sự giám sát.");
    }

    return validationErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validate();

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSaving(true);

    const input: ContractInput = {
      ...draft,
      contractNumber: draft.contractNumber.trim(),
      packageName: draft.packageName.trim(),
      leadDepartment: draft.leadDepartment.trim(),
      contractorName: draft.contractorName.trim(),
      contractorAddress: optionalText(draft.contractorAddress),
      contractorPhone: optionalText(draft.contractorPhone),
      contractorRepresentative: optionalText(draft.contractorRepresentative),
      handoverDocument: optionalText(draft.handoverDocument),
      handoverDate: optionalText(draft.handoverDate),
      signedDate: optionalText(draft.signedDate),
      serviceDurationText: optionalText(draft.serviceDurationText),
      unitExecutionTriggerText: optionalText(draft.unitExecutionTriggerText),
      effectiveConditionText: optionalText(draft.effectiveConditionText),
      contractStartDate: optionalText(draft.contractStartDate),
      siteHandoverDate: optionalText(draft.siteHandoverDate),
      goodsEndDate: optionalText(draft.goodsEndDate),
      serviceEndDate: optionalText(draft.serviceEndDate),
      contractEndDate: optionalText(draft.contractEndDate),
      extendedUntil: draft.isExtended ? optionalText(draft.extendedUntil) : undefined,
      implementationInvitationDate: optionalText(draft.implementationInvitationDate),
      progressNote: optionalText(draft.progressNote),
      costNote: optionalText(draft.costNote),
      managementDirection: optionalText(draft.managementDirection),
      paymentSettlementStatus: optionalText(draft.paymentSettlementStatus),
      googleDriveFolderUrl: optionalText(draft.googleDriveFolderUrl),
      supervisors: draft.supervisors
        .filter((supervisor) => supervisor.fullName.trim() && supervisor.department.trim())
        .map((supervisor) => ({
          ...supervisor,
          fullName: supervisor.fullName.trim(),
          department: supervisor.department.trim(),
          role: optionalText(supervisor.role),
        })),
    };

    let savedContract: Contract | undefined;
    try {
      savedContract = mode === "create"
        ? pendingPdfImport
          ? await addContractWithItems(input, pendingPdfImport)
          : await addContract(input)
        : await updateContract(initialContract!.id, input);
    } catch (saveError) {
      setErrors([saveError instanceof Error ? saveError.message : "Không thể lưu hợp đồng."]);
      setSaving(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (!savedContract) {
      setErrors(["Không thể lưu vì hợp đồng không còn tồn tại."]);
      setSaving(false);
      return;
    }

    router.push(`/documents/contracts/list/${savedContract.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-[11px] font-bold text-red-700">
            Cần kiểm tra lại thông tin trước khi lưu:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] text-red-600">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {mode === "create" && (
        <ContractCreatePdfImport
          onContractDraft={applyImportedContract}
          onImportChange={setPendingPdfImport}
        />
      )}

      <FormSection
        title="1. Thông tin nhận diện"
        description="Các trường chính để nhận diện và phân công quản lý hợp đồng."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Số hợp đồng" required>
            <input
              value={draft.contractNumber}
              onChange={(event) => updateField("contractNumber", event.target.value)}
              className={inputClassName}
              placeholder="Ví dụ: 203/HĐ-NĐDH.26"
            />
          </Field>
          <Field label="Đơn vị chủ trì" required>
            <input
              value={draft.leadDepartment}
              onChange={(event) => updateField("leadDepartment", event.target.value)}
              className={inputClassName}
              list="department-options"
              placeholder="Ví dụ: PXVH1"
            />
            <datalist id="department-options">
              <option value="PXVH1" />
              <option value="PXSCCN" />
              <option value="PXSCĐTĐ" />
              <option value="P.KTAT" />
              <option value="PAT" label="Phòng An toàn" />
            </datalist>
          </Field>
          <Field label="Tên gói thầu" required wide>
            <textarea
              value={draft.packageName}
              onChange={(event) => updateField("packageName", event.target.value)}
              className={textareaClassName}
              placeholder="Nhập đầy đủ tên gói thầu/phạm vi công việc"
            />
          </Field>
          <Field label="Văn bản giao hợp đồng">
            <input
              value={draft.handoverDocument ?? ""}
              onChange={(event) => updateField("handoverDocument", event.target.value)}
              className={inputClassName}
              placeholder="Số tờ trình/quyết định"
            />
          </Field>
          <Field label="Ngày giao hợp đồng">
            <VietnameseDateInput
              value={draft.handoverDate}
              onChange={(val) => updateField("handoverDate", val ?? "")}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="2. Nhà thầu / đơn vị thực hiện"
        description="Thông tin liên hệ phục vụ phối hợp và xử lý công việc."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nhà thầu/đơn vị" required wide>
            <select
              value={draft.contractorId ?? ""}
              onChange={(event) => selectContractor(event.target.value)}
              className={inputClassName}
            >
              <option value="">Chọn nhà thầu từ danh mục</option>
              {contractors.filter((item)=>item.active||item.id===draft.contractorId).map((item)=><option key={item.id} value={item.id}>{item.code} - {item.name}{item.active?"":" (ngừng sử dụng)"}</option>)}
            </select>
            {draft.contractorName&&<span className="mt-1 block text-[9px] text-slate-400">Tên lưu trên hợp đồng: {draft.contractorName}</span>}
          </Field>
          <Field label="Đại diện nhà thầu">
            <input
              value={draft.contractorRepresentative ?? ""}
              onChange={(event) => updateField("contractorRepresentative", event.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="Số điện thoại">
            <input
              type="tel"
              value={draft.contractorPhone ?? ""}
              onChange={(event) => updateField("contractorPhone", event.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="Địa chỉ" wide>
            <input
              value={draft.contractorAddress ?? ""}
              onChange={(event) => updateField("contractorAddress", event.target.value)}
              className={inputClassName}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="3. Thời gian và trạng thái"
        description="Các mốc được dùng để tính cảnh báo và thời gian còn lại."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Trạng thái">
            <select
              value={draft.status}
              onChange={(event) => updateField("status", event.target.value as ContractStatus)}
              className={inputClassName}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ngày ký hợp đồng">
            <VietnameseDateInput
              value={draft.signedDate}
              onChange={(val) => updateField("signedDate", val ?? "")}
            />
          </Field>
          <Field label="Tổng thời gian hợp đồng (ngày)">
            <input
              type="number"
              min="0"
              value={draft.contractDurationDays ?? ""}
              onChange={(event) =>
                updateField(
                  "contractDurationDays",
                  event.target.value ? Number(event.target.value) : undefined
                )
              }
              className={inputClassName}
            />
          </Field>
          <Field label="Thời gian cung cấp dịch vụ (ngày)">
            <input
              type="number"
              min="0"
              value={draft.serviceProvisionDurationDays ?? ""}
              onChange={(event) =>
                updateField(
                  "serviceProvisionDurationDays",
                  event.target.value ? Number(event.target.value) : undefined
                )
              }
              className={inputClassName}
            />
          </Field>
          <Field label="Thời gian thực hiện theo đơn vị/phạm vi (ngày, nếu có)">
            <input
              type="number"
              min="1"
              value={draft.unitExecutionDurationDays ?? ""}
              onChange={(event) =>
                updateField(
                  "unitExecutionDurationDays",
                  event.target.value ? Number(event.target.value) : undefined
                )
              }
              className={inputClassName}
            />
          </Field>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={draft.unitExecutionContinuous === true}
                onChange={(event) => updateField("unitExecutionContinuous", event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              Thời gian thực hiện liên tục
            </label>
          </div>
          <Field label="Mốc bắt đầu thời gian thực hiện (nếu có)" wide>
            <input
              value={draft.unitExecutionTriggerText ?? ""}
              onChange={(event) => updateField("unitExecutionTriggerText", event.target.value)}
              className={inputClassName}
              placeholder="Ví dụ: Kể từ ngày nhận bàn giao mặt bằng"
            />
          </Field>
          <Field label="Điều khoản thời gian dịch vụ (nguyên văn)" wide>
            <textarea
              value={draft.serviceDurationText ?? ""}
              onChange={(event) => updateField("serviceDurationText", event.target.value)}
              className={textareaClassName}
              placeholder="Giữ đầy đủ điều kiện thời gian trong hợp đồng"
            />
          </Field>
          <Field label="Điều kiện có hiệu lực" wide>
            <textarea
              value={draft.effectiveConditionText ?? ""}
              onChange={(event) => updateField("effectiveConditionText", event.target.value)}
              className={textareaClassName}
              placeholder="Ví dụ: Hai bên ký và nhà thầu nộp bảo đảm thực hiện hợp đồng"
            />
          </Field>
          <Field label="Ngày mời triển khai">
            <VietnameseDateInput
              value={draft.implementationInvitationDate}
              onChange={(val) => updateField("implementationInvitationDate", val ?? "")}
            />
          </Field>
          <Field
            label="Ngày hiệu lực/bắt đầu thực tế"
            hint="Không tự lấy ngày ký. Chỉ nhập khi đã xác nhận đủ điều kiện có hiệu lực."
          >
            <VietnameseDateInput
              value={draft.contractStartDate}
              onChange={(val) => updateField("contractStartDate", val ?? "")}
            />
          </Field>
          <Field label="Ngày bàn giao mặt bằng">
            <VietnameseDateInput
              value={draft.siteHandoverDate}
              onChange={(val) => updateField("siteHandoverDate", val ?? "")}
            />
          </Field>
          <Field label="Kết thúc giao hàng">
            <VietnameseDateInput
              value={draft.goodsEndDate}
              onChange={(val) => updateField("goodsEndDate", val ?? "")}
            />
          </Field>
          <Field label="Kết thúc dịch vụ">
            <VietnameseDateInput
              value={draft.serviceEndDate}
              onChange={(val) => updateField("serviceEndDate", val ?? "")}
            />
          </Field>
          <Field label="Kết thúc hợp đồng">
            <VietnameseDateInput
              value={draft.contractEndDate}
              onChange={(val) => updateField("contractEndDate", val ?? "")}
            />
          </Field>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={draft.isExtended}
                onChange={(event) => updateField("isExtended", event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              Hợp đồng đã gia hạn
            </label>
          </div>
          {draft.isExtended && (
            <Field label="Gia hạn đến" required>
              <VietnameseDateInput
                value={draft.extendedUntil}
                onChange={(val) => updateField("extendedUntil", val ?? "")}
              />
            </Field>
          )}
        </div>
      </FormSection>

      <FormSection
        title="4. Theo dõi thực hiện"
        description="Cập nhật tiến độ, khối lượng, chỉ đạo và thanh toán."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mức độ hoàn thành (%)" required>
            <input
              type="number"
              min="0"
              max="100"
              value={draft.progressPercent}
              onChange={(event) => updateField("progressPercent", Number(event.target.value))}
              className={inputClassName}
            />
          </Field>
          <Field label="Thanh toán / quyết toán">
            <input
              value={draft.paymentSettlementStatus ?? ""}
              onChange={(event) => updateField("paymentSettlementStatus", event.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="Ghi nhận tiến độ" wide>
            <textarea
              value={draft.progressNote ?? ""}
              onChange={(event) => updateField("progressNote", event.target.value)}
              className={textareaClassName}
            />
          </Field>
          <Field label="Ghi nhận khối lượng / chi phí">
            <textarea
              value={draft.costNote ?? ""}
              onChange={(event) => updateField("costNote", event.target.value)}
              className={textareaClassName}
            />
          </Field>
          <Field label="Chỉ đạo quản lý">
            <textarea
              value={draft.managementDirection ?? ""}
              onChange={(event) => updateField("managementDirection", event.target.value)}
              className={textareaClassName}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="5. Nhân sự giám sát"
        description="Có thể thêm nhiều nhân sự từ các đơn vị tham gia giám sát."
      >
        <div className="space-y-2">
          {draft.supervisors.map((supervisor, index) => (
            <div
              key={supervisor.id}
              className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[40px_1.2fr_0.8fr_1fr_auto] md:items-end"
            >
              <div className="text-[10px] font-bold text-slate-400">#{index + 1}</div>
              <Field label="Họ và tên">
                <input
                  value={supervisor.fullName}
                  onChange={(event) =>
                    updateSupervisor(supervisor.id, "fullName", event.target.value)
                  }
                  className={inputClassName}
                />
              </Field>
              <Field label="Đơn vị">
                <input
                  value={supervisor.department}
                  onChange={(event) =>
                    updateSupervisor(supervisor.id, "department", event.target.value)
                  }
                  className={inputClassName}
                  list="department-options"
                />
              </Field>
              <Field label="Vai trò">
                <input
                  value={supervisor.role ?? ""}
                  onChange={(event) =>
                    updateSupervisor(supervisor.id, "role", event.target.value)
                  }
                  className={inputClassName}
                />
              </Field>
              <button
                type="button"
                onClick={() =>
                  updateField(
                    "supervisors",
                    draft.supervisors.filter((item) => item.id !== supervisor.id)
                  )
                }
                disabled={draft.supervisors.length === 1}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Xóa
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              updateField("supervisors", [...draft.supervisors, createBlankSupervisor()])
            }
            className="h-9 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
          >
            ＋ Thêm nhân sự giám sát
          </button>
        </div>
      </FormSection>

      <FormSection
        title="6. Hồ sơ / tài liệu"
        description="Liên kết thư mục hồ sơ của hợp đồng nếu đã có."
      >
        <Field
          label="Đường dẫn thư mục Google Drive"
          hint="Chỉ lưu đường dẫn. Việc kết nối và phân quyền Google Drive sẽ được triển khai ở giai đoạn riêng."
        >
          <input
            type="url"
            value={draft.googleDriveFolderUrl ?? ""}
            onChange={(event) => updateField("googleDriveFolderUrl", event.target.value)}
            className={inputClassName}
            placeholder="https://drive.google.com/..."
          />
        </Field>
      </FormSection>

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <Link
          href={initialContract ? `/documents/contracts/list/${initialContract.id}` : "/documents/contracts/list"}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          Hủy
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="h-9 rounded-lg bg-blue-700 px-5 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
        >
          {saving
            ? "Đang lưu..."
            : mode === "create"
              ? pendingPdfImport
                ? "Xác nhận tạo hợp đồng và hạng mục"
                : "Lưu hợp đồng mới"
              : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}

export function ContractForm({ mode, contractId }: ContractFormProps) {

  const { ready, getContract, canCreate, canEdit, error } = useContracts();
  if (error) return <p role="alert" className="p-4 text-sm text-red-700">{error}</p>;
  if (ready && !(mode === "create" ? canCreate : canEdit)) return <p className="p-4 text-sm text-muted-foreground">Bạn không có quyền chỉnh sửa hợp đồng.</p>;
  const existingContract = contractId ? getContract(contractId) : undefined;

  return (
    <div className="min-h-full bg-slate-100">
      
      <div className="flex">
        
        <main className="min-w-0 flex-1 p-3 sm:p-4">
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-4">
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                <Link href="/documents/contracts/list" className="hover:text-blue-700">
                  Hợp đồng
                </Link>
                <span>/</span>
                <span className="font-medium text-slate-700">
                  {mode === "create" ? "Thêm hợp đồng" : "Chỉnh sửa hợp đồng"}
                </span>
              </div>
              <h1 className="mt-2 text-xl font-bold text-slate-900">
                {mode === "create" ? "Thêm hợp đồng mới" : "Chỉnh sửa hợp đồng"}
              </h1>
              <p className="mt-1 text-[11px] text-slate-500">
                Các trường có dấu * là thông tin bắt buộc trước khi lưu.
              </p>
            </div>

            {!ready ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
                Đang tải dữ liệu hợp đồng...
              </div>
            ) : mode === "edit" && !existingContract ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                <p className="text-sm font-bold text-amber-800">
                  Không tìm thấy hợp đồng cần chỉnh sửa.
                </p>
                <Link
                  href="/documents/contracts/list"
                  className="mt-4 inline-flex h-9 items-center rounded-lg bg-blue-700 px-4 text-[11px] font-semibold text-white"
                >
                  Quay lại danh sách
                </Link>
              </div>
            ) : (
              <ContractEditor
                key={existingContract?.id ?? "new-contract"}
                mode={mode}
                initialContract={existingContract}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
