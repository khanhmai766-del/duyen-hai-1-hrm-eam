"use client";

import * as React from "react";
import Link from "next/link";
import { Droplet, Flame, TrendingUp, Unplug } from "lucide-react";
import { DocumentCatalogPage } from "@/components/documents/document-catalog-page";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import OilGunBoard from "@/components/oil-guns/OilGunBoard";
import type { DocumentCategory } from "@/hooks/useDocuments";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { useCurrentPosition } from "@/hooks/useCurrentPosition";
import { OIL_SOOT_GATED_CATEGORIES, positionAllowsOilSoot } from "@/lib/oil-soot-access";
import { archiveCategoryPermissionId } from "@/lib/archive-permissions";
import { cn } from "@/lib/utils";

// Hai nhóm "Sửa chữa lớn" và "Dữ liệu vòi thổi bụi" đã bỏ khỏi giao diện.
// Dữ liệu cũ trong DB vẫn còn nguyên, API và phân quyền vẫn nhận hai nhóm này.
type ArchiveTab = {
  key: Extract<DocumentCategory, "GRID_SEPARATION" | "STARTUP_DATA" | "BOILER_CALIBRATION" | "OIL_GUN_DATA">;
  label: string;
  icon: React.ElementType;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
};

const ARCHIVE_TABS: ArchiveTab[] = [
  {
    key: "GRID_SEPARATION",
    label: "Dữ liệu tách lưới",
    icon: Unplug,
    description: "Lưu trữ đường dẫn dữ liệu tách lưới phục vụ tra cứu và tổng hợp vận hành",
    emptyTitle: "Chưa có dữ liệu tách lưới",
    emptyDescription: "Admin có thể thêm tên thư mục và link dữ liệu tách lưới tại đây.",
  },
  {
    key: "STARTUP_DATA",
    label: "Dữ liệu khởi động",
    icon: TrendingUp,
    description: "Lưu trữ đường dẫn dữ liệu khởi động phục vụ tra cứu và tổng hợp vận hành",
    emptyTitle: "Chưa có dữ liệu khởi động",
    emptyDescription: "Admin có thể thêm tên thư mục và link dữ liệu khởi động tại đây.",
  },
  {
    key: "BOILER_CALIBRATION",
    label: "Dữ liệu hiệu chỉnh lò",
    icon: Flame,
    description: "Lưu trữ đường dẫn dữ liệu hiệu chỉnh lò phục vụ theo dõi và phân tích vận hành",
    emptyTitle: "Chưa có dữ liệu hiệu chỉnh lò",
    emptyDescription: "Admin có thể thêm tên thư mục và link dữ liệu hiệu chỉnh lò tại đây.",
  },
  {
    key: "OIL_GUN_DATA",
    label: "Dữ liệu vòi đốt",
    icon: Droplet,
    description: "Lưu trữ đường dẫn dữ liệu vòi dầu phục vụ tra cứu và tổng hợp vận hành",
    emptyTitle: "Chưa có dữ liệu vòi dầu",
    emptyDescription: "Admin có thể thêm tên thư mục và link dữ liệu vòi dầu tại đây.",
  },
];
const UNIT_TAGS = [
  { label: "S1", value: "S1" },
  { label: "S2", value: "S2" },
];
const GRID_SEPARATION_NAME_OPTIONS = [
  { label: "Tách lưới sự cố", value: "Tách lưới sự cố" },
  { label: "Tách lưới có kế hoạch", value: "Tách lưới có kế hoạch" },
];
const STARTUP_NAME_OPTIONS = [
  { label: "Khởi động sau sự cố", value: "Khởi động sau sự cố" },
  { label: "Khởi động có kế hoạch", value: "Khởi động có kế hoạch" },
];
// Hai tab này cùng một nghiệp vụ (nhật ký thao tác theo mốc thời gian) nên dùng
// chung cấu hình: có Nguyên nhân, có Tiến trình dựng thành dòng thời gian.
const TIMELINE_TABS = new Set(["GRID_SEPARATION", "STARTUP_DATA"]);
const ARCHIVE_START_YEAR = 2024;
const CURRENT_YEAR = new Date().getFullYear();
// Dữ liệu tách lưới/khởi động bắt đầu quản lý từ năm 2024; danh sách tự mở
// rộng thêm khi sang năm mới và luôn xếp năm gần nhất lên đầu.
const ARCHIVE_YEAR_OPTIONS = Array.from(
  { length: Math.max(1, CURRENT_YEAR - ARCHIVE_START_YEAR + 1) },
  (_, index) => String(CURRENT_YEAR - index)
);
const BACKUP_FILENAME_PREFIX: Record<ArchiveTab["key"], string> = {
  GRID_SEPARATION: "backup-du-lieu-tach-luoi",
  STARTUP_DATA: "backup-du-lieu-khoi-dong",
  BOILER_CALIBRATION: "backup-du-lieu-hieu-chinh-lo",
  OIL_GUN_DATA: "backup-du-lieu-voi-dau",
};

export default function ArchiveDocumentsPage() {
  const rbac = useRbacAccess();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const currentPosition = useCurrentPosition();
  // Được xem tab vòi đốt nếu: ADMIN, hoặc có ít nhất một chức vụ (chính hoặc phụ)
  // nằm trong danh sách cho phép.
  const canSeeOilSootTabs = React.useMemo(
    () => isAdmin || positionAllowsOilSoot(currentPosition.options),
    [isAdmin, currentPosition.options]
  );
  const [activeTab, setActiveTab] = React.useState<ArchiveTab["key"]>("GRID_SEPARATION");
  const visibleTabs = React.useMemo(
    () =>
      ARCHIVE_TABS.filter((item) => {
        if (OIL_SOOT_GATED_CATEGORIES.has(item.key)) return canSeeOilSootTabs;
        const permissionId = archiveCategoryPermissionId(item.key);
        return permissionId ? rbac.can(permissionId, ["read", "personal", "manage", "full"]) : true;
      }),
    [rbac, canSeeOilSootTabs]
  );
  React.useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((item) => item.key === activeTab)) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [activeTab, visibleTabs]);
  const activeConfig = visibleTabs.find((item) => item.key === activeTab) ?? visibleTabs[0] ?? ARCHIVE_TABS[0];
  const usesArchiveTimelineLayout =
    activeTab === "BOILER_CALIBRATION" ||
    activeTab === "GRID_SEPARATION" ||
    activeTab === "STARTUP_DATA" ||
    activeTab === "OIL_GUN_DATA";

  if (!rbac.isLoading && visibleTabs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Bạn không có quyền xem các phần trong thư mục lưu trữ.
      </div>
    );
  }

  return (
    <DocumentCatalogPage
      key={activeTab}
      category={activeTab}
      title="THƯ MỤC LƯU TRỮ"
      description="Lưu trữ đường dẫn dữ liệu phục vụ tra cứu và tổng hợp vận hành"
      nameLabel="Tên thư mục"
      nameOptions={activeTab === "GRID_SEPARATION" ? GRID_SEPARATION_NAME_OPTIONS : activeTab === "STARTUP_DATA" ? STARTUP_NAME_OPTIONS : undefined}
      codeLabel="Mã thư mục"
      linkLabel={
        activeTab === "BOILER_CALIBRATION"
          ? "Nội dung hiệu chỉnh"
          : activeTab === "GRID_SEPARATION"
            ? "Link xử lý (nếu có)"
            : activeTab === "STARTUP_DATA"
              ? "Link xử lý (nếu có)"
              : activeTab === "OIL_GUN_DATA"
                ? "Link dữ liệu vòi dầu"
                : "Link thư mục"
      }
      requireLink={activeTab !== "GRID_SEPARATION" && activeTab !== "STARTUP_DATA"}
      addLabel="Thêm thư mục"
      emptyTitle={activeConfig.emptyTitle}
      emptyDescription={activeConfig.emptyDescription}
      showCodeField={false}
      tagLabel={usesArchiveTimelineLayout ? "Tổ máy" : undefined}
      tagOptions={usesArchiveTimelineLayout ? UNIT_TAGS : undefined}
      requireTag={usesArchiveTimelineLayout}
      dateLabel={usesArchiveTimelineLayout ? "Ngày ghi nhận" : undefined}
      dateInputType={activeTab === "GRID_SEPARATION" || activeTab === "STARTUP_DATA" ? "datetime-local" : "date"}
      requireDate={usesArchiveTimelineLayout}
      contentMode={activeTab === "BOILER_CALIBRATION" ? "text" : "link"}
      contentPlaceholder={
        activeTab === "BOILER_CALIBRATION"
          ? "Nhập nội dung hiệu chỉnh..."
          : activeTab === "GRID_SEPARATION"
            ? "https://... hoặc link xử lý / biên bản"
            : activeTab === "STARTUP_DATA"
              ? "https://... hoặc link xử lý / biên bản"
              : activeTab === "OIL_GUN_DATA"
                ? "https://... hoặc link dữ liệu vòi dầu"
                : "https://... hoặc link Google Drive / PDF"
      }
      reasonLabel={TIMELINE_TABS.has(activeTab) ? "Nguyên nhân" : undefined}
      reasonPlaceholder={activeTab === "GRID_SEPARATION" ? "Nhập nguyên nhân tách lưới..." : activeTab === "STARTUP_DATA" ? "Nhập nguyên nhân khởi động..." : undefined}
      progressLabel={
        activeTab === "GRID_SEPARATION"
          ? "Tiến trình tách lưới"
          : activeTab === "STARTUP_DATA"
            ? "Tiến trình khởi động"
            : undefined
      }
      progressPlaceholder={
        activeTab === "GRID_SEPARATION"
          ? "Nhập tiến trình tách lưới..."
          : activeTab === "STARTUP_DATA"
            ? "Nhập tiến trình khởi động..."
            : undefined
      }
      noteLabel={TIMELINE_TABS.has(activeTab) ? "Ghi chú" : undefined}
      notePlaceholder={TIMELINE_TABS.has(activeTab) ? "Nhập ghi chú..." : undefined}
      summaryLabel={TIMELINE_TABS.has(activeTab) ? "Nguyên nhân" : undefined}
      summaryField={TIMELINE_TABS.has(activeTab) ? "reason" : undefined}
      attachmentLabel={activeTab === "BOILER_CALIBRATION" ? "Hình ảnh biên bản" : undefined}
      maxAttachments={activeTab === "BOILER_CALIBRATION" ? 2 : undefined}
      defaultName={
        activeTab === "BOILER_CALIBRATION"
          ? "Hiệu chỉnh Lò"
          : activeTab === "STARTUP_DATA"
            ? "Khởi động tổ máy"
            : activeTab === "OIL_GUN_DATA"
              ? "Dữ liệu vòi đốt"
              : undefined
      }
      yearLabel={usesArchiveTimelineLayout ? "Năm" : undefined}
      yearOptions={usesArchiveTimelineLayout ? ARCHIVE_YEAR_OPTIONS : undefined}
      requireYear={usesArchiveTimelineLayout}
      showTimeline={TIMELINE_TABS.has(activeTab)}
      historyTableLayout={usesArchiveTimelineLayout}
      showPaginationFooter={activeTab === "GRID_SEPARATION" || activeTab === "STARTUP_DATA"}
      allowStaffEdit
      showAnnualBackupExport={activeTab !== "OIL_GUN_DATA"}
      customContent={activeTab === "OIL_GUN_DATA" ? <OilGunBoard /> : undefined}
      hideToolbar={activeTab === "OIL_GUN_DATA"}
      backupSubtitle={`Báo cáo backup ${activeConfig.label.toLowerCase()} theo năm`}
      backupFilenamePrefix={BACKUP_FILENAME_PREFIX[activeTab]}
      beforeTagFilter={
        activeTab === "GRID_SEPARATION" ? (
          <Link href="/documents/archive/bgts-tuabin-ngung">
            <Button type="button" variant="outline" className="h-10 whitespace-nowrap">
              BGTS Tuabin Ngừng
            </Button>
          </Link>
        ) : undefined
      }
      afterHeader={
        <div className="flex flex-wrap gap-1 border-b border-border">
          {visibleTabs.map((item) => (
            <ArchiveTabButton
              key={item.key}
              active={activeTab === item.key}
              icon={item.icon}
              label={item.label}
              onClick={() => setActiveTab(item.key)}
            />
          ))}
        </div>
      }
    />
  );
}

function ArchiveTabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "-mb-px inline-flex whitespace-nowrap items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
        active ? "border-navy text-navy" : "border-transparent text-muted-foreground hover:text-ink"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
