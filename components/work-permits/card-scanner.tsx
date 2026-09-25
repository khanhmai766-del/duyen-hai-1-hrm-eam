"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, CircleAlert, CircleX, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { lookupPermitCard, useSavePermitPerson } from "@/hooks/useWorkPermits";
import { cardExpired, parseCardQr, sameCompany } from "@/lib/work-permit-card";
import { formatPermitNumber, type PermitMember, type PermitPerson } from "@/lib/work-permits";

/*
 * Quét thẻ ra vào cổng để thêm nhân viên vào lần làm việc — luồng một chạm cho đội đông người:
 *   mở đúng phiếu → quét → thấy ảnh + tên → đúng người, đúng đơn vị thì TỰ THÊM ngay, quét người kế tiếp.
 *
 * - Khác đơn vị công tác của phiếu, ngừng hoạt động → CHẶN (không cho thêm).
 * - Thẻ hết hạn, người đang ghi ở lần làm việc khác → CẢNH BÁO, người cho phép bấm "Vẫn cho vào"/"Không".
 * - Thẻ chưa có trong danh bạ → thêm nhanh (chỉ nhập họ tên, đơn vị khoá theo phiếu).
 * Camera quét liên tục; đầu đọc QR cắm USB (gõ như bàn phím + Enter) dùng ô nhập bên dưới.
 */

type Tone = "ok" | "warn" | "block" | "info";
type Scan = {
  id: number; code: string; tone: Tone; title: string; detail: string;
  person?: PermitPerson; reasons?: string[]; pending?: boolean; notFound?: boolean; added?: boolean;
};

const REPEAT_MS = 2500;
const vnDate = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "";

/** Tiếng bíp ngắn: cao = cho vào, thấp = chặn/cảnh báo. Không có âm thanh thì im lặng, không lỗi. */
function useBeep() {
  const ctx = useRef<AudioContext | null>(null);
  return useCallback((ok: boolean) => {
    try {
      ctx.current ??= new AudioContext();
      const osc = ctx.current.createOscillator(), gain = ctx.current.createGain();
      osc.frequency.value = ok ? 1200 : 320;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.current.destination);
      osc.start(); osc.stop(ctx.current.currentTime + (ok ? 0.12 : 0.35));
      navigator.vibrate?.(ok ? 60 : [80, 60, 80]);
    } catch { /* thiết bị không phát được âm thanh */ }
  }, []);
}

const TONE_BOX: Record<Tone, string> = {
  ok: "border-emerald-300 bg-emerald-50 text-emerald-950",
  warn: "border-amber-300 bg-amber-50 text-amber-950",
  block: "border-red-300 bg-red-50 text-red-950",
  info: "border-slate-300 bg-slate-50 text-slate-900",
};
function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "ok") return <CheckCircle2 className="shrink-0 text-emerald-600" size={18} />;
  if (tone === "block") return <CircleX className="shrink-0 text-red-600" size={18} />;
  return <CircleAlert className={`shrink-0 ${tone === "warn" ? "text-amber-600" : "text-slate-500"}`} size={18} />;
}

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return "Trình duyệt đang chặn camera. Cho phép Camera cho trang này rồi bấm Mở camera.";
  if (name === "NotFoundError") return "Không tìm thấy camera. Dùng đầu đọc QR hoặc nhập số thẻ ở ô bên dưới.";
  if (name === "NotReadableError") return "Camera đang được ứng dụng khác sử dụng.";
  return "Không mở được camera. Dùng đầu đọc QR hoặc nhập số thẻ ở ô bên dưới.";
}

export function PermitCardScanner({ unit, companies, existing, permitId, onAdd, onClose }: {
  /** Đơn vị công tác của phiếu (tên hiển thị và đơn vị gán khi thêm nhanh). */
  unit: string;
  /** Các tên đơn vị được chấp nhận: đơn vị ghi trên phiếu + đơn vị hiện tại của CHTT. */
  companies: string[];
  /** Người đã có trong lần làm việc (kể cả CHTT) — quét lại báo "đã có". */
  existing: PermitMember[];
  permitId: string;
  onAdd: (member: PermitMember) => boolean;
  onClose: () => void;
}) {
  const [scans, setScans] = useState<Scan[]>([]);
  const [manual, setManual] = useState("");
  const [quickName, setQuickName] = useState("");
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "error">("off");
  const [cameraMessage, setCameraMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const existingRef = useRef(existing);
  existingRef.current = existing;
  const busyRef = useRef(false);
  const idRef = useRef(0);
  const beep = useBeep();
  const savePerson = useSavePermitPerson();
  const current = scans[0];
  const blocked = Boolean(current?.pending || current?.notFound);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const addedCount = scans.filter(s => s.added).length;

  const push = useCallback((scan: Omit<Scan, "id">) => {
    setScans(list => [{ ...scan, id: ++idRef.current }, ...list].slice(0, 30));
    beep(scan.tone === "ok");
  }, [beep]);

  const isExisting = useCallback((person: Pick<PermitPerson, "id" | "code">) => existingRef.current.some(m =>
    m.personId === person.id || Boolean(m.code && m.code.normalize("NFC").trim().toUpperCase() === person.code)), []);

  const admit = useCallback((person: PermitPerson) => onAdd({ personId: person.id, code: person.code, name: person.name, company: person.company }), [onAdd]);

  const handle = useCallback(async (raw: string) => {
    // Đang chờ quyết định (cảnh báo / thêm nhanh) thì bỏ qua lượt quét mới, kẻo đè mất thẻ đang chờ.
    if (busyRef.current || blockedRef.current) return;
    const code = parseCardQr(raw);
    if (!code) return push({ code: raw.slice(0, 40), tone: "block", title: "Không phải mã thẻ ra vào", detail: "Mã QR này không chứa số thẻ. Quét đúng thẻ ra vào cổng & ATVSLĐ." });
    const now = Date.now();
    if (lastRef.current.code === code && now - lastRef.current.at < REPEAT_MS) return; // camera đọc lại cùng thẻ liên tục
    lastRef.current = { code, at: now };
    busyRef.current = true;
    try {
      const { person } = await lookupPermitCard(code);
      if (!person) return push({ code, tone: "warn", title: `Thẻ ${code} chưa có trong danh bạ`, detail: `Nhập họ tên để thêm nhanh vào đơn vị ${unit}.`, notFound: true });
      if (isExisting(person)) return push({ code, tone: "info", person, title: person.name, detail: "Đã có trong danh sách lần làm việc này." });
      if (!person.isActive) return push({ code, tone: "block", person, title: person.name, detail: "Hồ sơ đang NGỪNG HOẠT ĐỘNG trong danh bạ — không cho vào." });
      if (!companies.some(company => sameCompany(company, person.company))) {
        return push({ code, tone: "block", person, title: person.name, detail: `Thuộc đơn vị “${person.company}”, KHÔNG PHẢI đơn vị công tác của phiếu (“${unit}”). Không cho vào.` });
      }
      const reasons: string[] = [];
      if (cardExpired(person.cardExpiresAt)) reasons.push(`Thẻ đã HẾT HẠN ngày ${vnDate(person.cardExpiresAt)}.`);
      for (const work of person.activeWorks ?? []) {
        if (work.permit.id !== permitId) reasons.push(`Đang ghi ${work.role === "CHTT" ? "là CHTT" : "làm việc"} ở PCT ${formatPermitNumber(work.permit)} (chưa kết thúc).`);
      }
      if (reasons.length) return push({ code, tone: "warn", person, title: person.name, detail: "Cần người cho phép quyết định.", reasons, pending: true });
      const added = admit(person);
      push({ code, tone: added ? "ok" : "block", person, title: person.name, detail: added ? "Đúng đơn vị — đã cho vào." : "Danh sách đã đủ 200 người.", added });
    } catch (error) {
      push({ code, tone: "block", title: `Không tra được thẻ ${code}`, detail: error instanceof Error ? error.message : "Lỗi kết nối, quét lại." });
    } finally {
      busyRef.current = false;
    }
  }, [admit, companies, isExisting, permitId, push, unit]);

  const handleRef = useRef(handle);
  handleRef.current = handle;

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const video = videoRef.current;
    (video?.srcObject as MediaStream | null)?.getTracks().forEach(track => track.stop());
    if (video) video.srcObject = null;
    setCamera("off");
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setCamera("error"); setCameraMessage("Trình duyệt không hỗ trợ camera. Dùng đầu đọc QR hoặc nhập số thẻ."); return; }
    setCamera("starting");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      const video = videoRef.current;
      if (!video) throw new Error("Không có khung camera");
      video.srcObject = stream;
      await video.play();
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 600 });
      controlsRef.current = await reader.decodeFromStream(stream, video, result => {
        const text = result?.getText();
        if (text) void handleRef.current(text);
      });
      stream = null;
      setCamera("on");
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      setCamera("error");
      setCameraMessage(cameraErrorMessage(error));
    }
  }, []);

  // Mở hộp quét = thao tác chủ động → bật camera ngay (máy không có camera vẫn dùng ô nhập được).
  useEffect(() => { void startCamera(); return () => stopCamera(); }, [startCamera, stopCamera]);

  function decide(allow: boolean) {
    if (!current?.person) return;
    const added = allow ? admit(current.person) : false;
    setScans(list => list.map(s => s.id === current.id ? { ...s, pending: false, added, tone: added ? "ok" : "block", detail: added ? "Người cho phép đã quyết định cho vào." : allow ? "Danh sách đã đủ 200 người." : "Không cho vào." } : s));
    beep(added);
  }

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!current?.notFound || !quickName.trim()) return;
    try {
      const person = await savePerson.mutateAsync({ body: { code: current.code, name: quickName.trim(), company: unit, phone: "", canCommand: false, isActive: true } });
      const added = admit(person);
      setScans(list => list.map(s => s.id === current.id ? { ...s, notFound: false, person, title: person.name, tone: added ? "ok" : "block", added, detail: added ? `Đã thêm vào danh bạ ${unit} và cho vào.` : "Danh sách đã đủ 200 người." } : s));
      setQuickName("");
      beep(added);
    } catch (error) {
      setScans(list => list.map(s => s.id === current.id ? { ...s, detail: error instanceof Error ? error.message : "Không thêm được hồ sơ" } : s));
      beep(false);
    }
  }

  function skipCurrent() {
    if (!current) return;
    setScans(list => list.map(s => s.id === current.id ? { ...s, pending: false, notFound: false, tone: "block", detail: s.notFound ? "Bỏ qua — chưa thêm vào danh bạ." : "Không cho vào." } : s));
  }

  return <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
    <DialogContent className="flex max-h-[94dvh] max-w-2xl flex-col gap-3 overflow-hidden">
      <div className="pr-8">
        <DialogTitle>Quét thẻ vào làm việc</DialogTitle>
        <DialogDescription>Đơn vị công tác: <b className="text-foreground">{unit}</b> · Chỉ nhân viên đúng đơn vị này được cho vào.</DialogDescription>
      </div>

      <div className="relative overflow-hidden rounded-lg bg-slate-900">
        <video ref={videoRef} muted playsInline autoPlay className={`aspect-video w-full object-cover ${camera === "on" ? "" : "opacity-30"}`} />
        {camera !== "on" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white">
          <p>{camera === "starting" ? "Đang mở camera…" : camera === "error" ? cameraMessage : "Camera đang tắt"}</p>
          {camera !== "starting" && <Button type="button" size="sm" variant="secondary" onClick={() => void startCamera()}><Camera />Mở camera</Button>}
        </div>}
        {camera === "on" && <>
          <div className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-white/70" />
          <Button type="button" size="sm" variant="secondary" className="absolute right-2 top-2 h-8" onClick={stopCamera}><CameraOff />Tắt</Button>
        </>}
      </div>

      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const value = manual; setManual(""); lastRef.current = { code: "", at: 0 }; void handle(value); }}>
        <input className="min-h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={manual} maxLength={500}
          onChange={e => setManual(e.target.value)} placeholder="Đầu đọc QR / nhập số thẻ rồi Enter" aria-label="Số thẻ hoặc nội dung mã QR" />
        <Button type="submit" variant="outline" disabled={!manual.trim()}>Tra thẻ</Button>
      </form>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {current ? <div className={`rounded-xl border-2 p-3 ${TONE_BOX[current.tone]}`} aria-live="assertive">
          <div className="flex gap-3">
            {current.person?.photoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={current.person.photoUrl} alt={`Ảnh ${current.person.name}`} className="h-32 w-24 shrink-0 rounded-md border border-white object-cover shadow" />
              : <div className="flex h-32 w-24 shrink-0 items-center justify-center rounded-md bg-white/70 text-3xl text-slate-400">👤</div>}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="flex items-center gap-1.5 text-lg font-bold leading-tight"><ToneIcon tone={current.tone} />{current.title}</p>
              <p className="text-sm">Số thẻ <b>{current.code}</b>{current.person ? ` · ${current.person.company}` : ""}</p>
              {current.person && <p className="text-xs opacity-80">{[current.person.jobTitle, current.person.birthYear && `NS ${current.person.birthYear}`, current.person.cardExpiresAt && `Thẻ HSD ${vnDate(current.person.cardExpiresAt)}`, current.person.trainingResult && `HL: ${current.person.trainingResult}`].filter(Boolean).join(" · ")}</p>}
              <p className="text-sm font-medium">{current.detail}</p>
              {current.reasons?.map(reason => <p key={reason} className="text-sm font-semibold">⚠ {reason}</p>)}
            </div>
          </div>
          {current.pending && <div className="mt-3 flex gap-2"><Button type="button" className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={() => decide(true)}>Vẫn cho vào</Button><Button type="button" variant="outline" className="flex-1" onClick={() => decide(false)}>Không cho vào</Button></div>}
          {current.notFound && <form className="mt-3 flex flex-wrap gap-2" onSubmit={quickAdd}>
            <input autoFocus className="min-h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground" value={quickName} maxLength={200} onChange={e => setQuickName(e.target.value)} placeholder="Họ tên theo thẻ *" aria-label="Họ tên nhân viên" />
            <Button type="submit" disabled={!quickName.trim() || savePerson.isPending}><UserPlus />{savePerson.isPending ? "Đang thêm…" : "Thêm & cho vào"}</Button>
            <Button type="button" variant="outline" onClick={skipCurrent}>Bỏ qua</Button>
          </form>}
        </div> : <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Đưa mã QR trên thẻ vào khung camera, hoặc dùng đầu đọc QR.</p>}

        {scans.length > 1 && <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Các thẻ vừa quét</p>
          {scans.slice(1).map(scan => <div key={scan.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
            <ToneIcon tone={scan.tone} /><span className="min-w-0 flex-1 truncate"><b>{scan.title}</b> · {scan.code}</span><span className="shrink-0 text-xs text-muted-foreground">{scan.added ? "Đã vào" : scan.tone === "info" ? "Đã có" : scan.pending || scan.notFound ? "Chờ xử lý" : "Không vào"}</span>
          </div>)}
        </div>}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-sm">Đã cho vào <b>{addedCount}</b> người trong lượt quét này</p>
        <Button type="button" onClick={onClose}><X />Xong</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
