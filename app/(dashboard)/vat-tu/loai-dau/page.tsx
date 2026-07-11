import { Suspense } from "react";
import OilGroupingPage from "@/components/vat-tu/OilGroupingPage";

export const metadata = { title: "Tồn kho vật tư theo nhóm" };

// Suspense bắt buộc vì OilGroupingPage dùng useSearchParams (?loai=...).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OilGroupingPage />
    </Suspense>
  );
}
