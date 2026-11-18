import { UtilityAccessGate } from "@/components/tien-ich/UtilityAccessGate";

export const dynamic = "force-dynamic";

/** Chuẩn thể thức văn bản: ứng dụng chạy hoàn toàn trên trình duyệt (public/apps/chuan-the-thuc, sinh bởi scripts/build/chuan-the-thuc.mjs). */
export default function Page() {
  return (
    <UtilityAccessGate permissionId="utility-chuan-the-thuc-view" label="Chuẩn thể thức văn bản">
      <iframe
        src="/apps/chuan-the-thuc/index.html"
        title="Chuẩn thể thức văn bản"
        className="block h-[calc(100dvh-12.5rem)] min-h-[480px] w-full rounded-xl border border-border bg-white shadow-sm lg:h-[calc(100dvh-14.5rem)]"
      />
    </UtilityAccessGate>
  );
}
