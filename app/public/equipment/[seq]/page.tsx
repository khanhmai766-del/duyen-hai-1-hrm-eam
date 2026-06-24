import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText, ImageIcon, Layers3, ShieldCheck, Zap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { buildEquipmentTreeIndex, getNormalizedEquipmentNodes } from "@/lib/equipment-tree";

export const dynamic = "force-dynamic";

export default async function PublicEquipmentNodePage({ params }: { params: { seq: string } }) {
  const seq = decodeURIComponent(params.seq);
  const nodes = await getNormalizedEquipmentNodes(prisma);
  const { bySeq, parentOf } = buildEquipmentTreeIndex(nodes);
  const node = bySeq.get(seq);

  if (!node) notFound();

  const parent = node.parentSeq ? bySeq.get(parentOf.get(node.seq) ?? node.parentSeq) : null;
  const device = await prisma.device.findUnique({
    where: { code: node.seq },
    include: {
      repairLogs: { orderBy: { startedAt: "desc" }, take: 1 },
      _count: { select: { repairLogs: true, materials: true, materialReplacements: true } },
    },
  });

  const imageUrl = device?.images?.[0] ?? node.imageUrl ?? null;
  const attachedInfo = device?.attachedInfo ?? node.attachedInfo;
  const documentUrl = device?.documentUrl ?? node.documentUrl;

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_70%_35%,rgba(37,99,235,0.13),transparent_34%),linear-gradient(135deg,transparent,rgba(20,184,166,0.09))] lg:block" />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-10">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-navy text-white shadow-lg shadow-navy/20">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">VẬN HÀNH 1 · THÔNG TIN THIẾT BỊ</p>
                <p className="mt-1 text-sm text-slate-500">Trang xem công khai từ mã QR thiết bị</p>
              </div>
            </div>

            <div>
              <div className="mb-3 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                Có thể xem không cần đăng nhập
              </div>
              <h1 className="max-w-3xl text-3xl font-black leading-tight text-ink sm:text-4xl">{node.name}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <InfoPill label="Số thứ tự" value={node.seq} mono />
                <InfoPill label="Thư mục" value={parent?.name || "Thư mục gốc"} />
                <InfoPill label="Bản vẽ" value={node.drawing || "Chưa cập nhật"} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-200/80">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={node.name} className="aspect-[4/3] w-full rounded-xl object-cover" />
            ) : (
              <div className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                <ImageIcon className="h-10 w-10" />
                <span className="mt-2 text-sm font-medium">Chưa có hình ảnh</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="space-y-5 lg:col-span-7">
          <Panel title="Thông tin thiết bị" icon={FileText}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Detail label="Tên thiết bị" value={node.name} />
              <Detail label="Số thứ tự" value={node.seq} mono />
              <Detail label="Thư mục cha" value={parent?.name || "Thư mục gốc"} />
              <Detail label="Bản vẽ liên quan" value={node.drawing || "Chưa cập nhật"} />
            </div>
            {attachedInfo && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Thông tin đính kèm</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{attachedInfo}</p>
              </div>
            )}
            {documentUrl && (
              <a
                href={documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                <ExternalLink className="h-4 w-4" />
                Mở tài liệu đính kèm
              </a>
            )}
          </Panel>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <Panel title="Dữ liệu lý lịch" icon={Layers3}>
            {device ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Detail label="Mã lý lịch" value={device.code} mono />
                  <Detail label="Cương vị quản lý" value={device.managingPosition || "Chưa cập nhật"} />
                  <Detail label="Hệ thống" value={device.system || "Chưa cập nhật"} />
                  <Detail label="Lượt sửa chữa" value={`${device._count.repairLogs}`} />
                </div>
                <Link
                  href={`/public/devices/${device.id}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                >
                  <ExternalLink className="h-4 w-4" />
                  Xem lý lịch công khai
                </Link>
              </div>
            ) : (
              <EmptyState text="Thiết bị này chưa liên kết bản ghi lý lịch chi tiết." />
            )}
          </Panel>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-slate-500 sm:px-6 lg:px-8">
        Dữ liệu chỉ phục vụ tra cứu nhanh tại hiện trường. Các thao tác chỉnh sửa yêu cầu đăng nhập hệ thống.
      </footer>
    </main>
  );
}

function InfoPill({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={mono ? "font-mono text-sm font-bold text-navy" : "text-sm font-bold text-slate-900"}>{value}</div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof FileText; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-base font-black text-ink">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <Icon className="h-4 w-4" />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={mono ? "mt-1 font-mono text-sm font-bold text-navy" : "mt-1 text-sm font-semibold text-slate-900"}>{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
      {text}
    </div>
  );
}
