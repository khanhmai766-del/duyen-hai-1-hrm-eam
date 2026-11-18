import OverhaulProgressPage from "@/components/tien-ich/OverhaulProgressPage";
import { UtilityAccessGate } from "@/components/tien-ich/UtilityAccessGate";

export const dynamic = "force-dynamic";

/** Tiến độ đại tu S2 dạng bảng như 4 file Sheet — chỉ dùng trong đợt đại tu 06/10–04/12/2026.
 *  Quyền mở trang: "utility-overhaul-view". API giữ nguyên quyền cũ vì Phiếu công tác cũng đọc. */
export default function Page() {
  return (
    <UtilityAccessGate permissionId="utility-overhaul-view" label="Tiến độ đại tu">
      <OverhaulProgressPage />
    </UtilityAccessGate>
  );
}
