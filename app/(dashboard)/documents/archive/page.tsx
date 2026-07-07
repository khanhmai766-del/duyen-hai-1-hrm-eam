"use client";

import * as React from "react";
import Link from "next/link";
import { Droplet, Flame, TrendingUp, Unplug, Wind } from "lucide-react";
import { DocumentCatalogPage } from "@/components/documents/document-catalog-page";
import { Button } from "@/components/ui/button";
import OilGunBoard from "@/components/oil-guns/OilGunBoard";
import type { DocumentCategory } from "@/hooks/useDocuments";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { archiveCategoryPermissionId } from "@/lib/archive-permissions";
import { cn } from "@/lib/utils";

type ArchiveTab = {
  key: Extract<
    DocumentCategory,
    "GRID_SEPARATION" | "STARTUP_DATA" | "BOILER_CALIBRATION" | "MAJOR_REPAIR" | "OIL_GUN_DATA" | "SOOT_BLOWER_DATA"
  >;
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
    key: "MAJOR_REPAIR",
    label: "Sửa chữa lớn",
    icon: WrenchScrewdriverIcon,
    description: "Lưu trữ đường dẫn tài liệu sửa chữa lớn phục vụ tra cứu và tổng hợp vận hành",
    emptyTitle: "Chưa có dữ liệu sửa chữa lớn",
    emptyDescription: "Admin có thể thêm tên thư mục và link tài liệu sửa chữa lớn tại đây.",
  },
  {
    key: "OIL_GUN_DATA",
    label: "Dữ liệu vòi dầu",
    icon: Droplet,
    description: "Lưu trữ đường dẫn dữ liệu vòi dầu phục vụ tra cứu và tổng hợp vận hành",
    emptyTitle: "Chưa có dữ liệu vòi dầu",
    emptyDescription: "Admin có thể thêm tên thư mục và link dữ liệu vòi dầu tại đây.",
  },
  {
    key: "SOOT_BLOWER_DATA",
    label: "Dữ liệu vòi thổi bụi",
    icon: Wind,
    description: "Lưu trữ đường dẫn dữ liệu vòi thổi bụi phục vụ tra cứu và tổng hợp vận hành",
    emptyTitle: "Chưa có dữ liệu vòi thổi bụi",
    emptyDescription: "Admin có thể thêm tên thư mục và link dữ liệu vòi thổi bụi tại đây.",
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
const CURRENT_YEAR = new Date().getFullYear();
const ARCHIVE_YEAR_OPTIONS = Array.from({ length: 8 }, (_, index) => String(CURRENT_YEAR - index));
const BACKUP_FILENAME_PREFIX: Record<ArchiveTab["key"], string> = {
  GRID_SEPARATION: "backup-du-lieu-tach-luoi",
  STARTUP_DATA: "backup-du-lieu-khoi-dong",
  BOILER_CALIBRATION: "backup-du-lieu-hieu-chinh-lo",
  MAJOR_REPAIR: "backup-sua-chua-lon",
  OIL_GUN_DATA: "backup-du-lieu-voi-dau",
  SOOT_BLOWER_DATA: "backup-du-lieu-voi-thoi-bui",
};

export default function ArchiveDocumentsPage() {
  const rbac = useRbacAccess();
  const [activeTab, setActiveTab] = React.useState<ArchiveTab["key"]>("GRID_SEPARATION");
  const visibleTabs = React.useMemo(
    () =>
      ARCHIVE_TABS.filter((item) => {
        const permissionId = archiveCategoryPermissionId(item.key);
        return permissionId ? rbac.can(permissionId, ["read", "own", "create", "approve", "manage", "full"]) : true;
      }),
    [rbac]
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
    activeTab === "MAJOR_REPAIR" ||
    activeTab === "OIL_GUN_DATA" ||
    activeTab === "SOOT_BLOWER_DATA";

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
      nameOptions={activeTab === "GRID_SEPARATION" ? GRID_SEPARATION_NAME_OPTIONS : undefined}
      codeLabel="Mã thư mục"
      linkLabel={
        activeTab === "BOILER_CALIBRATION"
          ? "Nội dung hiệu chỉnh"
          : activeTab === "GRID_SEPARATION"
            ? "Link xử lý (nếu có)"
            : activeTab === "STARTUP_DATA"
              ? "Ghi chú"
              : activeTab === "MAJOR_REPAIR"
                ? "Link tài liệu sửa chữa"
                : activeTab === "OIL_GUN_DATA"
                  ? "Link dữ liệu vòi dầu"
                  : activeTab === "SOOT_BLOWER_DATA"
                    ? "Link dữ liệu vòi thổi bụi"
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
      contentMode={activeTab === "BOILER_CALIBRATION" || activeTab === "STARTUP_DATA" ? "text" : "link"}
      contentPlaceholder={
        activeTab === "BOILER_CALIBRATION"
          ? "Nhập nội dung hiệu chỉnh..."
          : activeTab === "GRID_SEPARATION"
            ? "https://... hoặc link xử lý / biên bản"
            : activeTab === "STARTUP_DATA"
              ? "Nhập ghi chú..."
              : activeTab === "OIL_GUN_DATA"
                ? "https://... hoặc link dữ liệu vòi dầu"
                : activeTab === "SOOT_BLOWER_DATA"
                  ? "https://... hoặc link dữ liệu vòi thổi bụi"
              : "https://... hoặc link Google Drive / PDF"
      }
      reasonLabel={activeTab === "GRID_SEPARATION" ? "Nguyên nhân" : undefined}
      reasonPlaceholder={activeTab === "GRID_SEPARATION" ? "Nhập nguyên nhân tách lưới..." : undefined}
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
      noteLabel={activeTab === "GRID_SEPARATION" ? "Ghi chú" : undefined}
      notePlaceholder={activeTab === "GRID_SEPARATION" ? "Nhập ghi chú..." : undefined}
      summaryLabel={activeTab === "GRID_SEPARATION" ? "Nguyên nhân" : undefined}
      summaryField={activeTab === "GRID_SEPARATION" ? "reason" : undefined}
      attachmentLabel={activeTab === "BOILER_CALIBRATION" ? "Hình ảnh biên bản" : undefined}
      maxAttachments={activeTab === "BOILER_CALIBRATION" ? 2 : undefined}
      defaultName={
        activeTab === "BOILER_CALIBRATION"
          ? "Hiệu chỉnh Lò"
          : activeTab === "STARTUP_DATA"
            ? "Khởi động tổ máy"
            : activeTab === "MAJOR_REPAIR"
              ? "Sửa chữa lớn"
              : activeTab === "OIL_GUN_DATA"
                ? "Dữ liệu vòi dầu"
                : activeTab === "SOOT_BLOWER_DATA"
                  ? "Dữ liệu vòi thổi bụi"
                  : undefined
      }
      yearLabel={usesArchiveTimelineLayout ? "Năm" : undefined}
      yearOptions={usesArchiveTimelineLayout ? ARCHIVE_YEAR_OPTIONS : undefined}
      requireYear={usesArchiveTimelineLayout}
      historyTableLayout={usesArchiveTimelineLayout}
      showPaginationFooter={activeTab === "GRID_SEPARATION" || activeTab === "STARTUP_DATA"}
      allowStaffEdit
      showAnnualBackupExport
      customContent={activeTab === "OIL_GUN_DATA" ? <OilGunBoard /> : undefined}
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

// Icon cờ lê + tua vít (Heroicons "wrench-screwdriver") — dùng cho tab Sửa chữa lớn.
function WrenchScrewdriverIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
    </svg>
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
