import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  ImageIcon,
  Package,
  ShieldCheck,
  Wrench,
  Zap,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PublicDevicePage({ params }: { params: { id: string } }) {
  const device = await prisma.device.findUnique({
    where: { id: params.id },
    include: {
      materials: {
        include: { material: true },
        orderBy: { usedAt: "desc" },
      },
      materialReplacements: {
        where: { isActive: true },
        include: { material: true },
        orderBy: { nextDueAt: "asc" },
        take: 6,
      },
      repairLogs: {
        include: { createdBy: { select: { name: true, avatarUrl: true } } },
        orderBy: { startedAt: "desc" },
        take: 5,
      },
    },
  });

  if (!device) notFound();

  const defectHistories = await prisma.defectHistory.findMany({
    where: { device: device.code },
    include: { createdBy: { select: { name: true, avatarUrl: true } } },
    orderBy: { performedAt: "desc" },
    take: 5,
  });

  const primaryImage = device.images[0];

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_70%_35%,rgba(37,99,235,0.13),transparent_34%),linear-gradient(135deg,transparent,rgba(20,184,166,0.09))] lg:block" />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-10">
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
              <h1 className="max-w-3xl text-3xl font-black leading-tight text-ink sm:text-4xl">{device.name}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <InfoPill label="Mã thiết bị" value={device.code} mono />
                <InfoPill label="Cương vị" value={device.managingPosition || "Chưa cập nhật"} />
                <InfoPill label="Hệ thống" value={device.system || "Chưa cập nhật"} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-200/80">
            {primaryImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={primaryImage} alt={device.name} className="aspect-[4/3] w-full rounded-xl object-cover" />
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
              <Detail label="Tên thiết bị" value={device.name} />
              <Detail label="Mã thiết bị" value={device.code} mono />
              <Detail label="Hệ thống" value={device.system || "Chưa cập nhật"} />
              <Detail label="Cương vị quản lý" value={device.managingPosition || "Chưa cập nhật"} />
            </div>
            {device.attachedInfo && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Thông tin đính kèm</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{device.attachedInfo}</p>
              </div>
            )}
            {device.documentUrl && (
              <a
                href={device.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                <ExternalLink className="h-4 w-4" />
                Mở tài liệu đính kèm
              </a>
            )}
          </Panel>

          <Panel title="Lịch sử xử lý gần đây" icon={Wrench}>
            {defectHistories.length || device.repairLogs.length ? (
              <div className="space-y-3">
                {defectHistories.map((item) => (
                  <HistoryItem
                    key={item.id}
                    title={item.workOrderNumber || item.requestNumber || "Lịch sử khiếm khuyết"}
                    date={formatDate(item.performedAt)}
                    result={item.result || "Chưa có kết quả"}
                    note={item.content || undefined}
                    user={item.createdBy.name}
                  />
                ))}
                {device.repairLogs.map((item) => (
                  <HistoryItem
                    key={item.id}
                    title={item.title}
                    date={formatDate(item.startedAt)}
                    result={item.result || item.action || "Đang cập nhật"}
                    note={item.description}
                    user={item.createdBy.name}
                  />
                ))}
              </div>
            ) : (
              <EmptyState text="Chưa có lịch sử sửa chữa hoặc xử lý khiếm khuyết." />
            )}
          </Panel>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <Panel title="Hình ảnh thiết bị" icon={ImageIcon}>
            {device.images.length ? (
              <div className="grid grid-cols-3 gap-2">
                {device.images.map((src, index) => (
                  <a key={src + index} href={src} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`${device.name} ${index + 1}`} className="aspect-square w-full object-cover transition duration-200 group-hover:scale-105" />
                  </a>
                ))}
              </div>
            ) : (
              <EmptyState text="Chưa có hình ảnh thiết bị." />
            )}
          </Panel>

          <Panel title="Vật tư sử dụng" icon={Package}>
            {device.materials.length ? (
              <div className="space-y-2">
                {device.materials.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="font-semibold text-slate-900">{item.material.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.material.unit ? `ĐVT: ${item.material.unit}` : "ĐVT: —"}
                      {item.material.supplier ? ` · Định kỳ: ${item.material.supplier}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="Chưa gắn vật tư sử dụng." />
            )}
          </Panel>

          <Panel title="Lịch thay thế vật tư" icon={CalendarClock}>
            {device.materialReplacements.length ? (
              <div className="space-y-2">
                {device.materialReplacements.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{item.material.name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Chu kỳ {item.intervalMonths} tháng{item.intervalNote ? ` · ${item.intervalNote}` : ""}
                        </div>
                      </div>
                      <span className="whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                        {formatDate(item.nextDueAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="Chưa có lịch thay thế vật tư." />
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

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof CheckCircle2; children: React.ReactNode }) {
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

function HistoryItem({ title, date, result, note, user }: { title: string; date: string; result: string; note?: string; user: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-xs text-slate-500">{date} · {user}</div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Đã ghi nhận
        </span>
      </div>
      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{result}</div>
      {note && <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{note}</p>}
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
      <AlertTriangle className="h-4 w-4 text-slate-400" />
      {text}
    </div>
  );
}
