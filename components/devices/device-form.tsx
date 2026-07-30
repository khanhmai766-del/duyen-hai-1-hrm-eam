"use client";

import * as React from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Info, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiImagePicker } from "@/components/shared/multi-image-picker";
import { useCreateDevice, useUpdateDevice, type DeviceRecord } from "@/hooks/useDevices";
import { fetchTreeChildren, useEquipmentNode } from "@/hooks/useEquipment";
import {
  EquipmentTreePicker,
  type PickerEquipmentNode,
} from "@/components/devices/equipment-tree-picker";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { blockForPosition, isSelectableManagingPosition } from "@/lib/constants";
import {
  canonicalSeq,
  defaultScopeOf,
  MAX_EQUIPMENT_DEPTH,
  s2Kks,
  scopeCode,
  seqInScope,
  type TreeScope,
} from "@/lib/equipment-units";
import { announcementShiftRosterPositionOptions } from "@/lib/positions";
import { positionLabelOf, positionsMatch } from "@/lib/position-catalog";
import { cn } from "@/lib/utils";

const NONE = "__none__";

/**
 * Chỉ còn HAI lựa chọn, vì cây vật lý chỉ có một bộ node: nhánh 1,2,3,7 là thiết bị
 * theo tổ máy (hiện ở CẢ S1 và S2, mã/KKS S2 dẫn xuất), nhánh 5,6 là dùng chung.
 * Trước đây tách "Tổ máy S1"/"Tổ máy S2" khiến người dùng tưởng đang tạo hai thiết
 * bị khác nhau, trong khi payload gửi lên server hoàn toàn giống nhau.
 */
const SCOPE_CHOICES: Array<{ key: TreeScope; label: string; help: string }> = [
  {
    key: "S1",
    label: "Thiết bị theo tổ máy (S1 & S2)",
    help: "Thiết bị này sẽ có ở CẢ Tổ máy S1 và S2. Mã và KKS của S2 được suy ra tự động từ S1. Lịch sử sửa chữa, khiếm khuyết và vật tư vẫn tách riêng theo từng tổ máy.",
  },
  {
    key: "COMMON",
    label: "Dùng chung",
    help: "Thiết bị dùng chung cho 2 tổ máy (nhánh 5, 6) — chỉ có một hồ sơ duy nhất, không tách theo tổ máy.",
  },
];

/** S1 và S2 là hai hình chiếu của cùng một nhánh nên gộp về một lựa chọn. */
function normalizeScope(scope: TreeScope): TreeScope {
  return scope === "COMMON" ? "COMMON" : "S1";
}

/**
 * Mã cấp con còn trống của một thư mục: lấy số cấp con LỚN NHẤT đang có rồi +1
 * (thư mục rỗng thì bắt đầu từ 1). Không lấp lại số của thiết bị đã xoá để mã
 * thiết bị không bị tái sử dụng cho hai hồ sơ khác nhau.
 *
 * Cây lazy đã có sẵn API con trực tiếp và TanStack Query cache lại, nên thao tác
 * này gần như không tốn thêm request.
 */
async function suggestChildCode(
  queryClient: QueryClient,
  parentCanonicalSeq: string,
  scope: TreeScope
) {
  const response = await fetchTreeChildren(queryClient, scope, parentCanonicalSeq);
  const usedNumbers = response.data
    // Chỉ đếm con TRỰC TIẾP; phòng trường hợp cache trả lẫn node của nhánh khác.
    .filter((child) => child.parentSeq === parentCanonicalSeq)
    .map((child) => Number.parseInt(child.seq.split(".").pop() ?? "", 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  const next = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;
  return `${scopeCode(parentCanonicalSeq, scope)}.${next}`;
}

export function DeviceForm({
  device,
  initialParentSeq,
  initialScope,
  onDone,
}: {
  device?: DeviceRecord | null;
  initialParentSeq?: string;
  /** Cây đang mở khi bấm "Thêm mới" — quyết định nhóm nhánh và cách hiện mã. */
  initialScope?: TreeScope;
  onDone?: (d: DeviceRecord) => void;
}) {
  const create = useCreateDevice();
  const update = useUpdateDevice();
  const isEdit = !!device;
  const rbac = useRbacAccess();
  const queryClient = useQueryClient();
  const canEditCode = !isEdit || rbac.can("device-code", ["full"]);
  const positions = React.useMemo<string[]>(
    () => announcementShiftRosterPositionOptions().filter(isSelectableManagingPosition),
    []
  );
  // Phạm vi cây đang tạo. Với thiết bị đã có thì suy từ chính mã của nó.
  const [scope, setScope] = React.useState<TreeScope>(() =>
    normalizeScope(
      device
        ? defaultScopeOf(device.code)
        : initialScope ?? (initialParentSeq ? defaultScopeOf(initialParentSeq) : "S1")
    )
  );

  const [form, setForm] = React.useState({
    // `code` giữ MÃ HIỂN THỊ theo phạm vi; quy về mã chuẩn ngay trước khi gửi.
    code: device?.code ?? (initialParentSeq ? `${scopeCode(initialParentSeq, scope)}.` : ""),
    name: device?.name ?? "",
    kks: device?.kks ?? "",
    system: device?.system ?? "",
    systemSeq: initialParentSeq ?? "",
    managingPosition: positionLabelOf(device?.managingPosition),
    images: device?.images ?? [],
    attachedInfo: device?.attachedInfo ?? "",
    documentUrl: device?.documentUrl ?? "",
  });

  // Chỉ tải ĐÚNG node cha để lấy tên, thay vì kéo cả cây ~22k node (3,5 MB) như trước.
  const parentNodeQuery = useEquipmentNode(!isEdit && initialParentSeq ? initialParentSeq : null, scope);
  React.useEffect(() => {
    const parentName = parentNodeQuery.data?.data?.name;
    if (isEdit || !initialParentSeq || !parentName) return;
    setForm((current) => (current.system ? current : { ...current, system: parentName }));
  }, [parentNodeQuery.data, initialParentSeq, isEdit]);

  /** Đổi phạm vi: giữ cha nếu vẫn thuộc nhóm nhánh mới, ngược lại bỏ chọn. */
  function changeScope(next: TreeScope) {
    setScope(next);
    setForm((current) => {
      const canonicalParent = current.systemSeq ? canonicalSeq(current.systemSeq) : "";
      if (canonicalParent && !seqInScope(canonicalParent, next)) {
        // Nhánh dùng chung và nhánh tổ máy không giao nhau — cha cũ không còn hợp lệ.
        return { ...current, code: "", system: "", systemSeq: "" };
      }
      // Cùng nhóm nhánh: chỉ vẽ lại mã theo tổ máy mới.
      return { ...current, code: current.code ? scopeCode(canonicalSeq(current.code), next) : "" };
    });
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Đảm bảo cương vị hiện tại luôn có trong danh sách (kể cả khi đã đổi tên/xoá).
  const positionOptions =
    form.managingPosition &&
    !positions.some((position) => positionsMatch(position, form.managingPosition))
      ? [form.managingPosition, ...positions]
      : positions;
  // Ô chọn cây nhận MÃ CHUẨN (seq), không phải mã hiển thị theo tổ máy.
  const systemSeqValue = form.systemSeq ? canonicalSeq(form.systemSeq) : "";
  const currentLevel = form.code.trim() ? form.code.trim().split(".").length : null;

  const parentRequestRef = React.useRef(0);
  /**
   * Mã cuối cùng do hệ thống gợi ý. Dùng để phân biệt "số cấp con do máy sinh"
   * với "số người dùng tự gõ": số của máy phải được tính lại khi đổi thư mục cha,
   * còn số người dùng gõ thì giữ nguyên.
   */
  const autoCodeRef = React.useRef<string | null>(null);

  async function selectParent(node: PickerEquipmentNode | null) {
    const requestId = ++parentRequestRef.current;

    if (isEdit) {
      setForm((current) => ({ ...current, system: node?.name ?? "", systemSeq: node?.seq ?? "" }));
      return;
    }

    // Đọc từ state của lần render hiện tại — updater của setForm chạy trễ nên
    // không dùng được để quyết định có gọi gợi ý hay không.
    const previousCode = form.code;
    const oldParentDisplay = form.systemSeq ? scopeCode(canonicalSeq(form.systemSeq), scope) : "";
    const oldPrefix = oldParentDisplay ? `${oldParentDisplay}.` : "";
    const previousChildPart = oldPrefix && previousCode.startsWith(oldPrefix)
      ? previousCode.slice(oldPrefix.length)
      : "";
    const typedByUser =
      /^\d+$/.test(previousChildPart) && previousCode !== autoCodeRef.current;

    if (!node) {
      // Chỉ xoá tiền tố tự điền khi người dùng chưa nhập mã con.
      const clearCode = !typedByUser && oldPrefix && previousCode === oldPrefix;
      if (clearCode) autoCodeRef.current = null;
      setForm((current) => ({
        ...current,
        code: clearCode ? "" : current.code,
        system: "",
        systemSeq: "",
      }));
      return;
    }

    // Thư mục cha là nguồn chuẩn của tiền tố. Số cấp con của thư mục cũ chỉ được
    // mang sang khi chính người dùng gõ nó.
    const keptChildPart = typedByUser ? previousChildPart : "";
    const prefixedCode = `${node.fullCode}.${keptChildPart}`;
    setForm((current) => ({
      ...current,
      code: prefixedCode,
      system: node.name,
      systemSeq: node.seq,
    }));

    if (typedByUser) {
      autoCodeRef.current = null;
      return;
    }

    try {
      const suggested = await suggestChildCode(queryClient, node.seq, scope);
      // Bỏ qua kết quả của lần chọn cũ nếu người dùng đã đổi cha lần nữa.
      if (requestId !== parentRequestRef.current) return;
      autoCodeRef.current = suggested;
      setForm((current) => (current.code === prefixedCode ? { ...current, code: suggested } : current));
    } catch {
      // Không gợi ý được thì giữ nguyên tiền tố để người dùng tự nhập.
    }
  }

  // Vào thẳng từ nút "Thêm thiết bị con" trên cây: điền sẵn luôn số cấp con còn trống.
  React.useEffect(() => {
    if (isEdit || !initialParentSeq) return;
    const parentCanonical = canonicalSeq(initialParentSeq);
    const prefix = `${scopeCode(parentCanonical, scope)}.`;
    let cancelled = false;
    suggestChildCode(queryClient, parentCanonical, scope)
      .then((suggested) => {
        if (cancelled) return;
        autoCodeRef.current = suggested;
        setForm((current) => (current.code === prefix ? { ...current, code: suggested } : current));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialParentSeq, isEdit, queryClient, scope]);

  async function save(keepAdding: boolean) {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Nhập Mã thiết bị và Tên thiết bị");
      return;
    }
    // Cây vật lý chỉ có mã chuẩn — mã đang hiển thị theo tổ máy phải quy về trước khi gửi.
    const payload = { ...form, code: canonicalSeq(form.code.trim()) };
    try {
      const result = isEdit
        ? await update.mutateAsync({ id: device!.id, ...payload })
        : await create.mutateAsync(payload);
      toast.success(isEdit ? "Đã cập nhật thiết bị" : "Đã thêm thiết bị mới");
      if (!keepAdding) {
        onDone?.(result);
        return;
      }
      // Nhập hàng loạt trong cùng thư mục: giữ vị trí và cương vị, dọn phần định danh.
      const parentSeqCanonical = form.systemSeq ? canonicalSeq(form.systemSeq) : "";
      const nextCode = parentSeqCanonical
        ? await suggestChildCode(queryClient, parentSeqCanonical, scope).catch(() => "")
        : "";
      autoCodeRef.current = nextCode || null;
      setForm((current) => ({
        ...current,
        code: nextCode || "",
        name: "",
        kks: "",
        images: [],
        attachedInfo: "",
        documentUrl: "",
      }));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void save(false);
  }

  const pending = create.isPending || update.isPending;
  const kksTrimmed = form.kks.trim();
  const derivedS2Kks = scope === "COMMON" ? null : s2Kks(kksTrimmed);
  const showS2Kks = Boolean(derivedS2Kks && derivedS2Kks !== kksTrimmed);

  /* ------------------------------------------------------------ các khối dùng chung */

  const codeField = (
    <Field label="Mã thiết bị *">
      <Input
        value={form.code}
        onChange={(e) => set("code", e.target.value)}
        disabled={!canEditCode}
        required
        className="font-mono"
        placeholder={`VD: ${scopeCode("DH1.S1.1.4.11.2.2", scope)}`}
      />
      <p className="mt-1 text-xs text-muted-foreground">
        {currentLevel
          ? `Thiết bị đang ở cấp ${currentLevel}/${MAX_EQUIPMENT_DEPTH}.`
          : `Mã bắt đầu bằng ${scopeCode("DH1.S1", scope)}, các cấp sau là số — hỗ trợ tối đa ${MAX_EQUIPMENT_DEPTH} cấp.`}
      </p>
    </Field>
  );

  const nameField = (
    <Field label="Tên thiết bị *">
      <Input
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        required
        placeholder="VD: Van điện xả định kỳ 410"
      />
    </Field>
  );

  const kksField = (
    <Field label="Mã KKS">
      <Input
        value={form.kks}
        onChange={(e) => set("kks", e.target.value)}
        className="font-mono"
        placeholder="VD: X0HFV11BB001"
      />
      {scope !== "COMMON" && (
        <p className="mt-1 text-xs text-muted-foreground">
          Nhập KKS của <b className="text-ink">Tổ máy S1</b> (bắt đầu bằng 1…). KKS S2 được suy ra tự động
          bằng cách đổi ký tự đầu 1 → 2.
        </p>
      )}
      {showS2Kks && (
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">KKS Tổ máy S2:</span>
          <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono font-semibold text-emerald-700">
            {derivedS2Kks}
          </span>
          <AutoBadge />
        </p>
      )}
    </Field>
  );

  const parentField = (
    <Field label="Hệ thống thiết bị">
      <EquipmentTreePicker
        value={systemSeqValue}
        position={form.managingPosition || null}
        includeLeaves
        maxSelectableDepth={15}
        // Giới hạn đúng nhóm nhánh của phạm vi đang chọn, tránh đặt thiết bị tổ máy
        // vào nhánh dùng chung (và ngược lại).
        scope={scope}
        placeholder="Chọn thư mục hoặc thiết bị cha (tối đa cấp 15)"
        onChange={selectParent}
      />
      <p className="mt-1 text-xs text-muted-foreground">
        Có thể chọn thiết bị hiện tại làm thư mục cha. Mã thiết bị sẽ tự điền mã cha kèm số cấp con còn trống.
      </p>
    </Field>
  );

  const positionField = (
    <Field label="Cương vị quản lý">
      <Select
        value={form.managingPosition || NONE}
        onValueChange={(v) => set("managingPosition", v === NONE ? "" : v)}
      >
        <SelectTrigger><SelectValue placeholder="Chọn cương vị" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— Không chọn —</SelectItem>
          {positionOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );

  const blockField = (
    <Field label="Khối quản lý">
      <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-ink">
        {blockForPosition(form.managingPosition)}
      </div>
    </Field>
  );

  // Cây thiết bị chỉ có MỘT cột ảnh (EquipmentNode.imageUrl) và API chỉ ghi ảnh đầu
  // tiên, nên ô chọn cũng chỉ nhận đúng một ảnh — tránh việc người dùng thêm ảnh thứ
  // hai rồi bị bỏ im lặng lúc lưu.
  const imagesField = (
    <Field label="Ảnh thiết bị">
      <MultiImagePicker value={form.images} onChange={(v) => set("images", v)} max={1} allowUrl />
      <p className="mt-1 text-xs text-muted-foreground">
        Mỗi thiết bị lưu một ảnh đại diện. Tải từ máy (ảnh tự động nén trước khi lưu) hoặc dán link.
      </p>
    </Field>
  );

  const attachedField = (
    <Field label="Thông tin đính kèm theo">
      <Textarea
        value={form.attachedInfo}
        onChange={(e) => set("attachedInfo", e.target.value)}
        rows={3}
        placeholder="Ghi chú, thông số, lưu ý…"
      />
    </Field>
  );

  const documentField = (
    <Field label="Tài liệu đính kèm (link)">
      <Input
        value={form.documentUrl}
        onChange={(e) => set("documentUrl", e.target.value)}
        placeholder="https://… (PDF / Google Drive)"
      />
      <p className="mt-1 text-xs text-muted-foreground">
        Catalogue, bản vẽ, hướng dẫn vận hành… Dán một liên kết PDF hoặc Google Drive đã mở quyền xem.
      </p>
    </Field>
  );

  /* ------------------------------------------------- chế độ SỬA: giữ khung gọn cũ */

  if (isEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chỉnh sửa: {device!.code}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {codeField}
            {nameField}
            {kksField}
            {parentField}
            {positionField}
            {blockField}
            {imagesField}
            {documentField}
            <div className="md:col-span-2">{attachedField}</div>
            <div className="flex justify-end gap-2 pt-2 md:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Lưu thay đổi
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  /* ------------------------------------------------------- chế độ TẠO: khung 2 cột */

  const scopeHelp = SCOPE_CHOICES.find((choice) => choice.key === scope)?.help ?? "";
  const checklist = [
    { label: "Vị trí trong cây", done: !!form.code.trim(), optional: false },
    { label: "Tên thiết bị", done: !!form.name.trim(), optional: false },
    { label: "Mã KKS", done: !!kksTrimmed, optional: true },
    { label: "Phân công quản lý", done: !!form.managingPosition, optional: true },
    { label: "Ảnh thiết bị", done: form.images.length > 0, optional: true },
  ];
  const doneCount = checklist.filter((item) => item.done).length;
  const canSubmit = !!form.code.trim() && !!form.name.trim();
  const missingRequired = [
    !form.code.trim() ? "Mã thiết bị" : null,
    !form.name.trim() ? "Tên thiết bị" : null,
  ].filter(Boolean) as string[];

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-ink">Thêm thiết bị mới</h1>
        <p className="text-sm text-muted-foreground">
          Điền theo thứ tự 4 bước; bảng tên bên phải xem trước đúng thứ sẽ được lưu.
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Section step={1} title="Vị trí trong cây thiết bị" hint="Quyết định mã thiết bị">
          <Field label="Thiết bị thuộc *">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {SCOPE_CHOICES.map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  onClick={() => changeScope(choice.key)}
                  className={cn(
                    "h-9 rounded-md px-4 text-sm font-semibold transition-colors",
                    scope === choice.key
                      ? "bg-navy text-white shadow-sm"
                      : "text-muted-foreground hover:text-ink"
                  )}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{scopeHelp}</p>
          </Field>

          {parentField}

          {/* Đường dẫn cây — cho thấy thiết bị mới sẽ nằm ở đâu trước khi lưu. */}
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Đường dẫn
              </span>
              <span className="flex items-center gap-2 text-[11.5px] font-semibold text-muted-foreground">
                Cấp {currentLevel ?? "—"}/{MAX_EQUIPMENT_DEPTH}
                <span className="flex gap-0.5">
                  {Array.from({ length: 8 }, (_, i) => (
                    <i
                      key={i}
                      className={cn(
                        "h-3 w-[5px] rounded-sm",
                        currentLevel && i < currentLevel - 1 && "bg-accent",
                        currentLevel && i === currentLevel - 1 && "bg-emerald-500",
                        (!currentLevel || i > currentLevel - 1) && "bg-border"
                      )}
                    />
                  ))}
                </span>
              </span>
            </div>
            <PathNode code="DH1" name="Nhà máy Nhiệt điện Duyên Hải 1" depth={0} />
            <PathNode
              code={scope === "COMMON" ? "CHUNG" : "S1 & S2"}
              name={scope === "COMMON" ? "Nhánh dùng chung" : "Thiết bị theo tổ máy"}
              depth={1}
            />
            {form.system && (
              <PathNode
                code={form.systemSeq ? scopeCode(canonicalSeq(form.systemSeq), scope) : "—"}
                name={form.system}
                depth={2}
              />
            )}
            <PathNode
              code={form.code.trim() || "—"}
              name={form.name.trim() || "Thiết bị mới"}
              depth={form.system ? 3 : 2}
              leaf
            />
          </div>

          <div className="mt-4">{codeField}</div>
        </Section>

        <Section step={2} title="Định danh thiết bị">
          <div className="grid gap-4 md:grid-cols-2">
            {nameField}
            {kksField}
          </div>
        </Section>

        <Section step={3} title="Phân công quản lý" hint="Dùng để định tuyến khiếm khuyết">
          <div className="grid gap-4 md:grid-cols-2">
            {positionField}
            {blockField}
          </div>
        </Section>

        <Section step={4} title="Hồ sơ & tài liệu" hint="Không bắt buộc">
          <div className="grid items-start gap-4 md:grid-cols-2">
            {imagesField}
            {documentField}
            <div className="md:col-span-2">{attachedField}</div>
          </div>
        </Section>
      </div>

      {/* ------------------------------------------------------------- cột phải */}
      <div className="space-y-3.5 lg:sticky lg:top-4">
        {/* Bảng tên thiết bị — xem trước đúng thứ sẽ được lưu. */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#1b2b4d] to-[#101a30] p-4 text-[#e8eefc] shadow-lg">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[#8ba3d4]">
            <span>Bảng tên thiết bị</span>
            <span className="rounded border border-amber-300/30 bg-amber-300/15 px-1.5 py-0.5 text-amber-300">
              {scope === "COMMON" ? "CHUNG" : "S1 & S2"}
            </span>
          </div>

          <div
            className={cn(
              "my-3 flex h-24 items-center justify-center overflow-hidden rounded-xl border text-[11.5px]",
              form.images.length > 0
                ? "border-white/20 bg-white/10"
                : "border-dashed border-white/15 bg-white/5 text-[#7f93bd]"
            )}
          >
            {form.images.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.images[0]} alt="Ảnh thiết bị" className="h-full w-full object-cover" />
            ) : (
              "Chưa có ảnh"
            )}
          </div>

          <h3 className={cn("text-[15.5px] font-bold leading-snug", !form.name.trim() && "italic font-medium text-[#63779f]")}>
            {form.name.trim() || "Tên thiết bị…"}
          </h3>
          <div className="mt-1.5 font-mono text-[13px] font-bold tracking-wide text-sky-300">
            {form.code.trim() || "—"}
          </div>
          <div className="mt-0.5 font-mono text-[11.5px] text-[#9fb3d9]">
            KKS: {kksTrimmed || "chưa nhập"}
          </div>
          {showS2Kks && (
            <div className="mt-0.5 font-mono text-[11.5px] text-[#9fb3d9]">
              KKS S2: {derivedS2Kks}
            </div>
          )}

          <dl className="mt-3 grid gap-1.5 border-t border-white/10 pt-3 text-[11.5px]">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-[#7f93bd]">Thuộc</dt>
              <dd className="font-semibold text-[#dbe6fb]">{form.system || "Chưa chọn thư mục cha"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-[#7f93bd]">Quản lý</dt>
              <dd className="font-semibold text-[#dbe6fb]">
                {[form.managingPosition, form.managingPosition ? blockForPosition(form.managingPosition) : ""]
                  .filter(Boolean)
                  .join(" · ") || "Chưa phân công"}
              </dd>
            </div>
          </dl>
        </div>

        {/* Mức độ hoàn thiện hồ sơ */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h4 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Mức độ hoàn thiện hồ sơ
          </h4>
          {checklist.map((item) => (
            <div
              key={item.label}
              className={cn(
                "flex items-center gap-2.5 py-1 text-[13px]",
                item.done ? "text-ink" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border transition-colors",
                  item.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-input"
                )}
              >
                {item.done && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
              </span>
              {item.label}
              {item.optional && (
                <span className="ml-auto text-[10.5px] font-semibold text-muted-foreground">Nên có</span>
              )}
            </div>
          ))}
        </div>

        {/* Gợi ý cấu trúc KKS */}
        <div className="rounded-xl border border-border bg-muted/30 p-3.5">
          <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            Cấu trúc mã KKS
          </h4>
          <div className="flex gap-1 font-mono text-xs font-bold">
            <span className="rounded bg-blue-100 px-1.5 py-1 text-blue-700">10</span>
            <span className="rounded bg-emerald-100 px-1.5 py-1 text-emerald-700">HHS</span>
            <span className="rounded bg-amber-100 px-1.5 py-1 text-amber-700">23</span>
            <span className="rounded bg-purple-100 px-1.5 py-1 text-purple-700">AA006</span>
          </div>
          <dl className="mt-2 grid gap-1 text-[11.5px] text-muted-foreground">
            <div><b className="mr-1.5 font-mono text-ink">10</b>Tổ máy / khối</div>
            <div><b className="mr-1.5 font-mono text-ink">HHS</b>Hệ thống chức năng</div>
            <div><b className="mr-1.5 font-mono text-ink">23</b>Số thứ tự hệ thống</div>
            <div><b className="mr-1.5 font-mono text-ink">AA006</b>Loại thiết bị &amp; số hiệu</div>
          </dl>
        </div>
      </div>

      {/* --------------------------------------------------- thanh hành động dính đáy */}
      <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center gap-3 border-t border-border bg-background/90 px-1 py-3 backdrop-blur lg:col-span-2">
        <ProgressRing done={doneCount} total={checklist.length} />
        <span className="text-[13px] text-muted-foreground">
          {canSubmit ? (
            <>Đủ điều kiện lưu · hồ sơ hoàn thiện <b className="text-ink">{doneCount}/{checklist.length}</b></>
          ) : (
            <>Còn thiếu: <b className="text-ink">{missingRequired.join(", ")}</b></>
          )}
        </span>
        <div className="flex-1" />
        <Button type="button" variant="outline" disabled={pending || !canSubmit} onClick={() => void save(true)}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Lưu &amp; thêm tiếp
        </Button>
        <Button type="submit" disabled={pending || !canSubmit}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Thêm thiết bị
        </Button>
      </div>
      </div>
    </form>
  );
}

function Section({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-navy text-xs font-bold text-white">
          {step}
        </span>
        <h2 className="text-[14.5px] font-bold">{title}</h2>
        {hint && <span className="ml-auto text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function PathNode({
  code,
  name,
  depth,
  leaf,
}: {
  code: string;
  name: string;
  depth: number;
  leaf?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-1 text-[13px]" style={{ paddingLeft: depth * 14 }}>
      <span
        className={cn(
          "h-[7px] w-[7px] shrink-0 rounded-full",
          leaf ? "bg-emerald-500 ring-[3px] ring-emerald-500/20" : "bg-border"
        )}
      />
      <span
        className={cn(
          "shrink-0 rounded border px-1.5 font-mono text-[11.5px] font-semibold",
          leaf
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-border bg-card text-muted-foreground"
        )}
      >
        {code}
      </span>
      <span className={cn("truncate", leaf ? "font-bold text-emerald-700" : "text-muted-foreground")}>
        {name}
      </span>
    </div>
  );
}

function AutoBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
      <Sparkles className="h-2.5 w-2.5" />
      Tự sinh
    </span>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const circumference = 2 * Math.PI * 15;
  return (
    <svg viewBox="0 0 36 36" className="h-7 w-7 shrink-0" aria-hidden>
      <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
      <circle
        cx="18"
        cy="18"
        r="15"
        fill="none"
        stroke={done === total ? "#10b981" : "#2563eb"}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - done / total)}
        transform="rotate(-90 18 18)"
        style={{ transition: "stroke-dashoffset .3s ease, stroke .3s" }}
      />
    </svg>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
