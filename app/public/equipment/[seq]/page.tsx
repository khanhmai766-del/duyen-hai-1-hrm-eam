import { redirect } from "next/navigation";
import { QrCode, ShieldX } from "lucide-react";
import { auth } from "@/lib/auth";
import { canonicalSeq } from "@/lib/equipment-units";
import { authenticatedDeviceQrUrl, normalizeQrMachine } from "@/lib/device-qr";
import { resolveActiveDeviceQrCard } from "@/lib/device-qr-access";

export const dynamic = "force-dynamic";

/**
 * Tương thích các mã QR đã in trước đây.
 * Middleware buộc đăng nhập trước khi tới đây; mã còn hiệu lực được chuyển thẳng
 * sang hồ sơ đầy đủ, nên không còn trang thông tin thiết bị công khai.
 */
export default async function LegacyEquipmentQrPage({
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
  const session = await auth();
  redirect(authenticatedDeviceQrUrl(seq, card.machine, session?.user?.accessMode));
}

function InactiveQr() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eef3f8] p-4 text-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-7 text-center shadow-lg">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-700">
          <ShieldX className="h-8 w-8" />
        </span>
        <h1 className="mt-4 text-xl font-black text-[#09233f]">Mã QR không còn hiệu lực</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Thẻ QR đã được gỡ, thiết bị không tồn tại hoặc mã không đúng phạm vi tổ máy.</p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
          <QrCode className="h-4 w-4" /> PowerPlant EAM
        </div>
      </section>
    </main>
  );
}
