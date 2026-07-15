"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  Clock3,
  GripVertical,
  History,
  Loader2,
  Plus,
  Settings2,
  ShieldCheck,
  UserMinus,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/nav";
import {
  PositionRotation,
  RotationTemplate,
  StaffingAssignment,
  StaffingPosition,
  useMutateShiftStaffing,
  useShiftStaffing,
} from "@/hooks/useShiftStaffing";

const TYPE_LABEL = {
  OFFICIAL: "Chính thức",
  BACKUP: "Dự phòng",
  TRAINING: "Đào tạo",
  TEMPORARY: "Tạm thời",
  ADMINISTRATIVE: "Hành chính",
} as const;
const SHIFT_LABEL = {
  MORNING: "S",
  AFTERNOON: "C",
  NIGHT: "Đ",
  OFF: "N",
} as const;
const SHIFT_NAME = {
  MORNING: "Ca sáng",
  AFTERNOON: "Ca chiều",
  NIGHT: "Ca đêm",
  OFF: "Nghỉ",
} as const;
const QUICK_CREWS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
const today = () => new Date().toISOString().slice(0, 10);
const viDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("vi-VN", { timeZone: "UTC" })
    : "Không thời hạn";
const effective = (
  item: {
    effectiveFrom?: string;
    effectiveTo?: string | null;
    startDate?: string;
    endDate?: string | null;
  },
  at = today(),
) =>
  (item.effectiveFrom ?? item.startDate ?? "").slice(0, 10) <= at &&
  (!(item.effectiveTo ?? item.endDate) ||
    (item.effectiveTo ?? item.endDate)!.slice(0, 10) >= at);
const utcDayNumber = (value: string) =>
  Math.floor(new Date(`${value.slice(0, 10)}T00:00:00.000Z`).getTime() / 86_400_000);
const cycleStepAt = (
  item: Pick<StaffingAssignment, "cycleStartDate" | "phaseIndex" | "startDate">,
  template: RotationTemplate,
  at = today(),
) => {
  const baseDate = item.cycleStartDate?.slice(0, 10) ?? item.startDate.slice(0, 10);
  const baseStep = item.cycleStartDate ? 0 : item.phaseIndex;
  if (baseStep === null) return null;
  const elapsed = utcDayNumber(at) - utcDayNumber(baseDate);
  return ((baseStep + elapsed) % template.cycleLength + template.cycleLength) % template.cycleLength;
};
const cycleStartForStep = (effectiveDate: string, step: number) => {
  const result = new Date(`${effectiveDate}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() - step);
  return result.toISOString().slice(0, 10);
};
const uniformCoverage = (p: StaffingPosition) =>
  p.requiredMorningStaff !== null &&
  p.requiredMorningStaff === p.requiredAfternoonStaff &&
  p.requiredMorningStaff === p.requiredNightStaff;
const coverageLabel = (p: StaffingPosition) =>
  uniformCoverage(p)
    ? `${p.requiredMorningStaff} người/ca`
    : p.requiredMorningStaff === null
      ? "Chưa cấu hình"
      : "Theo từng ca";
const expectedCrews = (code?: string) =>
  code?.startsWith("45K")
    ? 4.5
    : code?.startsWith("55K")
      ? 5.5
      : code?.startsWith("4K")
        ? 4
        : code?.startsWith("5K")
          ? 5
          : code?.startsWith("6K")
            ? 6
            : null;

function currentRotation(
  position: StaffingPosition,
  rotations: PositionRotation[],
) {
  return rotations.find(
    (item) => item.positionConfigId === position.id && effective(item),
  );
}
function metrics(
  position: StaffingPosition,
  assignments: StaffingAssignment[],
  rotations: PositionRotation[],
) {
  const current = assignments.filter(
    (item) =>
      item.positionId === position.id &&
      item.assignmentType === "OFFICIAL" &&
      effective(item),
  );
  const rotation = currentRotation(position, rotations);
  const rotationHistory = rotations.filter(
    (item) => item.positionConfigId === position.id,
  );
  const uniform = uniformCoverage(position);
  const required = uniform ? position.requiredMorningStaff : null;
  const equivalent = required ? current.length / required : null;
  const warnings: string[] = [];
  if (position.requiredMorningStaff === null)
    warnings.push("Chưa cấu hình nhu cầu từng ca");
  if (!uniform && position.requiredMorningStaff !== null)
    warnings.push(
      "Cương vị có nhu cầu theo từng ca cần kiểm tra bằng lịch thực tế",
    );
  if (!rotation)
    warnings.push(
      rotationHistory.length
        ? "Mẫu xoay ca đã hết hiệu lực"
        : "Mẫu xoay ca chưa được chọn",
    );
  const sortedRotations = [...rotationHistory].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
  if (
    sortedRotations.some(
      (item, index) =>
        index > 0 &&
        (!sortedRotations[index - 1].effectiveTo ||
          sortedRotations[index - 1].effectiveTo! >= item.effectiveFrom),
    )
  )
    warnings.push("Có hai mẫu xoay ca chồng lấn");
  if (current.some((item) => !item.crewCode))
    warnings.push("Có nhân sự chưa được phân kíp");
  if (current.some((item) => !item.cycleStartDate && item.phaseIndex === null))
    warnings.push("Có nhân sự chưa xác định được bước chu kỳ");
  if (
    rotation &&
    current.some(
      (item) =>
        item.phaseIndex !== null &&
        item.phaseIndex >= rotation.rotationTemplate.cycleLength,
    )
  )
    warnings.push("Có bước chu kỳ không phù hợp với mẫu đang áp dụng");
  const phases = current
    .map((x) => x.phaseIndex)
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  if (
    phases.length &&
    Array.from({ length: Math.max(...phases) + 1 }, (_, i) => i).some(
      (i) => !phases.includes(i),
    )
  )
    warnings.push("Chu kỳ đang thiếu một số bước");
  const phaseCrews = new Map<string, Set<string>>();
  let duplicatePhase = false;
  for (const item of current) {
    if (item.phaseIndex === null) continue;
    const key =
      position.positionType === "SINGLE"
        ? `${item.phaseIndex}`
        : `${item.phaseIndex}:${item.stationCode ?? "NONE"}`;
    const crews = phaseCrews.get(key) ?? new Set<string>();
    crews.add(item.crewCode ?? "NONE");
    if (crews.size > 1) duplicatePhase = true;
    phaseCrews.set(key, crews);
  }
  if (duplicatePhase) warnings.push("Có bước chu kỳ bị trùng giữa các kíp");
  if (position.positionType === "S1_S2") {
    if (current.some((item) => !item.stationCode))
      warnings.push("Có nhân sự chưa được phân S1/S2/FLEX");
    const s1 = current.filter((x) => x.stationCode === "S1").length,
      s2 = current.filter((x) => x.stationCode === "S2").length;
    if (Math.abs(s1 - s2) > 1) warnings.push("Phân bổ S1/S2 chưa cân bằng");
    for (const crew of new Set(
      current.map((x) => x.crewCode).filter(Boolean),
    )) {
      const crewItems = current.filter((x) => x.crewCode === crew);
      if (
        !crewItems.some(
          (x) => x.stationCode === "S1" || x.stationCode === "FLEX",
        ) ||
        !crewItems.some(
          (x) => x.stationCode === "S2" || x.stationCode === "FLEX",
        )
      )
        warnings.push(`Kíp ${crew} đang thiếu S1 hoặc S2`);
    }
  }
  const expected = expectedCrews(rotation?.rotationTemplate.code);
  if (equivalent !== null && expected !== null && equivalent !== expected)
    warnings.push("Số nhân sự không phù hợp với mẫu đang áp dụng");
  return {
    current,
    rotation,
    uniform,
    equivalent,
    warnings,
    s1: current.filter((x) => x.stationCode === "S1").length,
    s2: current.filter((x) => x.stationCode === "S2").length,
    flex: current.filter((x) => x.stationCode === "FLEX").length,
    unstationed: current.filter((x) => !x.stationCode).length,
  };
}

type FormMode = "assign" | "change" | "detach";
const initialForm = {
  userId: "",
  positionId: "",
  crewCode: "",
  phaseIndex: "",
  cycleStartDate: "",
  stationCode: "",
  assignmentType: "OFFICIAL",
  effectiveDate: today(),
  endDate: "",
  reason: "",
  note: "",
};

export default function ShiftStaffingPage() {
  const query = useShiftStaffing(),
    mutation = useMutateShiftStaffing(),
    data = query.data?.data;
  const canManage =
      data?.permissionLevel === "manage" || data?.permissionLevel === "full",
    canConfigure = data?.permissionLevel === "full";
  const positions = data?.positions ?? [],
    assignments = data?.assignments ?? [],
    rotations = data?.positionRotations ?? [],
    templates = data?.rotationTemplates ?? [];
  const positionGroups = React.useMemo(() => {
    const shift: StaffingPosition[] = [];
    const administrative: StaffingPosition[] = [];
    for (const position of positions) {
      const hasShiftAssignment = assignments.some(
        (item) =>
          item.positionId === position.id &&
          item.assignmentType !== "ADMINISTRATIVE" &&
          !!item.crewCode &&
          effective(item),
      );
      const hasCurrentRotation = rotations.some(
        (item) => item.positionConfigId === position.id && effective(item),
      );
      (hasShiftAssignment || hasCurrentRotation ? shift : administrative).push(
        position,
      );
    }
    return [
      {
        key: "shift",
        label: "Cương vị đi ca",
        description: "Có biên chế kíp hoặc mẫu xoay đang áp dụng",
        icon: Clock3,
        positions: shift,
        tone: "border-sky-200 bg-sky-50/80 text-sky-900",
      },
      {
        key: "administrative",
        label: "Cương vị hành chính",
        description: "Không tham gia vòng xoay ca hiện hành",
        icon: BriefcaseBusiness,
        positions: administrative,
        tone: "border-emerald-200 bg-emerald-50/80 text-emerald-900",
      },
    ];
  }, [assignments, positions, rotations]);
  const [selectedName, setSelectedName] = React.useState("");
  const selected = positions.find((p) => p.name === selectedName);
  const selectedMetrics = selected
    ? metrics(selected, assignments, rotations)
    : null;
  const [showHistory, setShowHistory] = React.useState(false),
    [configOpen, setConfigOpen] = React.useState(false),
    [rotationOpen, setRotationOpen] = React.useState(false);
  const [lastEffectiveChange, setLastEffectiveChange] = React.useState<{ date: string; positionId: string } | null>(null);
  const [coverage, setCoverage] = React.useState({
    morning: 1,
    afternoon: 1,
    night: 1,
    mode: "one",
    reason: "",
  });
  const [rotationForm, setRotationForm] = React.useState({
    templateId: "",
    effectiveFrom: today(),
    effectiveTo: "",
    reason: "",
  });
  const [mode, setMode] = React.useState<FormMode | null>(null),
    [editing, setEditing] = React.useState<StaffingAssignment | null>(null),
    [form, setForm] = React.useState(initialForm),
    [userSearch, setUserSearch] = React.useState(""),
    [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([]),
    [showCycleStepPicker, setShowCycleStepPicker] = React.useState(false);
  const filteredUsers = React.useMemo(() => {
    const keyword = normalizeText(userSearch.trim());
    if (!keyword) return data?.users ?? [];
    return (data?.users ?? []).filter((user) =>
      normalizeText(
        `${user.employeeId} ${user.name} ${user.position ?? ""}`,
      ).includes(keyword),
    );
  }, [data?.users, userSearch]);
  const visibleAssignments = selected
    ? assignments.filter(
        (x) => x.positionId === selected.id && (showHistory || effective(x)),
      )
    : [];
  const formRotation = rotations.find(
    (item) =>
      item.positionConfigId === form.positionId &&
      effective(item, form.effectiveDate || today()),
  );
  const formTemplate = formRotation?.rotationTemplate;
  function setField(key: keyof typeof form, value: string) {
    setForm((old) => ({ ...old, [key]: value }));
  }
  function setCrewCode(value: string) {
    const crewCode = value.toUpperCase();
    setForm((old) => {
      const existingCrew = assignments.find(
        (item) =>
          item.positionId === old.positionId &&
          item.crewCode === crewCode &&
          !!item.cycleStartDate &&
          effective(item, old.effectiveDate || today()),
      );
      return {
        ...old,
        crewCode,
        cycleStartDate: old.cycleStartDate || existingCrew?.cycleStartDate?.slice(0, 10) || "",
      };
    });
  }
  function openConfig(p: StaffingPosition) {
    const m = p.requiredMorningStaff ?? 1,
      a = p.requiredAfternoonStaff ?? m,
      n = p.requiredNightStaff ?? m;
    setCoverage({
      morning: m,
      afternoon: a,
      night: n,
      mode:
        m === a && a === n && m === 1
          ? "one"
          : m === a && a === n && m === 2
            ? "two"
            : "custom",
      reason: "",
    });
    setConfigOpen(true);
  }
  function quickCoverage(modeValue: string) {
    setCoverage((old) => ({
      ...old,
      mode: modeValue,
      ...(modeValue === "one"
        ? { morning: 1, afternoon: 1, night: 1 }
        : modeValue === "two"
          ? { morning: 2, afternoon: 2, night: 2 }
          : {}),
    }));
  }
  function openAssign() {
    if (!selected?.id) return toast.error("Hãy cấu hình cương vị trước");
    setEditing(null);
    setUserSearch("");
    setSelectedUserIds([]);
    setForm({
      ...initialForm,
      positionId: selected.id,
      effectiveDate: today(),
    });
    setMode("assign");
  }
  function openMatrixCell(
    position: StaffingPosition,
    crewCode: string,
    stationCode: "S1" | "S2" | "FLEX" | "",
  ) {
    if (!position.id) return toast.error("Hãy cấu hình cương vị trước");
    setSelectedName(position.name);
    setEditing(null);
    setUserSearch("");
    setSelectedUserIds([]);
    const existingCrew = assignments.find(
      (item) =>
        item.positionId === position.id &&
        item.crewCode === crewCode &&
        !!item.cycleStartDate &&
        effective(item),
    );
    setForm({
      ...initialForm,
      positionId: position.id,
      crewCode,
      stationCode,
      cycleStartDate: existingCrew?.cycleStartDate?.slice(0, 10) ?? "",
      effectiveDate: today(),
    });
    setMode("assign");
  }
  function openMatrixMove(
    item: StaffingAssignment,
    position: StaffingPosition,
    crewCode: string,
    stationCode: "S1" | "S2" | "FLEX" | "",
  ) {
    if (!position.id) return;
    if (
      item.positionId === position.id &&
      item.crewCode === crewCode &&
      (item.stationCode ?? "") === stationCode
    ) return;
    setSelectedName(position.name);
    setEditing(item);
    setUserSearch("");
    const existingCrew = assignments.find(
      (assignment) =>
        assignment.positionId === position.id &&
        assignment.crewCode === crewCode &&
        !!assignment.cycleStartDate &&
        effective(assignment),
    );
    setForm({
      userId: item.userId,
      positionId: position.id,
      crewCode,
      phaseIndex: "",
      cycleStartDate:
        existingCrew?.cycleStartDate?.slice(0, 10) ??
        item.cycleStartDate?.slice(0, 10) ??
        "",
      stationCode,
      assignmentType: item.assignmentType,
      effectiveDate: today(),
      endDate: "",
      reason: "",
      note: item.note ?? "",
    });
    setMode("change");
  }
  function openChange(item: StaffingAssignment) {
    setEditing(item);
    setUserSearch("");
    setForm({
      userId: item.userId,
      positionId: item.positionId,
      crewCode: item.crewCode ?? "",
      phaseIndex: item.phaseIndex === null ? "" : String(item.phaseIndex),
      cycleStartDate: item.cycleStartDate?.slice(0, 10) ?? "",
      stationCode: item.stationCode ?? "",
      assignmentType: item.assignmentType,
      effectiveDate: today(),
      endDate: "",
      reason: "",
      note: item.note ?? "",
    });
    setMode("change");
  }
  async function saveConfig() {
    if (!selected) return;
    if (selected.id && coverage.reason.trim().length < 3) {
      toast.error("Vui lòng nhập lý do thay đổi (ít nhất 3 ký tự)");
      return;
    }
    try {
      await mutation.mutateAsync({
        action: "CONFIGURE_POSITION",
        name: selected.name,
        requiredMorningStaff: coverage.morning,
        requiredAfternoonStaff: coverage.afternoon,
        requiredNightStaff: coverage.night,
        isActive: true,
        reason: coverage.reason,
      });
      toast.success("Đã cập nhật nhu cầu từng ca");
      setConfigOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function saveRotation() {
    if (!selected?.id) return;
    try {
      await mutation.mutateAsync({
        action: "ASSIGN_POSITION_ROTATION",
        positionConfigId: selected.id,
        rotationTemplateId: rotationForm.templateId,
        effectiveFrom: rotationForm.effectiveFrom,
        effectiveTo: rotationForm.effectiveTo || null,
        reason: rotationForm.reason,
      });
      toast.success("Đã áp dụng mẫu xoay ca và giữ lịch sử cũ");
      setRotationOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function saveAssignment() {
    if (!mode || (!editing && mode !== "assign")) return;
    try {
      if (mode === "detach")
        await mutation.mutateAsync({
          action: "DETACH",
          assignmentId: editing!.id,
          effectiveDate: form.effectiveDate,
          reason: form.reason,
        });
      else {
        const target = positions.find((p) => p.id === form.positionId);
        await mutation.mutateAsync({
          action:
            mode === "assign" && selectedUserIds.length > 1
              ? "BULK_ASSIGN"
              : mode === "assign"
                ? "ASSIGN"
                : "CHANGE",
          ...(editing ? { assignmentId: editing.id } : {}),
          ...form,
          ...(mode === "assign" && selectedUserIds.length > 1
            ? {
                userIds: selectedUserIds,
              }
            : mode === "assign" && selectedUserIds.length === 1
              ? { userId: selectedUserIds[0] }
              : {}),
          crewCode: form.crewCode.trim() || null,
          phaseIndex: form.phaseIndex === "" ? null : Number(form.phaseIndex),
          cycleStartDate: form.cycleStartDate || null,
          stationCode:
            target?.positionType === "SINGLE" ? null : form.stationCode || null,
          endDate: form.endDate || null,
        });
      }
      toast.success(
        mode === "assign"
          ? selectedUserIds.length > 1
            ? `Đã gán ${selectedUserIds.length} nhân sự theo thứ tự đã chọn`
            : "Đã gán nhân sự"
          : mode === "detach"
            ? "Đã kết thúc phân công"
            : "Đã tạo phân công mới và giữ lịch sử cũ",
      );
      setLastEffectiveChange({
        date: form.effectiveDate,
        positionId: mode === "detach" ? editing?.positionId ?? form.positionId : form.positionId,
      });
      setMode(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  if (query.isLoading)
    return (
      <div className="space-y-6">
        <PageHeader title="QUẢN LÝ BIÊN CHẾ TRỰC CA" />
        <TableSkeleton />
      </div>
    );
  if (query.isError)
    return (
      <Card className="p-8 text-center text-destructive">
        {(query.error as Error).message}
      </Card>
    );
  return (
    <div className="space-y-6">
      <PageHeader
        title="QUẢN LÝ BIÊN CHẾ TRỰC CA"
        description="Nhu cầu từng ca · ngày bắt đầu chu kỳ · S1/S2/FLEX · mẫu xoay theo thời gian"
      >
        <Link href="/hr/shift-roster">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Lịch trực ca
          </Button>
        </Link>
        <Badge variant="outline" className="h-9 px-3">
          <ShieldCheck className="mr-1.5 h-4 w-4" />
          {canConfigure ? "Toàn quyền" : canManage ? "Quản lý" : "Chỉ xem"}
        </Badge>
      </PageHeader>
      {lastEffectiveChange && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-blue-200 bg-blue-50/70 p-4">
          <div>
            <div className="font-semibold text-blue-950">Biên chế đã thay đổi từ {viDate(lastEffectiveChange.date)}</div>
            <div className="text-sm text-blue-800">Có thể tạo một phiên bản lịch mới; lịch đã công bố không bị ghi đè.</div>
          </div>
          <Link href={`/hr/shift-roster/planning?from=${lastEffectiveChange.date}&positionId=${lastEffectiveChange.positionId}`}>
            <Button><CalendarClock className="h-4 w-4" /> Tạo lại lịch từ ngày hiệu lực</Button>
          </Link>
        </Card>
      )}
      <StaffingMatrix
        positions={positionGroups[0]?.positions ?? []}
        assignments={assignments}
        selectedName={selectedName}
        canManage={canManage}
        onSelectPosition={setSelectedName}
        onOpenCell={openMatrixCell}
        onOpenAssignment={openChange}
        onMoveAssignment={openMatrixMove}
      />
      <div className="grid gap-6 xl:grid-cols-1">
        <Card className="hidden overflow-hidden">
          <div className="border-b bg-slate-50 px-4 py-3">
            <div className="font-semibold">Danh sách cương vị</div>
            <div className="text-xs text-muted-foreground">
              Nhu cầu sáng · chiều · đêm và mẫu hiện hành
            </div>
          </div>
          <div className="max-h-[76vh] overflow-y-auto p-2">
            {positionGroups.map((group) => {
              const Icon = group.icon;
              return (
                <section key={group.key} className="mb-3 last:mb-0">
                  <div
                    className={cn(
                      "mb-2 rounded-lg border px-3 py-2.5",
                      group.tone,
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <Icon className="h-4 w-4" />
                        {group.label}
                      </div>
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold tabular-nums shadow-sm">
                        {group.positions.length}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] opacity-75">
                      {group.description}
                    </div>
                  </div>
                  {group.positions.map((p) => {
                    const m = metrics(p, assignments, rotations);
                    const isAdministrative = group.key === "administrative";
                    return (
                      <button
                        key={p.name}
                        onClick={() => setSelectedName(p.name)}
                        className={cn(
                          "mb-1 w-full cursor-pointer rounded-lg border p-3 text-left transition-colors",
                          selected?.name === p.name
                            ? isAdministrative
                              ? "border-emerald-300 bg-emerald-50"
                              : "border-amber-300 bg-amber-50"
                            : "border-transparent hover:border-slate-200 hover:bg-slate-50",
                        )}
                      >
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-ink">{p.name}</span>
                          {!isAdministrative && m.warnings.length > 0 && (
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                          )}
                        </div>
                        {isAdministrative ? (
                          <div className="mt-1.5 text-xs text-emerald-700">
                            Hành chính · không phát sinh lịch xoay ca
                          </div>
                        ) : (
                          <>
                            <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
                              <Mini label="Sáng" value={p.requiredMorningStaff ?? "—"} />
                              <Mini label="Chiều" value={p.requiredAfternoonStaff ?? "—"} />
                              <Mini label="Đêm" value={p.requiredNightStaff ?? "—"} />
                            </div>
                            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                              <span>{coverageLabel(p)}</span>
                              <span>{m.rotation?.rotationTemplate.code ?? "Chưa có mẫu"}</span>
                            </div>
                          </>
                        )}
                      </button>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </Card>
        {selected && selectedMetrics && (
          <div className="min-w-0 space-y-4">
            <Card className="border-l-4 border-l-amber-500 p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-700">
                    Cương vị đang chọn
                  </div>
                  <h2 className="mt-1 text-xl font-bold">{selected.name}</h2>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {selectedMetrics.uniform
                      ? `Đồng đều · ${coverageLabel(selected)}`
                      : "Biên chế theo từng ca"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canConfigure && (
                    <Button
                      variant="outline"
                      onClick={() => openConfig(selected)}
                    >
                      <Settings2 className="h-4 w-4" /> Nhu cầu
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setRotationForm({
                          templateId:
                            selectedMetrics.rotation?.rotationTemplateId ??
                            templates[0]?.id ??
                            "",
                          effectiveFrom: today(),
                          effectiveTo: "",
                          reason: "",
                        });
                        setRotationOpen(true);
                      }}
                      disabled={!selected.id}
                    >
                      <CalendarClock className="h-4 w-4" /> Chọn mẫu xoay
                    </Button>
                  )}
                  {canManage && (
                    <Button onClick={openAssign} disabled={!selected.id}>
                      <UserPlus className="h-4 w-4" /> Gán nhân sự
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                <Stat
                  label="Chính thức"
                  value={selectedMetrics.current.length}
                />
                <Stat
                  label="Kíp hiệu dụng"
                  value={
                    selectedMetrics.uniform &&
                    selectedMetrics.equivalent !== null
                      ? String(selectedMetrics.equivalent).replace(".", ",")
                      : "Theo ca"
                  }
                />
                <Stat label="S1" value={selectedMetrics.s1} />
                <Stat label="S2" value={selectedMetrics.s2} />
                <Stat label="FLEX" value={selectedMetrics.flex} />
                <Stat label="Chưa vị trí" value={selectedMetrics.unstationed} />
                <Stat
                  label="Mẫu xoay"
                  value={selectedMetrics.rotation?.rotationTemplate.code ?? "—"}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedMetrics.warnings.map((warning) => (
                  <span
                    key={warning}
                    className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200"
                  >
                    {warning}
                  </span>
                ))}
              </div>
            </Card>
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div>
                  <div className="font-semibold">Nhân sự của cương vị</div>
                  <div className="text-xs text-muted-foreground">
                    Mẫu hiện tại:{" "}
                    {selectedMetrics.rotation?.rotationTemplate.name ??
                      "chưa chọn"}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHistory((x) => !x)}
                >
                  <History className="h-4 w-4" />{" "}
                  {showHistory ? "Chỉ hiện tại" : "Xem lịch sử"}
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      {[
                        "Mã NV / Họ tên",
                        "Mã kíp",
                        "Bắt đầu chu kỳ",
                        "S1/S2/FLEX",
                        "Loại",
                        "Bắt đầu",
                        "Kết thúc",
                        "Trạng thái",
                        "Ghi chú",
                        "Thao tác",
                      ].map((x) => (
                        <th key={x} className="px-3 py-2.5 font-semibold">
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAssignments.map((item) => (
                      <tr key={item.id} className="border-t hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <div className="font-medium">{item.user.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {item.user.employeeId}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-bold">
                          {item.crewCode ?? (
                            <span className="text-amber-700">Chưa phân</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <CycleCell
                            item={item}
                            rotation={rotations.find(
                              (rotation) =>
                                rotation.positionConfigId === item.positionId &&
                                effective(rotation, item.startDate.slice(0, 10)),
                            )}
                          />
                        </td>
                        <td className="px-3 py-3">
                          {selected.positionType === "S1_S2"
                            ? (item.stationCode ?? "—")
                            : "—"}
                        </td>
                        <td className="px-3 py-3">
                          {TYPE_LABEL[item.assignmentType]}
                        </td>
                        <td className="px-3 py-3">{viDate(item.startDate)}</td>
                        <td className="px-3 py-3">{viDate(item.endDate)}</td>
                        <td className="px-3 py-3">
                          <Badge
                            variant={effective(item) ? "default" : "secondary"}
                          >
                            {effective(item) ? "Đang hiệu lực" : "Đã kết thúc"}
                          </Badge>
                        </td>
                        <td className="max-w-[190px] px-3 py-3 text-xs text-muted-foreground">
                          {item.note || item.changeReason}
                        </td>
                        <td className="px-3 py-3">
                          {canManage && effective(item) && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openChange(item)}
                                title="Thay đổi phân công"
                              >
                                <ArrowRightLeft className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditing(item);
                                  setForm({
                                    ...initialForm,
                                    effectiveDate: today(),
                                  });
                                  setMode("detach");
                                }}
                                title="Tách nhân sự"
                              >
                                <UserMinus className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!visibleAssignments.length && (
                      <tr>
                        <td
                          colSpan={10}
                          className="px-4 py-12 text-center text-muted-foreground"
                        >
                          <UsersRound className="mx-auto mb-2 h-8 w-8 opacity-40" />
                          Chưa có nhân sự
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
            <RotationSection
              position={selected}
              rotations={rotations}
              templates={templates}
              canConfigure={canConfigure}
            />
          </div>
        )}
      </div>
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cấu hình nhu cầu từng ca</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                ["one", "1 người mỗi ca"],
                ["two", "2 người mỗi ca"],
                ["custom", "Tùy chỉnh"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => quickCoverage(key)}
                  className={cn(
                    "cursor-pointer rounded-lg border p-3 text-sm font-semibold transition-colors",
                    coverage.mode === key
                      ? "border-amber-400 bg-amber-50"
                      : "hover:bg-slate-50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <NumberField
                label="Ca sáng"
                value={coverage.morning}
                disabled={coverage.mode !== "custom"}
                onChange={(v) => setCoverage((x) => ({ ...x, morning: v }))}
              />
              <NumberField
                label="Ca chiều"
                value={coverage.afternoon}
                disabled={coverage.mode !== "custom"}
                onChange={(v) => setCoverage((x) => ({ ...x, afternoon: v }))}
              />
              <NumberField
                label="Ca đêm"
                value={coverage.night}
                disabled={coverage.mode !== "custom"}
                onChange={(v) => setCoverage((x) => ({ ...x, night: v }))}
              />
            </div>
            <Field
              label={
                selected?.id
                  ? "Lý do thay đổi *"
                  : "Lý do khởi tạo (không bắt buộc)"
              }
            >
              <Textarea
                value={coverage.reason}
                onChange={(e) =>
                  setCoverage((x) => ({ ...x, reason: e.target.value }))
                }
                placeholder="Ví dụ: Điều chỉnh định biên theo phương án vận hành mới"
                aria-required={selected?.id ? "true" : "false"}
              />
              <p
                className={cn(
                  "text-xs",
                  selected?.id &&
                    coverage.reason.length > 0 &&
                    coverage.reason.trim().length < 3
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {selected?.id
                  ? "Bắt buộc nhập ít nhất 3 ký tự để lưu vết thay đổi."
                  : "Lần cấu hình đầu tiên có thể để trống; hệ thống sẽ ghi nhận là khởi tạo cấu hình."}
              </p>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={saveConfig}
              disabled={
                mutation.isPending ||
                coverage.morning + coverage.afternoon + coverage.night <= 0
              }
            >
              {mutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Lưu nhu cầu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={rotationOpen} onOpenChange={setRotationOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Áp dụng mẫu xoay ca</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Mẫu xoay ca">
              <select
                value={rotationForm.templateId}
                onChange={(e) =>
                  setRotationForm((x) => ({ ...x, templateId: e.target.value }))
                }
                className="h-10 w-full rounded-md border bg-white px-3"
              >
                {templates
                  .filter((x) => x.isActive)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.code} — {x.name}
                    </option>
                  ))}
              </select>
            </Field>
            {templates.find((x) => x.id === rotationForm.templateId) && (
              <Pattern
                template={templates.find(
                  (x) => x.id === rotationForm.templateId,
                )!}
                detailed
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ngày hiệu lực">
                <Input
                  type="date"
                  value={rotationForm.effectiveFrom}
                  onChange={(e) =>
                    setRotationForm((x) => ({
                      ...x,
                      effectiveFrom: e.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Ngày kết thúc (nếu có)">
                <Input
                  type="date"
                  value={rotationForm.effectiveTo}
                  onChange={(e) =>
                    setRotationForm((x) => ({
                      ...x,
                      effectiveTo: e.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <Field label="Lý do thay đổi">
              <Textarea
                value={rotationForm.reason}
                onChange={(e) =>
                  setRotationForm((x) => ({ ...x, reason: e.target.value }))
                }
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotationOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={saveRotation}
              disabled={
                mutation.isPending ||
                !rotationForm.templateId ||
                rotationForm.reason.trim().length < 3
              }
            >
              Áp dụng mẫu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!mode} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {mode === "assign"
                ? "Gán nhân sự"
                : mode === "detach"
                  ? "Tách nhân sự"
                  : "Thay đổi phân công"}
            </DialogTitle>
          </DialogHeader>
          {mode === "detach" ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 p-3 text-sm">
                Phân công cũ kết thúc vào ngày liền trước ngày hiệu lực; lịch sử
                không bị xóa.
              </div>
              <Field label="Ngày hiệu lực">
                <Input
                  type="date"
                  value={form.effectiveDate}
                  onChange={(e) => setField("effectiveDate", e.target.value)}
                />
              </Field>
              <Field label="Lý do">
                <Textarea
                  value={form.reason}
                  onChange={(e) => setField("reason", e.target.value)}
                />
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={cn("space-y-2", mode === "assign" && "sm:col-span-2")}>
                <Label>
                  Nhân sự
                  {mode === "assign" && selectedUserIds.length > 0 && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      Đã chọn {selectedUserIds.length} người
                    </span>
                  )}
                </Label>
                <div className="space-y-2">
                  {mode !== "change" && (
                    <Input
                      value={userSearch}
                      onChange={(event) => setUserSearch(event.target.value)}
                      placeholder="Tìm mã NV, họ tên hoặc cương vị..."
                      autoComplete="off"
                      aria-label="Tìm nhân sự để phân công"
                    />
                  )}
                  {mode === "assign" ? (
                    <div className="max-h-56 overflow-y-auto rounded-lg border bg-slate-50/60 p-1">
                      {filteredUsers.length ? filteredUsers.map((u) => {
                        const order = selectedUserIds.indexOf(u.id);
                        return (
                          <button
                            type="button"
                            key={u.id}
                            onClick={() => setSelectedUserIds((old) =>
                              old.includes(u.id)
                                ? old.filter((id) => id !== u.id)
                                : old.length < 20 ? [...old, u.id] : old,
                            )}
                            className={cn(
                              "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                              order >= 0 ? "bg-blue-50 text-blue-950" : "hover:bg-white",
                            )}
                          >
                            <span className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                              order >= 0 ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-muted-foreground",
                            )}>
                              {order >= 0 ? order + 1 : ""}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">{u.employeeId} — {u.name}</span>
                              {u.position && <span className="ml-2 text-muted-foreground">· {u.position}</span>}
                            </span>
                            {order >= 0 && <Check className="h-4 w-4 text-blue-700" />}
                          </button>
                        );
                      }) : (
                        <div className="px-3 py-6 text-center text-sm text-muted-foreground">Không tìm thấy nhân sự</div>
                      )}
                    </div>
                  ) : (
                    <select disabled value={form.userId} className="h-10 w-full rounded-md border bg-slate-50 px-3">
                      <option>{editing?.user.employeeId} — {editing?.user.name}</option>
                    </select>
                  )}
                </div>
              </div>
              <Field label="Cương vị">
                <select
                  value={form.positionId}
                  onChange={(e) => {
                    setField("positionId", e.target.value);
                    setField("stationCode", "");
                  }}
                  className="h-10 w-full rounded-md border bg-white px-3"
                >
                  {positions
                    .filter((p) => p.id)
                    .map((p) => (
                      <option key={p.id!} value={p.id!}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Mã kíp">
                <Input
                  list="crew-codes"
                  value={form.crewCode}
                  onChange={(e) => setCrewCode(e.target.value)}
                  placeholder="A–K hoặc mã khác"
                  maxLength={20}
                />
                <datalist id="crew-codes">
                  {QUICK_CREWS.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </Field>
              {positions.find((p) => p.id === form.positionId)?.positionType ===
                "S1_S2" && (
                <Field label="Vị trí">
                  <select
                    value={form.stationCode}
                    onChange={(e) => setField("stationCode", e.target.value)}
                    className="h-10 w-full rounded-md border bg-white px-3"
                  >
                    <option value="">Chưa phân</option>
                    <option>S1</option>
                    <option>S2</option>
                    <option>FLEX</option>
                  </select>
                </Field>
              )}
              <Field label="Loại phân công">
                <select
                  value={form.assignmentType}
                  onChange={(e) => setField("assignmentType", e.target.value)}
                  className="h-10 w-full rounded-md border bg-white px-3"
                >
                  {Object.entries(TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ngày hiệu lực biên chế">
                <Input
                  type="date"
                  value={form.effectiveDate}
                  onChange={(e) => setField("effectiveDate", e.target.value)}
                />
              </Field>
              <Field label="Ngày bắt đầu chu kỳ">
                <Input
                  type="date"
                  max={form.effectiveDate}
                  value={form.cycleStartDate}
                  onChange={(e) => setField("cycleStartDate", e.target.value)}
                />
              </Field>
              {formTemplate ? (
                <div className="sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-blue-950">{formTemplate.name}</div>
                      <div className="text-xs text-blue-800">Chu kỳ gồm {formTemplate.cycleLength} bước</div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCycleStepPicker((value) => !value)}
                    >
                      <Settings2 className="h-4 w-4" />
                      {showCycleStepPicker ? "Ẩn lựa chọn nâng cao" : "Không biết ngày bắt đầu?"}
                    </Button>
                  </div>
                  <div className="mt-3">
                    <Pattern template={formTemplate} detailed />
                  </div>
                  {showCycleStepPicker && (
                    <div className="mt-4 border-t border-blue-200 pt-3">
                      <Label>Trạng thái tại ngày hiệu lực</Label>
                      <p className="mb-2 text-xs text-blue-800">Chọn trạng thái đang diễn ra; hệ thống sẽ tự điền ngày bắt đầu chu kỳ.</p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {formTemplate.cyclePattern.map((step, index) => (
                          <button
                            type="button"
                            key={`${step}-${index}`}
                            onClick={() => setField("cycleStartDate", cycleStartForStep(form.effectiveDate, index))}
                            className="min-h-11 cursor-pointer rounded-lg border bg-white px-3 py-2 text-left text-sm transition-colors hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            <span className="font-semibold">Bước {index + 1}</span>
                            <span className="ml-2 text-muted-foreground">{SHIFT_NAME[step]}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Cương vị chưa có mẫu xoay ca áp dụng tại ngày hiệu lực. Hãy cấu hình mẫu trước khi nhập ngày bắt đầu chu kỳ.
                </div>
              )}
              <Field label="Ngày kết thúc">
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setField("endDate", e.target.value)}
                />
              </Field>
              <Field label="Lý do">
                <Textarea
                  value={form.reason}
                  onChange={(e) => setField("reason", e.target.value)}
                />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>
              Hủy
            </Button>
            <Button
              onClick={saveAssignment}
              disabled={
                mutation.isPending ||
                !form.effectiveDate ||
                form.reason.trim().length < 3 ||
                (mode !== "detach" &&
                  (!form.positionId ||
                    (mode === "assign" ? selectedUserIds.length === 0 : !form.userId) ||
                    (!!formTemplate && !form.cycleStartDate)))
              }
            >
              {mutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}{" "}
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StaffingMatrix({
  positions,
  assignments,
  selectedName,
  canManage,
  onSelectPosition,
  onOpenCell,
  onOpenAssignment,
  onMoveAssignment,
}: {
  positions: StaffingPosition[];
  assignments: StaffingAssignment[];
  selectedName: string;
  canManage: boolean;
  onSelectPosition: (name: string) => void;
  onOpenCell: (
    position: StaffingPosition,
    crewCode: string,
    stationCode: "S1" | "S2" | "FLEX" | "",
  ) => void;
  onOpenAssignment: (item: StaffingAssignment) => void;
  onMoveAssignment: (
    item: StaffingAssignment,
    position: StaffingPosition,
    crewCode: string,
    stationCode: "S1" | "S2" | "FLEX" | "",
  ) => void;
}) {
  const crews = ["A", "B", "C", "D", "E"];
  const current = assignments.filter(
    (item) => item.assignmentType === "OFFICIAL" && effective(item),
  );
  const rows: Array<{
    position: StaffingPosition;
    stationCode: "S1" | "S2" | "FLEX" | "";
  }> = [];
  for (const position of positions) {
    const people = current.filter((item) => item.positionId === position.id);
    if (position.positionType !== "S1_S2") {
      rows.push({ position, stationCode: "" });
      continue;
    }
    const stations = (["S1", "S2", "FLEX"] as const).filter((station) =>
      people.some((item) => item.stationCode === station),
    );
    for (const stationCode of stations.length
      ? stations
      : (["S1", "S2"] as const))
      rows.push({ position, stationCode });
  }
  return (
    <Card className="overflow-hidden border-slate-300 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-[linear-gradient(110deg,#0f172a_0%,#1e3a5f_72%,#b45309_160%)] px-5 py-4 text-white">
        <div>
          <div className="text-sm font-bold uppercase tracking-[0.14em] text-amber-300">
            Bảng biên chế vận hành
          </div>
          <div className="mt-1 text-xs text-slate-200">
            Nhấp ô để thêm người · kéo thẻ nhân sự sang ô khác để điều chuyển
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 font-semibold">
            {positions.length} cương vị
          </span>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 font-semibold">
            {current.length} nhân sự
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-amber-50 text-slate-900">
              <th className="w-12 border-b border-r border-slate-300 px-2 py-3 text-center text-xs">STT</th>
              <th className="w-64 border-b border-r border-slate-300 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Cương vị</th>
              {crews.map((crew) => (
                <th key={crew} className="border-b border-r border-slate-300 px-3 py-3 text-center text-xs font-bold uppercase tracking-wide last:border-r-0">
                  Tổ vận hành {crew}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ position, stationCode }, rowIndex) => {
              const active = selectedName === position.name;
              return (
                <tr key={`${position.name}-${stationCode || "single"}`} className={cn("group", active && "bg-amber-50/60") }>
                  <td className="border-b border-r border-slate-300 px-2 py-3 text-center text-xs font-semibold text-slate-500">{rowIndex + 1}</td>
                  <td className="border-b border-r border-slate-300 p-0 align-top">
                    <button
                      type="button"
                      onClick={() => onSelectPosition(position.name)}
                      className={cn(
                        "flex min-h-20 w-full cursor-pointer items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-amber-50",
                        active && "border-l-4 border-amber-500 bg-amber-50 pl-3",
                      )}
                    >
                      <span>
                        <span className="block font-bold text-slate-950">{position.name}</span>
                        {stationCode && (
                          <span className={cn(
                            "mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold",
                            stationCode === "S1" ? "bg-sky-100 text-sky-800" : stationCode === "S2" ? "bg-emerald-100 text-emerald-800" : "bg-violet-100 text-violet-800",
                          )}>{stationCode}</span>
                        )}
                      </span>
                      <Settings2 className={cn("mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-colors", active && "text-amber-700")} />
                    </button>
                  </td>
                  {crews.map((crew) => {
                    const people = current.filter(
                      (item) =>
                        item.positionId === position.id &&
                        item.crewCode === crew &&
                        (stationCode ? item.stationCode === stationCode : true),
                    );
                    return (
                      <td
                        key={crew}
                        onClick={() => canManage && onOpenCell(position, crew, stationCode)}
                        onDragOver={(event) => canManage && event.preventDefault()}
                        onDrop={(event) => {
                          if (!canManage) return;
                          event.preventDefault();
                          const id = event.dataTransfer.getData("application/x-shift-assignment");
                          const item = assignments.find((assignment) => assignment.id === id);
                          if (item) onMoveAssignment(item, position, crew, stationCode);
                        }}
                        className={cn(
                          "relative border-b border-r border-slate-300 p-2 align-top last:border-r-0",
                          canManage && "cursor-pointer transition-colors hover:bg-blue-50/70",
                        )}
                      >
                        <div className="flex min-h-16 flex-col gap-1.5">
                          {people.map((item) => (
                            <button
                              type="button"
                              key={item.id}
                              draggable={canManage}
                              onDragStart={(event) => {
                                event.stopPropagation();
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("application/x-shift-assignment", item.id);
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectPosition(position.name);
                                if (canManage) onOpenAssignment(item);
                              }}
                              className="group/person flex w-full cursor-grab items-start gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md active:cursor-grabbing"
                              title={`${item.user.employeeId} · Bắt đầu chu kỳ ${item.cycleStartDate ? viDate(item.cycleStartDate) : "chưa cấu hình"}`}
                            >
                              {canManage && <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 group-hover/person:text-blue-500" />}
                              <span className="min-w-0">
                                <span className="block leading-snug font-semibold text-slate-900">{item.user.name}</span>
                                <span className="mt-0.5 block font-mono text-[10px] text-slate-500">{item.user.employeeId}</span>
                              </span>
                            </button>
                          ))}
                          {canManage && (
                            <span className="mt-auto flex items-center justify-center gap-1 rounded border border-dashed border-slate-300 py-1 text-[11px] font-medium text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
                              <Plus className="h-3 w-3" /> Thêm nhân sự
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <span>Nhấp tên cương vị để mở Nhu cầu, Mẫu xoay và bảng chi tiết.</span>
        <span>Kéo thả luôn mở hộp xác nhận trước khi lưu thay đổi.</span>
      </div>
    </Card>
  );
}

function RotationSection({
  position,
  rotations,
  templates,
  canConfigure,
}: {
  position: StaffingPosition;
  rotations: PositionRotation[];
  templates: RotationTemplate[];
  canConfigure: boolean;
}) {
  const history = rotations.filter((x) => x.positionConfigId === position.id);
  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-slate-50 px-4 py-3">
        <div className="font-semibold">Mẫu xoay ca</div>
        <div className="text-xs text-muted-foreground">
          Chu kỳ chuẩn và lịch sử áp dụng theo thời gian
        </div>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="grid gap-2 sm:grid-cols-2">
          {templates.map((template) => (
            <div key={template.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-xs font-bold text-blue-700">
                    {template.code}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold">
                    {template.name}
                  </div>
                </div>
                {template.isActive && (
                  <Check className="h-4 w-4 text-emerald-600" />
                )}
              </div>
              <div className="mt-3">
                <Pattern template={template} />
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold">
            Lịch sử của {position.name}
          </div>
          <div className="space-y-2">
            {history.map((item) => (
              <div
                key={item.id}
                className="relative rounded-lg border-l-4 border-l-blue-500 bg-slate-50 p-3"
              >
                <div className="font-semibold">
                  {item.rotationTemplate.name}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {viDate(item.effectiveFrom)} → {viDate(item.effectiveTo)}
                </div>
                <div className="mt-1 text-xs">{item.reason}</div>
              </div>
            ))}
            {!history.length && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Chưa có lịch sử áp dụng mẫu
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
function CycleCell({
  item,
  rotation,
}: {
  item: StaffingAssignment;
  rotation?: PositionRotation;
}) {
  const template = rotation?.rotationTemplate;
  const step = template ? cycleStepAt(item, template) : null;
  const detail = step !== null && template
    ? `Tại ngày hôm nay: bước ${step + 1}/${template.cycleLength} – ${SHIFT_NAME[template.cyclePattern[step]].toLocaleLowerCase("vi")}`
    : undefined;
  return (
    <div title={detail} className="min-w-[130px]">
      {item.cycleStartDate ? (
        <div className="font-medium">{viDate(item.cycleStartDate)}</div>
      ) : (
        <div className="text-amber-700">Chưa bổ sung</div>
      )}
      {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
      {!item.cycleStartDate && item.phaseIndex !== null && (
        <div className="mt-0.5 text-xs text-muted-foreground">Dữ liệu cũ vẫn đang được áp dụng</div>
      )}
    </div>
  );
}
function Pattern({
  template,
  detailed = false,
}: {
  template: RotationTemplate;
  detailed?: boolean;
}) {
  return (
    <div
      className={cn("flex flex-wrap gap-1", detailed && "grid gap-2 sm:grid-cols-3")}
      title={template.description ?? undefined}
    >
      {template.cyclePattern.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className={cn(
            detailed
              ? "flex min-h-10 items-center rounded-lg border px-3 py-2 text-sm"
              : "flex h-7 w-7 items-center justify-center rounded text-xs font-bold",
            item === "MORNING"
              ? "bg-amber-100 text-amber-800"
              : item === "AFTERNOON"
                ? "bg-sky-100 text-sky-800"
                : item === "NIGHT"
                  ? "bg-indigo-100 text-indigo-800"
                  : "bg-slate-200 text-slate-600",
          )}
        >
          {detailed ? (
            <><b>Bước {index + 1}</b><span className="ml-2">{SHIFT_NAME[item]}</span></>
          ) : SHIFT_LABEL[item]}
        </span>
      ))}
    </div>
  );
}
function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="rounded bg-slate-100 px-1.5 py-1">
      <span className="text-muted-foreground">{label}</span>
      <b className="ml-1">{value}</b>
    </span>
  );
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-slate-50 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-lg font-bold" title={String(value)}>
        {value}
      </div>
    </div>
  );
}
function NumberField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        step={1}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
      />
    </Field>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
