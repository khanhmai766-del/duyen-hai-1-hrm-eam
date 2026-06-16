"use client";

import * as React from "react";
import { Flame, TrendingUp, Unplug } from "lucide-react";
import { DocumentCatalogPage } from "@/components/documents/document-catalog-page";
import type { DocumentCategory } from "@/hooks/useDocuments";
import { cn } from "@/lib/utils";

type ArchiveTab = {
  key: Extract<DocumentCategory, "GRID_SEPARATION" | "STARTUP_DATA" | "BOILER_CALIBRATION">;
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
};

export default function ArchiveDocumentsPage() {
  const [activeTab, setActiveTab] = React.useState<ArchiveTab["key"]>("GRID_SEPARATION");
  const activeConfig = ARCHIVE_TABS.find((item) => item.key === activeTab) ?? ARCHIVE_TABS[0];
  const usesArchiveTimelineLayout = activeTab === "BOILER_CALIBRATION" || activeTab === "GRID_SEPARATION" || activeTab === "STARTUP_DATA";

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
      defaultName={activeTab === "BOILER_CALIBRATION" ? "Hiệu chỉnh Lò" : activeTab === "STARTUP_DATA" ? "Khởi động tổ máy" : undefined}
      yearLabel={usesArchiveTimelineLayout ? "Năm" : undefined}
      yearOptions={usesArchiveTimelineLayout ? ARCHIVE_YEAR_OPTIONS : undefined}
      requireYear={usesArchiveTimelineLayout}
      historyTableLayout={usesArchiveTimelineLayout}
      showPaginationFooter={activeTab === "GRID_SEPARATION" || activeTab === "STARTUP_DATA"}
      allowStaffEdit
      showAnnualBackupExport
      backupSubtitle={`Báo cáo backup ${activeConfig.label.toLowerCase()} theo năm`}
      backupFilenamePrefix={BACKUP_FILENAME_PREFIX[activeTab]}
      afterHeader={
        <div className="flex gap-1 border-b border-border">
          {ARCHIVE_TABS.map((item) => (
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
        "-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
        active ? "border-navy text-navy" : "border-transparent text-muted-foreground hover:text-ink"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
