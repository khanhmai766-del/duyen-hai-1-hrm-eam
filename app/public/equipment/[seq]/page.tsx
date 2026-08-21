import { ExternalLink, FileText, ImageIcon, QrCode, ShieldCheck, ShieldX, Zap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { canonicalSeq, s2Kks } from "@/lib/equipment-units";
import { normalizeQrMachine } from "@/lib/device-qr";
import { resolveActiveDeviceQrCard } from "@/lib/device-qr-access";
import { normalizeEquipmentNodeName } from "@/lib/equipment-tree";

export const dynamic = "force-dynamic";

export default async function PublicEquipmentQrPage({
  params,
  searchParams,
}: {
  params: { seq: string };
  searchParams: { machine?: string };
}) {
  const displayedSeq = decodeURIComponent(params.seq);
  const seq = canonicalSeq(displayedSeq);
  const requestedMachine = normalizeQrMachine(searchParams.machine)
    ?? (/^DH1\.S2(?:\.|$)/i.test(displayedSeq) ? "S2" : null);
  const card = await resolveActiveDeviceQrCard(seq, requestedMachine);
  if (!card) return <InactiveQr />;

  // Trang công khai chỉ cần một thiết bị: không nạp/normalize toàn bộ cây và ảnh base64.
  const node = await prisma.equipmentNode.findUnique({
    where: { seq },
    select: { seq: true, parentSeq: true, name: true, kks: true, drawing: true, attachedInfo: true, documentUrl: true, imageUrl: true },
  });
  if (!node) return <InactiveQr />;
  const ancestorSeqs = ancestorCandidates(seq);
  let parent = node.parentSeq
    ? await prisma.equipmentNode.findUnique({ where: { seq: node.parentSeq }, select: { seq: true, name: true } })
    : null;
  if (!parent && ancestorSeqs.length) {
    parent = await prisma.equipmentNode.findFirst({
      where: { seq: { in: ancestorSeqs } },
      orderBy: { depth: "desc" },
      select: { seq: true, name: true },
    });
  }
  const profiles = await prisma.equipmentProfile.findMany({
    where: { machine: card.machine, nodeSeq: { in: [seq, parent?.seq].filter((value): value is string => Boolean(value)) } },
  });
  const profile = profiles.find((item) => item.nodeSeq === seq) ?? null;
  const parentProfile = profiles.find((item) => item.nodeSeq === parent?.seq) ?? null;
  const isS2 = card.machine === "S2";
  const name = profile?.name ?? normalizeEquipmentNodeName(seq, node.name);
  const kks = profile?.kks ?? (isS2 ? s2Kks(node.kks ?? null) : node.kks ?? null);
  const system = parentProfile?.name ?? parent?.name ?? "Thư mục gốc";
  const imageUrl = profile?.imageUrl ?? (isS2 ? null : node.imageUrl ?? null);
  const attachedInfo = profile?.attachedInfo ?? (isS2 ? null : node.attachedInfo ?? null);
  const documentUrl = profile?.documentUrl ?? (isS2 ? null : node.documentUrl ?? null);

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-950">
      <header className="border-b border-slate-200 bg-[#09233f] text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-5 sm:px-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400 text-[#09233f]"><Zap className="h-6 w-6" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-200">Vận Hành 1 · PowerPlant EAM</p>
            <h1 className="mt-1 text-lg font-black">Tra cứu nhanh thiết bị</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={name} className="aspect-[4/3] w-full object-cover" />
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center bg-slate-100 text-slate-500">
              <ImageIcon className="h-11 w-11" /><span className="mt-2 text-sm font-semibold">Chưa có hình ảnh</span>
            </div>
          )}
          <div className="border-t border-slate-100 p-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> Mã QR đang hiệu lực
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="font-mono text-sm font-black text-blue-700">{displayedSeq}</p>
          <h2 className="mt-2 text-2xl font-black leading-tight text-[#09233f] sm:text-3xl">{name}</h2>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <Detail label="Mã thiết bị" value={displayedSeq} mono />
            <Detail label="Mã KKS" value={kks || "Chưa cập nhật"} mono />
            <Detail label="Thuộc hệ thống" value={system} />
            <Detail label="Bản vẽ liên quan" value={node.drawing || "Chưa cập nhật"} />
          </dl>

          {attachedInfo && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="flex items-center gap-2 text-sm font-black text-[#09233f]"><FileText className="h-4 w-4" /> Thông tin đính kèm</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{attachedInfo}</p>
            </div>
          )}
          {documentUrl && (
            <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
              <ExternalLink className="h-4 w-4" /> Mở tài liệu đính kèm
            </a>
          )}
          <p className="mt-6 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
            Trang công khai chỉ hiển thị thông tin nhận diện cơ bản. Đăng nhập hệ thống và dùng chức năng Quét QR để xem hồ sơ nghiệp vụ theo quyền được cấp.
          </p>
        </section>
      </div>
    </main>
  );
}

function ancestorCandidates(seq: string) {
  const parts = seq.split(".");
  const result: string[] = [];
  parts.pop();
  while (parts.length) {
    result.push(parts.join("."));
    parts.pop();
  }
  return result;
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-sm font-bold text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function InactiveQr() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f8] p-4 text-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-7 text-center shadow-lg">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-700"><ShieldX className="h-8 w-8" /></span>
        <h1 className="mt-4 text-xl font-black text-[#09233f]">Mã QR không còn hiệu lực</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Thẻ QR đã được gỡ, thiết bị không tồn tại hoặc mã không đúng phạm vi tổ máy.</p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600"><QrCode className="h-4 w-4" /> PowerPlant EAM</div>
      </section>
    </main>
  );
}
