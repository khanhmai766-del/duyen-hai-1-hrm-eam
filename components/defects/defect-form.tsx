"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Check, Loader2, ChevronRight, ChevronLeft, Cpu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateDefect, useDefectTwoWaySync, useUpdateDefect, type DefectItem } from "@/hooks/useDefects";
import { usePositions, useUsers } from "@/hooks/useUsers";
import { MAX_DEFECT_IMAGES } from "@/lib/defect-images";
import { useEquipmentNode } from "@/hooks/useEquipment";
import {
  EquipmentTreePicker,
  type PickerEquipmentNode,
} from "@/components/devices/equipment-tree-picker";
import { MultiImagePicker } from "@/components/shared/multi-image-picker";
import {
  DEFECT_UNITS,
  DEFECT_UNIT_POSITIONS,
  DEFECT_COMMON_SUB_UNITS,
  DEFECT_SEVERITY_ORDER,
  DEFECT_SEVERITY_CRITERIA,
  DEFECT_CONDITION,
  DEFECT_CONDITION_ORDER,
  DEFECT_REQUEST_TYPES,
  DEFECT_STATUS,
  DEFECT_STATUS_ORDER,
  defaultRequestTypeForMaterialCategory,
  isSelectableManagingPosition,
} from "@/lib/constants";
import { cn, formatDate, formatDateInput } from "@/lib/utils";
import type { TreeScope } from "@/lib/equipment-units";
import { isDefectShiftLeaderCandidatePosition } from "@/lib/defect-shift-leader-position";
import { positionsMatch } from "@/lib/position-catalog";
import { allowedMappedUnits, normalizeMappedUnit } from "@/lib/defect-device-mapping";
import {
  DEFECT_ENVIRONMENT_SHEET_OPTIONS,
  defectEnvironmentSheetFromName,
} from "@/lib/defect-environment-sheet";
import { DEFECT_SECTIONS, defaultRequestTypeOf, type DefectSectionKey } from "@/lib/defect-section";

function toDateInput(v: Date | string | null | undefined): string {
  return formatDateInput(v);
}

const NONE = "__none__";
const YES_NO_OPTIONS = ["Có", "Không"] as const;

/**
 * Mồi cho phiếu ra từ "Chi tiết điểm thay thế" của Danh mục vật tư.
 * Tổ máy / cương vị / thiết bị đã chốt theo bản khai báo nên khoá lại; server còn
 * dựng lại lần nữa từ `replacementIds` nên client không thể đổi lệch.
 */
export type DefectMaterialRequestSeed = {
  replacementIds: string[];
  materialName: string;
  materialUnit: string;
  /** Loại vật tư (Material.category) — quyết định gợi ý Cơ/Điện cho phiếu. */
  materialCategory: string | null;
  /** Node gắn phiếu là THƯ MỤC (điểm khai báo ở cấp hệ thống) — chỉ SYC thay thế mới cho phép. */
  primaryIsFolder: boolean;
  /** Hệ thống chính và tên node chính, chỉ để hiển thị — server tự dựng lại khi lưu. */
  primarySystemName: string;
  primaryDeviceName: string;
  points: Array<{ id: string; label: string; quantity: number }>;
  suggestedContent: string;
};

export function DefectForm({
  defect,
  initialDevice,
  initialMaterialRequest,
  section,
  lockDevice = false,
  onDone,
  onMappingSaved,
  onCancel,
}: {
  defect?: DefectItem | null;
  initialDevice?: {
    code: string;
    displayCode?: string;
    name: string;
    system?: string | null;
    systemSeq?: string | null;
    managingPosition?: string | null;
    unit?: string | null;
  } | null;
  initialMaterialRequest?: DefectMaterialRequestSeed | null;
  section?: DefectSectionKey;
  lockDevice?: boolean;
  onDone?: () => void;
  onMappingSaved?: (defect: DefectItem) => void;
  onCancel?: () => void;
}) {
  const isEdit = !!defect;
  const { data: session, status: sessionStatus } = useSession();
  // Phiếu tạo trên website vẫn thuộc quyền chỉnh sửa của Vận hành sau khi được
  // đồng bộ vòng về từ Sheet. Chỉ phiếu có nguồn gốc thật sự từ Sheet mới dùng
  // màn hình ánh xạ cục bộ.
  const isSynced = defect?.sourceType === "GOOGLE_SHEETS" && !defect.websiteCreated;
  const twoWaySync = useDefectTwoWaySync();
  const syncSetting = twoWaySync.data?.data;
  const operationUpdateAvailable = Boolean(
    syncSetting?.twoWaySyncEnabled && syncSetting.operationUpdateEnabled
  );
  const operationFeatureLocked = isSynced && !operationUpdateAvailable;
  const operationFieldsLocked = isSynced && (
    defect?.status === "DA_XU_LY" || operationFeatureLocked
  );
  const initialMappedUnit = normalizeMappedUnit(
    defect?.mappedDeviceUnit,
    defect?.unit ?? initialDevice?.unit,
    defect?.deviceSeq ?? initialDevice?.code
  );
  const create = useCreateDefect();
  const update = useUpdateDefect();
  const [step, setStep] = React.useState<1 | 2 | 3 | 4>(1);
  // SYC thay thế vật tư chỉ được khởi tạo từ Điểm thay thế. Form Khiếm khuyết
  // thông thường không cung cấp cửa chọn vật tư riêng.
  const materialRequest = initialMaterialRequest ?? null;
  const sectionSource = section ? DEFECT_SECTIONS[section].source : "";
  const requestTypeOptions = section ? DEFECT_SECTIONS[section].requestTypes : DEFECT_REQUEST_TYPES;
  const requestTypeLabel = React.useCallback(
    (requestType: string) => {
      if (requestType !== "Môi Trường" || !section) return requestType;
      return section === "co" ? "Môi Trường (Cơ)" : "Môi Trường (Điện)";
    },
    [section]
  );

  // Cương vị lấy từ trường "Chức vụ" của Quản lý người dùng (distinct, bỏ trùng);
  // loại Quản đốc / Phó quản đốc / Thống kê / Kỹ thuật viên.
  const allPositions = usePositions();
  const usersQuery = useUsers();
  const positions = React.useMemo(() => {
    const actual = allPositions.filter(isSelectableManagingPosition);
    const standard = Array.from(new Set(
      DEFECT_UNITS.flatMap((unit) => [...DEFECT_UNIT_POSITIONS[unit]])
    ));
    // Giữ nhãn đang dùng trong hồ sơ nhân sự, đồng thời bổ sung mọi cương vị
    // chuẩn chưa được gán cho người dùng nào. Nếu chỉ lấy usePositions(), danh
    // sách COMMON sẽ thiếu các vị trí chưa có nhân sự được khai báo.
    return [
      ...actual,
      ...standard.filter(
        (standardPosition) => !actual.some((position) => positionsMatch(position, standardPosition))
      ),
    ];
  }, [allPositions]);
  const shiftLeaders = React.useMemo(
    () => (usersQuery.data?.data ?? [])
      .filter((user) => user.isActive && [user.position, user.secondaryPosition, user.secondaryPosition2, user.currentPosition].some(isDefectShiftLeaderCandidatePosition))
      .sort((a, b) => a.name.localeCompare(b.name, "vi")),
    [usersQuery.data]
  );
  const [form, setForm] = React.useState({
    unit: defect?.unit ?? initialDevice?.unit ?? "",
    commonSubUnit: defect?.commonSubUnit ?? "",
    device: defect?.device ?? initialDevice?.code ?? "",
    mappedDeviceUnit: initialMappedUnit,
    relatedDeviceSeqs: defect?.relatedDevices?.map((item) => item.deviceSeq) ?? [],
    relatedDeviceUnits: Object.fromEntries(
      (defect?.relatedDevices ?? []).map((item) => [
        item.deviceSeq,
        normalizeMappedUnit(item.mappedUnit, defect?.unit, item.deviceSeq),
      ])
    ) as Record<string, TreeScope>,
    deviceSystem: initialDevice?.system ?? "",
    deviceSystemSeq: initialDevice?.systemSeq ?? "",
    system: defect?.system ?? initialDevice?.managingPosition ?? "",
    severity: defect?.severity ?? "",
    severityCriteria: defect?.severityCriteria ?? [],
    condition: defect?.condition ?? "",
    fireSafetyImpact: defect?.fireSafetyImpact ?? "Không",
    environmentSafetyImpact: defect?.environmentSafetyImpact ?? "Không",
    // Phiếu mới để VHV chủ động chọn Cơ/Điện để tránh ghi nhầm Sheet — trừ SYC
    // thay thế của dầu bôi trơn / lõi lọc dầu / bi nghiền than, luôn thuộc phần
    // Cơ nên điền sẵn. Người lập vẫn đổi lại được.
    requestType:
      (defect?.requestType
        ?? defaultRequestTypeForMaterialCategory(initialMaterialRequest?.materialCategory))
      || (section ? defaultRequestTypeOf(section) : ""),
    environmentSheet: defectEnvironmentSheetFromName(defect?.sourceSheetName) || sectionSource,
    requestNumber: defect?.requestNumber ?? "",
    content: defect?.content ?? initialMaterialRequest?.suggestedContent ?? "",
    status: defect?.status ?? "CHUA_XU_LY",
    detectedAt: toDateInput(defect?.detectedAt),
    reminderCount: defect?.reminderCount ?? 0,
    lastRemindedAt: toDateInput(defect?.lastRemindedAt),
    postRepairAwaitingMaterial: defect?.postRepairAwaitingMaterial ?? false,
    shiftLeaderId: defect?.shiftLeaderId ?? "",
    note: defect?.note ?? "",
    repeatedRepairRaw: defect?.repeatedRepairRaw ?? "",
    sourceDeviceRaw: defect?.sourceDeviceRaw ?? "",
    images: defect?.images ?? (defect?.imageUrl ? [defect.imageUrl] : []),
  });
  const defaultPositionResolvedRef = React.useRef(Boolean(form.system));
  const [mappingScope, setMappingScope] = React.useState<TreeScope>(initialMappedUnit);
  React.useEffect(() => {
    const allowed = allowedMappedUnits(form.unit);
    if (!allowed.includes(mappingScope)) setMappingScope(allowed[0]);
  }, [form.unit, mappingScope]);
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function selectSeverity(severity: string) {
    setForm((current) => ({
      ...current,
      severity,
      severityCriteria: current.severity === severity ? current.severityCriteria : [],
    }));
  }
  function toggleSeverityCriterion(id: string) {
    setForm((current) => ({
      ...current,
      severityCriteria: current.severityCriteria.includes(id)
        ? current.severityCriteria.filter((item) => item !== id)
        : [...current.severityCriteria, id],
    }));
  }
  // Form ra phiếu luôn cho chọn toàn bộ cương vị vận hành. Tổ máy chỉ quyết
  // định cây thiết bị và đích Sheet, không được cắt danh sách cương vị.
  const visiblePositions = React.useMemo(
    () => {
      if (form.system && !positions.some((position) => positionsMatch(position, form.system))) {
        return [form.system, ...positions];
      }
      return positions;
    },
    [positions, form.system]
  );
  const userPositionCandidates = React.useMemo(() => {
    const candidates = [
      session?.user?.position,
      session?.user?.secondaryPosition,
      session?.user?.secondaryPosition2,
    ].filter((position): position is string => Boolean(position?.trim()));

    return candidates.filter(
      (position, index) =>
        candidates.findIndex((candidate) => positionsMatch(candidate, position)) === index
    );
  }, [
    session?.user?.position,
    session?.user?.secondaryPosition,
    session?.user?.secondaryPosition2,
  ]);

  // Phiếu mới tự chọn cương vị theo hồ sơ người lập: chức vụ chính → phụ 1 → phụ 2.
  // Chỉ áp dụng một lần để không ghi đè lựa chọn thủ công của người dùng.
  React.useEffect(() => {
    if (isEdit || defaultPositionResolvedRef.current) return;
    if (sessionStatus === "loading" || usersQuery.isLoading) return;

    const matchedPosition = userPositionCandidates
      .map((candidate) =>
        positions.find((position) => positionsMatch(position, candidate))
      )
      .find((position): position is string => Boolean(position));

    defaultPositionResolvedRef.current = true;
    if (!matchedPosition) return;
    setForm((current) =>
      current.system ? current : { ...current, system: matchedPosition }
    );
  }, [
    form.unit,
    isEdit,
    positions,
    sessionStatus,
    userPositionCandidates,
    usersQuery.isLoading,
  ]);
  // Chọn tổ máy vẫn giữ cương vị hiện tại vì mọi tổ máy dùng chung danh sách
  // cương vị; chỉ thiết bị phải xóa do mỗi tổ máy ánh xạ vào một cây khác nhau.
  // Mỗi tổ máy ánh xạ vào một CÂY thiết bị riêng (S1/S2 = nhánh 1,2,3,7; COMMON = nhánh 5,6)
  // nên đổi tổ máy phải bỏ luôn thiết bị đã chọn — thiết bị cũ thuộc cây khác.
  function selectUnit(u: string) {
    setForm((f) => {
      const commonSubUnit = u === "COMMON" ? f.commonSubUnit : "";
      if (f.unit === u) return { ...f, commonSubUnit };
      const cleared = {
        deviceSystem: "",
        deviceSystemSeq: "",
        device: "",
        mappedDeviceUnit: normalizeMappedUnit(undefined, u),
        relatedDeviceSeqs: [],
        relatedDeviceUnits: {},
      };
      return { ...f, unit: u, commonSubUnit, ...cleared };
    });
  }
  const selectedDeviceQuery = useEquipmentNode(form.device || null, form.mappedDeviceUnit);
  const selectedSystemQuery = useEquipmentNode(form.deviceSystemSeq || null, form.mappedDeviceUnit);
  const automaticContentSuffixRef = React.useRef<string | null>(null);
  const defaultNoteAppliedRef = React.useRef(false);

  // Phiếu mới: KKS là hậu tố ở cuối, textarea vẫn sửa tự do. Khi đổi thiết bị,
  // chỉ thay đúng hậu tố do hệ thống đã thêm và giữ nguyên phần mô tả người dùng gõ.
  React.useEffect(() => {
    if (isEdit || isSynced) return;
    if (!form.device) {
      const previousSuffix = automaticContentSuffixRef.current;
      automaticContentSuffixRef.current = null;
      if (!previousSuffix) return;
      setForm((current) => current.content.endsWith(previousSuffix)
        ? { ...current, content: current.content.slice(0, -previousSuffix.length) }
        : current);
      return;
    }

    const selectedDevice = selectedDeviceQuery.data?.data;
    if (!selectedDevice || selectedDevice.seq !== form.device) return;
    const nextSuffix = ` - ${selectedDevice.kks?.trim() || "Không có mã KKS"}`;
    const previousSuffix = automaticContentSuffixRef.current;
    if (previousSuffix === nextSuffix) return;
    automaticContentSuffixRef.current = nextSuffix;
    setForm((current) => {
      const description = previousSuffix && current.content.endsWith(previousSuffix)
        ? current.content.slice(0, -previousSuffix.length)
        : current.content;
      return { ...current, content: `${description}${nextSuffix}` };
    });
  }, [form.device, isEdit, isSynced, selectedDeviceQuery.data]);

  // Chỉ điền một lần cho phiếu tạo mới; người dùng có thể sửa/xóa sau đó và dữ liệu
  // cũ ở màn hình chỉnh sửa không bao giờ bị ghi đè.
  React.useEffect(() => {
    if (isEdit || isSynced || defaultNoteAppliedRef.current || sessionStatus === "loading") return;
    const operatorName = session?.user?.name?.trim();
    if (!operatorName) return;
    defaultNoteAppliedRef.current = true;
    const today = new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());
    setForm((current) => current.note
      ? current
      : { ...current, note: `${operatorName} cập nhật ngày ${today}` });
  }, [isEdit, isSynced, session?.user?.name, sessionStatus]);

  React.useEffect(() => {
    if (form.requestType === "Môi Trường") return;
    const deviceName = selectedDeviceQuery.data?.data.name;
    if (!deviceName) return;
    setForm((current) => (current.sourceDeviceRaw ? current : { ...current, sourceDeviceRaw: deviceName }));
  }, [form.requestType, selectedDeviceQuery.data]);
  React.useEffect(() => {
    const systemName = selectedSystemQuery.data?.data.name;
    if (!systemName || form.deviceSystem === systemName) return;
    setForm((current) => ({ ...current, deviceSystem: systemName }));
  }, [form.deviceSystem, selectedSystemQuery.data]);

  function selectRequestType(requestType: string) {
    const selectedDeviceName = selectedDeviceQuery.data?.data.name ?? "";
    setForm((current) => {
      const enteringEnvironment = requestType === "Môi Trường" && current.requestType !== "Môi Trường";
      const leavingEnvironment = requestType !== "Môi Trường" && current.requestType === "Môi Trường";
      return {
        ...current,
        requestType,
        environmentSheet: requestType === "Môi Trường"
          ? sectionSource || current.environmentSheet
          : "",
        sourceDeviceRaw: enteringEnvironment
          ? ""
          : leavingEnvironment
            ? selectedDeviceName
            : current.sourceDeviceRaw,
      };
    });
  }

  function setSystem(v: string) {
    defaultPositionResolvedRef.current = true;
    const next = v === NONE ? "" : v;
    set("system", next);
  }

  function selectMappedDevice(node: PickerEquipmentNode | null) {
    if (!node) return;
    if (node.hasChildren) {
      toast.error("Vui lòng chọn thiết bị cấp cuối, không chọn thư mục hệ thống");
      return;
    }
    setForm((current) => {
      if (node.seq === current.device) {
        const [nextPrimary = "", ...remaining] = current.relatedDeviceSeqs;
        return {
          ...current,
          device: nextPrimary,
          mappedDeviceUnit: nextPrimary
            ? current.relatedDeviceUnits[nextPrimary] ?? mappingScope
            : normalizeMappedUnit(undefined, current.unit),
          relatedDeviceSeqs: remaining,
        };
      }
      if (current.relatedDeviceSeqs.includes(node.seq)) {
        return {
          ...current,
          relatedDeviceSeqs: current.relatedDeviceSeqs.filter((seq) => seq !== node.seq),
          relatedDeviceUnits: Object.fromEntries(
            Object.entries(current.relatedDeviceUnits).filter(([seq]) => seq !== node.seq)
          ),
        };
      }
      if (!current.device) {
        return {
          ...current,
          deviceSystem: "",
          deviceSystemSeq: node.parentSeq ?? "",
          device: node.seq,
          mappedDeviceUnit: mappingScope,
          relatedDeviceSeqs: [],
          relatedDeviceUnits: {},
        };
      }
      if (current.relatedDeviceSeqs.length >= 20) {
        toast.error("Mỗi khiếm khuyết chỉ được chọn tối đa 20 thiết bị liên quan");
        return current;
      }
      return {
        ...current,
        relatedDeviceSeqs: [...current.relatedDeviceSeqs, node.seq],
        relatedDeviceUnits: { ...current.relatedDeviceUnits, [node.seq]: mappingScope },
      };
    });
  }
  function removeMappedDevice(seq: string) {
    setForm((current) => {
      if (seq === current.device) {
        const [nextPrimary = "", ...remaining] = current.relatedDeviceSeqs;
        return {
          ...current,
          device: nextPrimary,
          mappedDeviceUnit: nextPrimary
            ? current.relatedDeviceUnits[nextPrimary] ?? mappingScope
            : normalizeMappedUnit(undefined, current.unit),
          relatedDeviceSeqs: remaining,
        };
      }
      return {
        ...current,
        relatedDeviceSeqs: current.relatedDeviceSeqs.filter((item) => item !== seq),
        relatedDeviceUnits: Object.fromEntries(
          Object.entries(current.relatedDeviceUnits).filter(([item]) => item !== seq)
        ),
      };
    });
  }

  // Tab "Thông tin chung" bắt buộc chọn đủ; trả về tên thẻ còn thiếu (nếu có).
  function missingGeneral(): string | null {
    if (isSynced) return null;
    if (!form.unit) return "Tổ máy";
    if (form.unit === "COMMON" && !form.commonSubUnit) return "BOP, CHUNG hoặc ĐKTT";
    if (!form.system) return "Cương vị";
    if (!form.condition) return "Điều kiện thực hiện";
    if (!form.shiftLeaderId) return "Trưởng ca";
    return null;
  }
  function hasDefectDescription() {
    const suffix = automaticContentSuffixRef.current;
    const description = suffix && form.content.endsWith(suffix)
      ? form.content.slice(0, -suffix.length)
      : form.content;
    return Boolean(description.trim());
  }
  function goToSeverity() {
    const missing = missingGeneral();
    if (missing) return toast.error(`Vui lòng chọn ${missing}`);
    setStep(2);
  }
  function goToDefectInfo() {
    const missing = missingGeneral();
    if (missing) { setStep(1); return toast.error(`Vui lòng chọn ${missing}`); }
    if (!form.severity) { setStep(2); return toast.error("Vui lòng chọn Mức độ"); }
    if (!isEdit && form.severityCriteria.length === 0) {
      setStep(2);
      return toast.error("Vui lòng chọn ít nhất 1 tiêu chí mức độ");
    }
    if (!form.requestType) {
      setStep(3);
      return toast.error("Vui lòng chọn Yêu cầu");
    }
    if (form.requestType === "Môi Trường" && !form.environmentSheet) {
      setStep(3);
      return toast.error("Vui lòng chọn Sheet Môi Trường – Cơ hoặc Môi Trường – Điện");
    }
    if (!form.sourceDeviceRaw.trim()) {
      setStep(3);
      return toast.error(
        form.requestType === "Môi Trường"
          ? "Vui lòng nhập Mã Trạm ghi lên Google Sheet"
          : "Vui lòng nhập Tên thiết bị ghi lên Google Sheet"
      );
    }
    if (!hasDefectDescription()) {
      setStep(3);
      return toast.error("Vui lòng nhập mô tả khiếm khuyết trước mã KKS");
    }
    setStep(3);
  }

  async function submit() {
    if (isSynced) {
      try {
        const severityChanged = form.severity !== (defect?.severity ?? "");
        if (severityChanged && form.severity && defect?.status !== "DA_XU_LY" && form.severityCriteria.length === 0) {
          setStep(1);
          return toast.error("Vui lòng chọn ít nhất 1 tiêu chí mức độ");
        }
        const syncedPayload: Record<string, unknown> = { id: defect!.id };
        if (
          form.severityCriteria.length > 0
          && (defect?.status !== "DA_XU_LY" || severityChanged)
        ) {
          syncedPayload.severityCriteria = form.severityCriteria;
        }
        if (operationUpdateAvailable) syncedPayload.note = form.note;
        if (!operationFieldsLocked) {
          Object.assign(syncedPayload, {
            severity: form.severity,
            status: form.status,
            fireSafetyImpact: form.fireSafetyImpact,
            environmentSafetyImpact: form.environmentSafetyImpact,
            condition: form.condition,
          });
        }
        // Cờ Tồn đọng là dữ liệu Vận hành độc lập với ánh xạ thiết bị. Phiếu
        // Sheet đã xử lý vẫn phải lưu được `false` ngay cả khi chưa/cũ không có
        // deviceSystemSeq; nếu đặt trong nhánh ánh xạ bên dưới thì bỏ tick chỉ
        // đổi giao diện và API không bao giờ nhận được giá trị mới.
        if (operationUpdateAvailable && defect?.status === "DA_XU_LY") {
          syncedPayload.postRepairAwaitingMaterial = form.postRepairAwaitingMaterial;
        }
        if (form.deviceSystemSeq) {
          syncedPayload.deviceSystemSeq = form.deviceSystemSeq;
          syncedPayload.device = form.device || null;
          syncedPayload.mappedDeviceUnit = form.mappedDeviceUnit;
          syncedPayload.relatedDeviceSeqs = form.relatedDeviceSeqs;
          syncedPayload.relatedDeviceMappings = form.relatedDeviceSeqs.map((deviceSeq) => ({
            deviceSeq,
            mappedUnit: form.relatedDeviceUnits[deviceSeq] ?? form.mappedDeviceUnit,
          }));
        }
        // Chỉ gửi ảnh khi VHV chủ động lưu tại tab hình ảnh.
        // Lưu ánh xạ không được kích hoạt kiểm tra/tải lại ảnh.
        if (step === 3 && operationUpdateAvailable) syncedPayload.images = form.images;
        const updated = await update.mutateAsync(syncedPayload as { id: string } & Record<string, unknown>);
        const hasMappedDevice = Boolean(updated.deviceSeq);
        toast.success(
          step === 3
            ? "Đã lưu hình ảnh khiếm khuyết"
            : operationUpdateAvailable
              ? hasMappedDevice
                ? "Đã lưu thiết bị đã gắn và KQ Vận hành"
                : "Đã lưu KQ Vận hành"
              : "Đã lưu thiết bị đã gắn"
        );
        if (step === 1 && hasMappedDevice && onMappingSaved) onMappingSaved(updated);
        else onDone?.();
      } catch (error) {
        toast.error((error as Error).message);
      }
      return;
    }
    const missing = missingGeneral();
    if (missing) { setStep(1); return toast.error(`Vui lòng chọn ${missing}`); }
    if (!form.severity) { setStep(2); return toast.error("Vui lòng chọn Mức độ"); }
    if (!isEdit && form.severityCriteria.length === 0) {
      setStep(2);
      return toast.error("Vui lòng chọn ít nhất 1 tiêu chí mức độ");
    }
    if (!hasDefectDescription()) {
      setStep(3);
      return toast.error("Vui lòng nhập mô tả khiếm khuyết trước mã KKS");
    }
    const {
      deviceSystem: _deviceSystem,
      deviceSystemSeq: _deviceSystemSeq,
      reminderCount: _reminderCount,
      lastRemindedAt: _lastRemindedAt,
      relatedDeviceUnits: _relatedDeviceUnits,
      ...defectForm
    } = form;
    const payload: Record<string, unknown> = {
      ...defectForm,
      relatedDeviceMappings: form.relatedDeviceSeqs.map((deviceSeq) => ({
        deviceSeq,
        mappedUnit: form.relatedDeviceUnits[deviceSeq] ?? form.mappedDeviceUnit,
      })),
      detectedAt: form.detectedAt || null,
    };
    // SYC thay thế vật tư: chỉ gửi danh sách điểm; server tự dựng lại tổ máy/cương
    // vị/thiết bị từ Danh mục nên các giá trị tương ứng ở trên chỉ để hiển thị.
    if (materialRequest) payload.replacementIds = materialRequest.replacementIds;
    try {
      if (isEdit) await update.mutateAsync({ id: defect!.id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(isEdit ? "Đã cập nhật khiếm khuyết" : "Đã lưu khiếm khuyết");
      onDone?.();
    } catch (e) {
      const message = (e as Error).message;
      // Điểm đã có phiếu dang dở — hỏi lại rồi ra phiếu mới nếu người dùng đồng ý.
      if (materialRequest && !isEdit && message.includes("Xác nhận để vẫn ra phiếu mới")) {
        if (!window.confirm(`${message}\n\nBạn vẫn muốn ra số yêu cầu mới?`)) return;
        try {
          await create.mutateAsync({ ...payload, allowDuplicate: true });
          toast.success("Đã lưu khiếm khuyết");
          onDone?.();
        } catch (retryError) {
          toast.error((retryError as Error).message);
        }
        return;
      }
      toast.error(message);
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <div className="flex min-h-0 h-full flex-col">
      {/* Tabs */}
      <div className="flex shrink-0 justify-center gap-3 overflow-x-auto border-b border-border px-3 sm:gap-6">
        {isSynced ? (
          <>
            {/* Không đánh số như phiếu mới: đây là 4 mục tra cứu/cập nhật độc lập,
                không phải trình tự bắt buộc. Chỉ đánh dấu mục ĐÃ ánh xạ xong. */}
            <TabBtn active={step === 1} onClick={() => setStep(1)} label="Gắn thiết bị" done={!!form.device} />
            <TabBtn active={step === 2} onClick={() => setStep(2)} label="Nội dung sửa chữa" muted />
            {["1", "2", "3", "4"].includes(form.severity) && (
              <TabBtn active={step === 3} onClick={() => setStep(3)} label="Hình ảnh khiếm khuyết" />
            )}
            <TabBtn active={step === 4} onClick={() => setStep(4)} label="BGĐ chỉ đạo" muted />
          </>
        ) : (
          <>
            <StepBtn n={1} active={step === 1} done={step > 1} onClick={() => setStep(1)} label="Thông tin chung" />
            <StepBtn n={2} active={step === 2} done={step > 2} onClick={goToSeverity} label="Mức độ" />
            <StepBtn n={3} active={step === 3} onClick={goToDefectInfo} label="Nội dung" />
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
        <div className={cn(step === 1 ? "block" : "hidden")}>
          <div className="mx-auto max-w-2xl space-y-6">
            {materialRequest && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-emerald-950">SYC thay thế vật tư</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    {materialRequest.points.length} điểm
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-ink">{materialRequest.materialName}</p>
                <ul className="mt-2 space-y-1">
                  {materialRequest.points.map((point) => (
                    <li key={point.id} className="flex items-baseline justify-between gap-3 text-xs text-emerald-900/85">
                      <span className="min-w-0 flex-1 truncate" title={point.label}>{point.label}</span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {point.quantity.toLocaleString("vi-VN")} {materialRequest.materialUnit}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-emerald-800/75">
                  Tổ máy, cương vị và thiết bị lấy thẳng từ điểm đã khai báo trong Danh mục vật tư
                  nên không sửa được ở đây — nhờ vậy phiếu luôn nằm đúng vị trí trên cây thiết bị.
                </p>
              </div>
            )}
            <Section
              eyebrow={isSynced ? "Gắn phiếu vào thiết bị" : "Định vị phiếu"}
              hint={isSynced
                ? "Gắn phiếu từ Google Sheet vào đúng node trên cây thiết bị để tra cứu chung được lịch sử."
                : "Tổ máy và cương vị quyết định phiếu đi vào Google Sheet nào và ai được xử lý."}
            >
            <Field label="Tổ máy" required>
              {lockDevice && initialDevice ? (
                <LockedValue
                  primary={form.unit === "COMMON" ? form.commonSubUnit || "COMMON · Dùng chung" : form.unit}
                  secondary="Tự động theo nhánh thiết bị"
                />
              ) : (
                <div className="inline-flex h-10 w-full overflow-hidden rounded-md border border-input">
                  {DEFECT_UNITS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      disabled={isSynced}
                      aria-pressed={form.unit === u}
                      onClick={() => selectUnit(u)}
                      className={cn(
                        "flex-1 border-r border-input text-[13.5px] font-semibold transition-colors last:border-r-0",
                        form.unit === u ? "bg-navy text-white" : "bg-white text-muted-foreground hover:bg-muted hover:text-ink",
                        isSynced && "cursor-not-allowed opacity-70"
                      )}
                    >
                      {u === "COMMON"
                        ? isSynced && form.commonSubUnit
                          ? form.commonSubUnit
                          : "Common"
                        : u}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            {!isSynced && form.unit === "COMMON" && (
              <Field label="Phân loại dùng chung" required>
                <div className="inline-flex h-10 w-full overflow-hidden rounded-md border border-input">
                  {DEFECT_COMMON_SUB_UNITS.map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      aria-pressed={form.commonSubUnit === sub}
                      onClick={() => set("commonSubUnit", sub)}
                      className={cn(
                        "flex-1 border-r border-input text-[13.5px] font-semibold transition-colors last:border-r-0",
                        form.commonSubUnit === sub ? "bg-navy text-white" : "bg-white text-muted-foreground hover:bg-muted hover:text-ink"
                      )}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <Field label="Cương vị" required>
              {initialMaterialRequest ? (
                <LockedValue
                  primary={form.system || "Chưa khai báo cương vị"}
                  secondary="Theo cương vị quản lý của điểm thay thế"
                />
              ) : (
                <Select value={form.system || NONE} onValueChange={setSystem} disabled={isSynced}>
                  <SelectTrigger><SelectValue placeholder="Chọn cương vị" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Không chọn —</SelectItem>
                    {visiblePositions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Hệ thống chính" required={isSynced} full hint="Thiết bị đầu tiên xác định Hệ thống chính; các thiết bị liên quan có thể thuộc hệ thống khác.">
              {materialRequest ? (
                <LockedValue
                  primary={materialRequest.primarySystemName || "Chưa xác định hệ thống"}
                  secondary="Theo điểm thay thế đã chọn"
                />
              ) : lockDevice && initialDevice ? (
                <LockedValue primary={initialDevice.system || "Chưa xác định hệ thống"} secondary={initialDevice.systemSeq || undefined} />
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/25 p-2">
                    {allowedMappedUnits(form.unit).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        onClick={() => setMappingScope(unit)}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                          mappingScope === unit
                            ? "bg-navy text-white shadow-sm"
                            : "bg-white text-muted-foreground hover:text-ink"
                        )}
                      >
                        {unit === "COMMON" ? "Thiết bị COMMON" : `Thiết bị ${unit}`}
                      </button>
                    ))}
                  </div>
                  <EquipmentTreePicker
                    value={mappingScope === form.mappedDeviceUnit ? form.deviceSystemSeq : ""}
                    position={form.system || null}
                    // Phiếu Sheet chưa ánh xạ được các cương vị quản lý xử lý
                    // trong phạm vi cây họ được xem. Sau khi đã ánh xạ, mọi lần
                    // sửa tiếp theo vẫn phải theo quyền chỉnh sửa thiết bị.
                    accessFilter={isSynced && !defect?.deviceSeq ? "view" : "edit"}
                    includeLeaves
                    leafOnly
                    selectedValues={[form.device, ...form.relatedDeviceSeqs].filter(Boolean)}
                    keepOpenOnSelect
                    allowClear={false}
                    scope={mappingScope}
                    disabled={!form.unit}
                    selectionLabel={
                      form.device
                        ? `${form.deviceSystem || "Hệ thống đã chọn"} · ${1 + form.relatedDeviceSeqs.length} thiết bị`
                        : undefined
                    }
                    onChange={selectMappedDevice}
                    placeholder={form.unit
                      ? `Mở cây ${mappingScope} và chọn một hoặc nhiều thiết bị con`
                      : "Chọn tổ máy trước"}
                  />
                </div>
              )}
            </Field>
            <Field
              label={isSynced ? "Thiết bị" : "Thiết bị (không bắt buộc lúc ra phiếu)"}
              required={isSynced}
              full
              hint={!isSynced ? "Có thể gắn bổ sung sau khi danh mục thiết bị được hoàn thiện." : undefined}
            >
              {materialRequest?.primaryIsFolder ? (
                // Điểm khai báo dừng ở cấp thư mục: không có thiết bị con để gắn.
                // Phiếu neo vào chính thư mục đó và cột "Thiết bị" trên Google Sheet
                // nhận tên thư mục — quy ước riêng của SYC thay thế vật tư.
                <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5">
                  <div className="text-sm font-medium text-amber-900">Không có thiết bị cấp cuối</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-amber-800/80">
                    Điểm thay thế được khai báo ở cấp hệ thống. Phiếu gắn vào{" "}
                    <b>{materialRequest.primaryDeviceName || "hệ thống"}</b> và đây cũng là giá trị ghi vào cột Thiết bị.
                  </div>
                </div>
              ) : materialRequest ? (
                <LockedValue primary={materialRequest.primaryDeviceName} secondary="Theo điểm thay thế đã chọn" />
              ) : lockDevice && initialDevice ? (
                <LockedValue primary={initialDevice.name} secondary={initialDevice.displayCode ?? initialDevice.code} />
              ) : form.device ? (
                <RelatedDeviceRow
                  seq={form.device}
                  scope={form.mappedDeviceUnit}
                  role={`Thiết bị chính · ${form.mappedDeviceUnit}`}
                  onRemove={() => removeMappedDevice(form.device)}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/25 px-3 py-2.5 text-sm text-muted-foreground">
                  Chưa chọn. Bung cây ở ô Hệ thống chính rồi chọn thiết bị cấp cuối.
                </div>
              )}
            </Field>
            {/* Với SYC thay thế, các điểm còn lại đã là thiết bị liên quan do server gán —
                khối tóm tắt phía trên đã liệt kê đủ nên không hiện lại ô chọn tay. */}
            <Field label="Thiết bị liên quan" full hidden={!!materialRequest} hint="Không bắt buộc. Thiết bị chính vẫn quyết định cương vị và quyền xử lý phiếu.">
              <div className="space-y-3">
                {form.relatedDeviceSeqs.length > 0 ? (
                  <div className="space-y-2">
                    {form.relatedDeviceSeqs.map((seq) => {
                      return (
                        <RelatedDeviceRow
                          key={seq}
                          seq={seq}
                          scope={form.relatedDeviceUnits[seq] ?? form.mappedDeviceUnit}
                          role={`Thiết bị liên quan · ${form.relatedDeviceUnits[seq] ?? form.mappedDeviceUnit}`}
                          onRemove={() => removeMappedDevice(seq)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] text-muted-foreground">Chưa chọn thiết bị liên quan nào.</p>
                )}
              </div>
            </Field>
            {isSynced && defect?.status !== "DA_XU_LY" && form.severity && (() => {
              const config = DEFECT_SEVERITY_CRITERIA[form.severity as keyof typeof DEFECT_SEVERITY_CRITERIA];
              if (!config) return null;
              return (
                <div className="rounded-xl border border-violet-200 bg-violet-50/45 p-4 sm:col-span-2">
                  <div className="border-b border-violet-200/70 pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-violet-950">Tiêu chí Mức {form.severity}</p>
                        <p className="mt-0.5 text-xs text-violet-800/75">
                          Dữ liệu nội bộ website, không ghi lên Google Sheet.
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                        Chọn ít nhất 1 tiêu chí
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-ink">{config.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{config.guidance}</p>
                  </div>
                  <div className="mt-3 space-y-2" role="group" aria-label={`Tiêu chí Mức ${form.severity}`}>
                    {config.options.map((option) => {
                      const checked = form.severityCriteria.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleSeverityCriterion(option.id)}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                            checked
                              ? "border-violet-300 bg-white text-ink shadow-sm"
                              : "border-transparent bg-white/60 text-ink hover:border-violet-200 hover:bg-white"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                              checked ? "border-navy bg-navy text-white" : "border-input bg-white text-transparent"
                            )}
                            aria-hidden="true"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-sm leading-relaxed">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {isSynced && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 sm:col-span-2">
                <div className="mb-4">
                  <p className="font-semibold text-blue-950">Cập nhật Vận hành</p>
                  <p className="text-xs text-blue-800/75">
                    {operationFeatureLocked
                      ? "Đồng bộ hai chiều đang tắt. Bạn vẫn có thể gắn thiết bị; các trường Vận hành tạm khóa."
                      : operationFieldsLocked
                      ? "Phiếu đã xử lý xong. Chỉ Ghi chú được phép thay đổi."
                      : "Có thể cập nhật ngay cả khi chưa gắn thiết bị; các trường Vận hành cột 10–15 được ghi ngược lên Google Sheet."}
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <StackField label="Mức độ">
                    <Select value={form.severity} onValueChange={selectSeverity} disabled={operationFieldsLocked}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Chọn mức độ" /></SelectTrigger>
                      <SelectContent>
                        {DEFECT_SEVERITY_ORDER.map((severity) => (
                          <SelectItem key={severity} value={severity}>Mức {severity}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </StackField>
                  <StackField label="KQ Vận hành">
                    <Select value={form.status} onValueChange={(value) => set("status", value)} disabled={operationFieldsLocked}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DEFECT_STATUS_ORDER.map((status) => (
                          <SelectItem key={status} value={status}>{DEFECT_STATUS[status].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </StackField>
                  <StackField label="Ảnh hưởng PCCC">
                    <Select value={form.fireSafetyImpact} onValueChange={(value) => set("fireSafetyImpact", value)} disabled={operationFieldsLocked}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>{YES_NO_OPTIONS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </StackField>
                  <StackField label="Môi trường, ATVSLĐ">
                    <Select value={form.environmentSafetyImpact} onValueChange={(value) => set("environmentSafetyImpact", value)} disabled={operationFieldsLocked}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>{YES_NO_OPTIONS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </StackField>
                  <StackField label="Điều kiện thực hiện">
                    <Select value={form.condition} onValueChange={(value) => set("condition", value)} disabled={operationFieldsLocked}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Chọn điều kiện" /></SelectTrigger>
                      <SelectContent>{DEFECT_CONDITION_ORDER.map((value) => <SelectItem key={value} value={value}>{DEFECT_CONDITION[value]}</SelectItem>)}</SelectContent>
                    </Select>
                  </StackField>
                  <StackField label="Ghi chú">
                    <Input className="h-11" value={form.note} disabled={operationFeatureLocked} onChange={(event) => set("note", event.target.value)} />
                  </StackField>
                </div>
                <p className="mt-3 text-xs text-blue-800/75">Nhắc lại được ghi riêng vào cột H bằng nút “Nhắc lại” trên danh sách.</p>
              </div>
            )}
            {isSynced && defect?.status === "DA_XU_LY" && (
              <Field label="Tồn đọng" full>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={form.postRepairAwaitingMaterial}
                  onClick={() => set("postRepairAwaitingMaterial", !form.postRepairAwaitingMaterial)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                    form.postRepairAwaitingMaterial
                      ? "border-amber-300 bg-amber-50"
                      : "border-border bg-white hover:border-amber-200"
                  )}
                >
                  <span className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                    form.postRepairAwaitingMaterial
                      ? "border-amber-600 bg-amber-600 text-white"
                      : "border-slate-300 bg-white"
                  )}>
                    {form.postRepairAwaitingMaterial && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">Đánh dấu chờ vật tư</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      Các phiếu trạng thái đã xử lý nhưng kết quả chờ vật tư.
                    </span>
                  </span>
                </button>
              </Field>
            )}
            </Section>

            {/* Luồng phiếu Sheet: ba trường này đã có bản SỬA ĐƯỢC trong thẻ "Cập nhật
                Vận hành" ngay phía trên. Hiện thêm một bản khoá mờ chỉ gây nhiễu và
                khiến người dùng không biết ô nào mới là ô có tác dụng. */}
            <Section eyebrow="Phân loại & ảnh hưởng" hidden={isSynced}>
            <Field label="Điều kiện thực hiện" required>
              <Select value={form.condition || NONE} onValueChange={(v) => set("condition", v === NONE ? "" : v)} disabled={isSynced}>
                <SelectTrigger><SelectValue placeholder="Chọn điều kiện" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {DEFECT_CONDITION_ORDER.map((c) => <SelectItem key={c} value={c}>{DEFECT_CONDITION[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Ảnh hưởng PCCC">
              <Select value={form.fireSafetyImpact} onValueChange={(v) => set("fireSafetyImpact", v)} disabled={isSynced}>
                <SelectTrigger><SelectValue placeholder="Chọn ảnh hưởng PCCC" /></SelectTrigger>
                <SelectContent>
                  {YES_NO_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Môi trường, ATVSLĐ">
              <Select value={form.environmentSafetyImpact} onValueChange={(v) => set("environmentSafetyImpact", v)} disabled={isSynced}>
                <SelectTrigger><SelectValue placeholder="Chọn ảnh hưởng môi trường, ATVSLĐ" /></SelectTrigger>
                <SelectContent>
                  {YES_NO_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            </Section>

            <Section
              eyebrow={isSynced ? "Dữ liệu gốc từ Sheet" : "Ghi nhận"}
              hint={isSynced ? "Chỉ đọc — do nguồn Google Sheet quyết định." : undefined}
            >
            <Field label="Ngày phát hiện">
              <Input type="date" value={form.detectedAt} disabled={isSynced} onChange={(e) => set("detectedAt", e.target.value)} />
            </Field>
            <Field label="Trưởng ca" required>
              <Select value={form.shiftLeaderId || NONE} onValueChange={(value) => set("shiftLeaderId", value === NONE ? "" : value)} disabled={isSynced}>
                <SelectTrigger><SelectValue placeholder="Chọn Trưởng ca" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {shiftLeaders.map((leader) => (
                    <SelectItem key={leader.id} value={leader.id}>
                      {leader.name}{leader.employeeId ? ` · ${leader.employeeId}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!usersQuery.isLoading && shiftLeaders.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-700">Chưa có nhân viên hoạt động được khai báo cương vị Trưởng ca.</p>
              )}
            </Field>
            </Section>
          </div>
        </div>
        {isSynced && defect && (
          <div className={cn(step === 2 ? "block" : "hidden")}>
            <div className="mx-auto max-w-2xl space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <h3 className="font-bold text-emerald-900">Dữ liệu của bộ phận Sửa chữa</h3>
                <p className="mt-1 text-sm text-emerald-800">
                  Các nội dung dưới đây được đọc từ cột 18–27 trên Google Sheet.
                </p>
              </div>

              <div className="grid gap-4 rounded-xl border border-border bg-white p-4 sm:grid-cols-2">
                <SourcePreviewValue label="Số PCT/LCT" value={defect.repairOrderNumberRaw || "—"} />
                <SourcePreviewValue label="Đơn vị sửa chữa" value={defect.repairUnitRaw || "—"} />
                <SourcePreviewValue label="Người thực hiện" value={defect.repairPerformedByRaw || "—"} />
                <SourcePreviewValue
                  label="Ngày thực hiện"
                  value={defect.repairStartedAt ? formatDate(defect.repairStartedAt) : "—"}
                />
                <SourcePreviewValue
                  label="Ngày kết thúc"
                  value={defect.sourceCompletedAt ? formatDate(defect.sourceCompletedAt) : "—"}
                />
              </div>

              <div className="space-y-4 rounded-xl border border-border bg-white p-4">
                <SourcePreviewValue label="Giải pháp sửa chữa" value={defect.repairSolutionRaw || "—"} />
                <SourcePreviewValue label="Kế hoạch thực hiện" value={defect.repairPlanRaw || "—"} />
                <SourcePreviewValue label="Kết quả thực hiện" value={defect.repairResultRaw || "—"} />
                <SourcePreviewValue label="Nội dung đã thực hiện" value={defect.repairPerformedContentRaw || "—"} />
                <SourcePreviewValue label="Ghi chú Sửa chữa" value={defect.repairNoteRaw || "—"} />
              </div>
            </div>
          </div>
        )}

        <div className={cn(!isSynced && step === 2 ? "block" : "hidden")}>
          <div className="mx-auto max-w-2xl space-y-6">
            <Section
              eyebrow="Mức độ khiếm khuyết"
              hint="Chọn một mức phù hợp với mức độ ảnh hưởng. Mỗi mức có bộ tiêu chí riêng ở dưới."
              single
            >
            {/* Bốn thẻ ngang: trước chỉ ghi "Mức 1..4" nên phải bấm thử mới biết
                mỗi mức nghĩa là gì. Nay hiện luôn câu mô tả của mức đó. */}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Mức độ khiếm khuyết">
              {DEFECT_SEVERITY_ORDER.map((severity) => {
                const active = form.severity === severity;
                const meta = DEFECT_SEVERITY_CRITERIA[severity as keyof typeof DEFECT_SEVERITY_CRITERIA];
                return (
                  <button
                    key={severity}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => selectSeverity(severity)}
                    className={cn(
                      "flex min-h-[64px] flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                      active
                        ? "border-navy bg-navy text-white shadow-sm"
                        : "border-input bg-white text-ink hover:border-accent/50 hover:bg-blue-50/50"
                    )}
                  >
                    <span className={cn("font-mono text-[12px] font-bold uppercase tracking-wide", active ? "text-white" : "text-navy")}>
                      Mức {severity}
                    </span>
                    {meta?.title && (
                      <span className={cn("break-words text-[11.5px] leading-snug", active ? "text-white/85" : "text-muted-foreground")}>
                        {meta.title}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {form.severity && (() => {
              const config = DEFECT_SEVERITY_CRITERIA[form.severity as keyof typeof DEFECT_SEVERITY_CRITERIA];
              if (!config) return null;
              return (
                <div className="mt-4 rounded-xl border border-border bg-white p-4 shadow-sm">
                  <div className="border-b border-border pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-bold text-ink">{config.title}</h4>
                      {!isEdit && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                          Chọn ít nhất 1 tiêu chí
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{config.guidance}</p>
                  </div>
                  <div className="mt-3 space-y-2" role="group" aria-label={`Tiêu chí Mức ${form.severity}`}>
                    {config.options.map((option) => {
                      const checked = form.severityCriteria.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleSeverityCriterion(option.id)}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                            checked
                              ? "border-blue-300 bg-blue-50 text-ink"
                              : "border-transparent bg-muted/35 text-ink hover:border-border hover:bg-muted/60"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                              checked ? "border-navy bg-navy text-white" : "border-input bg-white text-transparent"
                            )}
                            aria-hidden="true"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-sm leading-relaxed">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            </Section>
          </div>
        </div>
        {isSynced && ["1", "2", "3", "4"].includes(form.severity) && (
          <div className={cn(step === 3 ? "block" : "hidden")}>
            <div className="mx-auto max-w-xl space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <h3 className="font-bold text-blue-900">Hình ảnh khiếm khuyết Mức {form.severity}</h3>
                <p className="mt-1 text-sm text-blue-800">
                  Ảnh do VHV bổ sung được lưu trên web, không ghi ngược lên Google Sheet và không bị lần đồng bộ sau ghi đè.
                </p>
              </div>
              <StackField label={`Hình ảnh khiếm khuyết (tối đa ${MAX_DEFECT_IMAGES})`}>
                <MultiImagePicker
                  value={form.images}
                  onChange={(images) => set("images", images)}
                  max={MAX_DEFECT_IMAGES}
                  maxFileSizeMb={15}
                />
                <p className="text-xs text-muted-foreground">
                  {`Hỗ trợ tối đa ${MAX_DEFECT_IMAGES} ảnh, mỗi ảnh tối đa 15MB.`}
                </p>
              </StackField>
            </div>
          </div>
        )}
        {isSynced && defect && (
          <div className={cn(step === 4 ? "block" : "hidden")}>
            <div className="mx-auto max-w-2xl space-y-4">
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
                <h3 className="font-bold text-red-900">BGĐ chỉ đạo</h3>
                <p className="mt-1 text-sm text-red-800/80">
                  Dữ liệu tham khảo được đọc từ cột 16–17 trên Google Sheet; website không ghi ngược hai nội dung này.
                </p>
              </div>
              <div className="space-y-5 rounded-xl border border-border bg-white p-5 shadow-sm">
                <SourcePreviewValue label="KTAT rà soát" value={defect.ktatReviewRaw || "—"} />
                <SourcePreviewValue label="BGĐ chỉ đạo" value={defect.boardDirectionRaw || "—"} />
              </div>
            </div>
          </div>
        )}

        <div className={cn(!isSynced && step === 3 ? "block" : "hidden")}>
          <div className="mx-auto w-full max-w-2xl space-y-6">
            <Section eyebrow="Phiếu yêu cầu">
              <Field label="Yêu cầu" required hint="Cơ và Điện ghi vào hai Google Sheet khác nhau.">
                  <Select value={form.requestType} onValueChange={selectRequestType} disabled={isEdit}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Chọn loại yêu cầu" /></SelectTrigger>
                    <SelectContent>
                      {requestTypeOptions.map((t) => (
                        <SelectItem key={t} value={t}>{requestTypeLabel(t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
              </Field>
              {form.requestType === "Môi Trường" && (
                <Field
                  label="Sheet ghi nhận"
                  required
                  hint="Chọn đúng bộ phận quản lý để phiếu được ghi vào đúng tab Môi Trường."
                >
                  {section ? (
                    <div className="flex h-11 items-center rounded-md border border-blue-200 bg-blue-50/60 px-3 text-sm font-semibold text-blue-900">
                      Tự động: {DEFECT_ENVIRONMENT_SHEET_OPTIONS.find((option) => option.value === sectionSource)?.label}
                    </div>
                  ) : (
                    <Select
                      value={form.environmentSheet}
                      onValueChange={(value) => set("environmentSheet", value as "CO" | "DIEN")}
                      disabled={isEdit}
                    >
                      <SelectTrigger className="h-11"><SelectValue placeholder="Chọn Sheet Môi Trường" /></SelectTrigger>
                      <SelectContent>
                        {DEFECT_ENVIRONMENT_SHEET_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              )}
              <Field label="Số yêu cầu">
                {isEdit ? (
                  <Input className="h-11" value={form.requestNumber || "—"} disabled />
                ) : (
                  <div className="flex h-11 items-center rounded-md border border-dashed border-input bg-muted/30 px-3 text-[13px] text-muted-foreground">
                    {form.requestType === "Môi Trường" ? "Sẽ tự cấp số QTxx/năm khi lưu" : "Sẽ tự cấp số khi lưu"}
                  </div>
                )}
              </Field>
              <Field label="Nội dung" required full>
                <Textarea
                  className="min-h-[88px] resize-y"
                  value={form.content}
                  onChange={(e) => set("content", e.target.value)}
                  onFocus={(event) => {
                    const suffix = automaticContentSuffixRef.current;
                    if (suffix && form.content === suffix) event.currentTarget.setSelectionRange(0, 0);
                  }}
                  placeholder="Nhập nội dung khiếm khuyết"
                  required
                />
              </Field>
              <Field label="Sửa chữa lặp lại" full hint="Để trống nếu khiếm khuyết này chưa từng được sửa.">
                <Textarea
                  className="min-h-[64px] resize-y"
                  value={form.repeatedRepairRaw}
                  onChange={(e) => set("repeatedRepairRaw", e.target.value)}
                  placeholder="Để trống nếu không có"
                />
              </Field>
              <Field
                label={form.requestType === "Môi Trường" ? "Mã Trạm ghi lên Google Sheet" : "Tên thiết bị ghi lên Google Sheet (cột 3)"}
                required
                full
                hint={form.requestType === "Môi Trường"
                  ? "Đây là giá trị đi vào cột (3) Mã Trạm; không thay thế cho thiết bị được gắn trong cây."
                  : "Đây là giá trị đi vào cột Thiết bị của Sheet."}
              >
                <Input
                  className="h-11"
                  value={form.sourceDeviceRaw}
                  onChange={(e) => set("sourceDeviceRaw", e.target.value)}
                  placeholder={form.requestType === "Môi Trường"
                    ? "Nhập Mã Trạm"
                    : "Mặc định theo tên thiết bị đã chọn, có thể sửa lại"}
                  required
                />
              </Field>
            </Section>

            <Section eyebrow="Tình trạng & nhắc lại">
              <Field label="Tình trạng khiếm khuyết" full>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEFECT_STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{DEFECT_STATUS[s].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Số lần nhắc lại">
                  <Input
                    className="h-11"
                    type="number"
                    value={form.reminderCount}
                    readOnly
                    disabled
                  />
              </Field>
              <Field label="Ngày nhắc lại gần nhất">
                  <Input
                    className="h-11"
                    type="date"
                    value={form.lastRemindedAt}
                    readOnly
                    disabled
                  />
              </Field>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground sm:col-span-2">
                Hai ô trên chỉ đọc — hệ thống tự tính từ lịch sử khi bấm “Nhắc lại” trên danh sách.
              </p>
            </Section>

            <Section eyebrow="Bổ sung">
              <Field label="Ghi chú (Cột 15)" full>
                <Textarea className="min-h-[88px] resize-y" value={form.note} onChange={(e) => set("note", e.target.value)} />
              </Field>
              {["1", "2", "3", "4"].includes(form.severity) && (
                <Field label={`Hình ảnh khiếm khuyết (tối đa ${MAX_DEFECT_IMAGES})`} full>
                  <MultiImagePicker
                    value={form.images}
                    onChange={(images) => set("images", images)}
                    max={MAX_DEFECT_IMAGES}
                    maxFileSizeMb={15}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ảnh được lưu tại S3 trong thư mục defects/images và tự động xoá khi khiếm khuyết hoàn thành.
                  </p>
                </Field>
              )}
            </Section>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-white p-4">
        {!isSynced && step > 1 && (
          <Button type="button" variant="outline" onClick={() => setStep(step === 3 ? 2 : 1)}>
            <ChevronLeft className="h-4 w-4" /> Trước
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => onCancel?.()}>Hủy bỏ</Button>
        {isSynced && (step === 1 || step === 3) ? (
          <Button type="button" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {step === 3
              ? "Lưu hình ảnh"
              : form.device || defect?.deviceSeq
                ? "Lưu thiết bị & Vận hành"
                : "Lưu Vận hành"}
          </Button>
        ) : isSynced ? (
          <Button type="button" onClick={() => setStep(1)}>
            <ChevronLeft className="h-4 w-4" /> Quay lại gắn thiết bị
          </Button>
        ) : step < 3 ? (
          <Button type="button" onClick={step === 1 ? goToSeverity : goToDefectInfo}>
            Kế tiếp <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
          </Button>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active, onClick, label, done = false, muted = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  /** Đã hoàn tất — hiện dấu tích xanh. */
  done?: boolean;
  /** Mục chỉ đọc (dữ liệu do Sheet đổ về) — chấm tròn rỗng để phân biệt mục nhập được. */
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-[13.5px] font-semibold transition-colors",
        active ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-ink"
      )}
    >
      {done && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
      {!done && muted && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-current opacity-50" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}

/**
 * Bước trong phiếu, có đánh số. Tab phẳng không cho biết đang ở đâu trong ba bước
 * và còn bao nhiêu; số thứ tự + dấu tích của bước đã qua trả lại thông tin đó.
 */
function StepBtn({
  n, label, active, done = false, onClick,
}: {
  n: number;
  label: string;
  active: boolean;
  done?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "step" : undefined}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-1 py-3 text-[13.5px] font-semibold transition-colors",
        active ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-ink"
      )}
    >
      <span
        className={cn(
          "flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold transition-colors",
          active ? "bg-accent text-white" : done ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
        )}
      >
        {done && !active ? <Check className="h-3 w-3" /> : n}
      </span>
      {label}
    </button>
  );
}

/**
 * Nhóm trường có tiêu đề nhỏ kiểu bảng điều khiển: chữ mono viết hoa, giãn ký tự,
 * kèm đường kẻ mảnh. Thay cho danh sách phẳng — mắt bắt được ngay đang khai báo
 * cụm nào (định vị / phân loại / ghi nhận) thay vì đọc tuần tự 10 dòng.
 */
function Section({
  eyebrow,
  hint,
  children,
  hidden = false,
  single = false,
}: {
  eyebrow: string;
  hint?: string;
  children: React.ReactNode;
  hidden?: boolean;
  /** Bỏ lưới 2 cột — dùng cho nhóm chỉ chứa khối lớn (thẻ chọn, danh sách tiêu chí). */
  single?: boolean;
}) {
  if (hidden) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="whitespace-nowrap font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      {hint && <p className="-mt-1 text-[12px] leading-relaxed text-muted-foreground">{hint}</p>}
      <div className={cn(single ? "space-y-3.5" : "grid gap-x-4 gap-y-3.5 sm:grid-cols-2")}>{children}</div>
    </section>
  );
}

/**
 * Một trường: nhãn NẰM TRÊN ô nhập. Bố cục cũ dành hẳn 180px cột nhãn bên trái,
 * vừa phí ngang vừa khiến nhãn dài phải xuống dòng lệch khỏi ô của nó.
 */
function Field({
  label,
  required = false,
  hint,
  full = false,
  hidden = false,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  /** Chiếm trọn chiều ngang — dùng cho cây thiết bị, danh sách, khối lớn. */
  full?: boolean;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  if (hidden) return null;
  return (
    <div className={cn("min-w-0 space-y-1.5", full && "sm:col-span-2")}>
      <Label className="flex items-center gap-1 text-[12.5px] font-semibold text-ink">
        {label}
        {required && <span className="text-destructive" aria-hidden="true">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11.5px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Row({ label, children, compact = false, hidden = false }: { label: string; children: React.ReactNode; compact?: boolean; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div className={cn("grid items-center gap-4", compact ? "grid-cols-[88px_1fr]" : "grid-cols-[180px_1fr]")}>
      <Label className="whitespace-nowrap text-right text-muted-foreground">{label}</Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function StackField({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="grid gap-2">
      <Label className="text-sm font-semibold text-slate-600">
        {label}{required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SourcePreviewValue({ label, value, pending = false }: { label: string; value: string; pending?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-1 whitespace-pre-wrap break-words text-sm",
        pending ? "font-medium italic text-amber-700" : "text-ink"
      )}>
        {value}
      </p>
    </div>
  );
}

function LockedValue({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5">
      <div className="text-sm font-semibold text-ink">{primary}</div>
      {secondary && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{secondary}</div>}
    </div>
  );
}

function RelatedDeviceRow({
  seq,
  scope,
  onRemove,
  role = "Thiết bị liên quan",
}: {
  seq: string;
  scope?: TreeScope;
  onRemove: () => void;
  role?: string;
}) {
  const nodeQuery = useEquipmentNode(seq, scope);
  const name = nodeQuery.data?.data.name ?? (nodeQuery.isLoading ? "Đang tải tên thiết bị…" : seq);
  const code = nodeQuery.data?.data.fullCode ?? seq;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
        <Cpu className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">{name}</div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{role}</span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">{code}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white hover:text-destructive"
        aria-label={`Bỏ thiết bị ${name}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
