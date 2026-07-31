"use client";

import * as React from "react";
import { BookOpen, Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useDeleteDeviceGuide,
  useDeviceGuide,
  useUploadDeviceGuide,
  type DeviceGuideDoc,
} from "@/hooks/useDeviceGuide";

/**
 * Nút mở tài liệu hướng dẫn tạo mới thiết bị (PDF trên S3, cùng thư mục với
 * lịch trực ca). Chỉ nạp dữ liệu khi người dùng mở hộp thoại.
 */
export function DeviceGuideButton({ canManage }: { canManage: boolean /* chỉ ADMIN */ }) {
  const [open, setOpen] = React.useState(false);
  const { data, isLoading } = useDeviceGuide({ enabled: open });
  const upload = useUploadDeviceGuide();
  const remove = useDeleteDeviceGuide();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const guide = data?.data as DeviceGuideDoc | undefined;
  const hasPdf = !!guide?.url;

  // Đổi tệp thì URL proxy vẫn cũ (key mới nhưng iframe có thể còn cache) — gắn
  // mốc thời gian tải lên để buộc trình duyệt lấy bản mới.
  const pdfUrl = React.useMemo(() => {
    if (!guide?.url) return "";
    const separator = guide.url.includes("?") ? "&" : "?";
    return `${guide.url}${separator}v=${encodeURIComponent(guide.uploadedAt ?? "")}`;
  }, [guide?.uploadedAt, guide?.url]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // cho phép chọn lại đúng tệp vừa chọn
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return toast.error("Chỉ chấp nhận tệp PDF");
    }
    try {
      await upload.mutateAsync(file);
      toast.success("Đã tải lên tài liệu hướng dẫn");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function onRemove() {
    try {
      await remove.mutateAsync();
      toast.success("Đã xoá tài liệu hướng dẫn");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString("vi-VN") : "");

  return (
    <>
      <Button variant="soft" size="toolbar" onClick={() => setOpen(true)}>
        <BookOpen className="h-4 w-4" /> Hướng dẫn
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl gap-3 p-4 sm:p-5">
          <DialogHeader className="pr-10">
            <DialogTitle>Hướng dẫn tạo mới thiết bị</DialogTitle>
            <DialogDescription>
              {hasPdf
                ? `${guide?.name ?? "huong-dan-thiet-bi.pdf"} · cập nhật ${fmt(guide?.uploadedAt)}${guide?.uploadedBy ? ` bởi ${guide.uploadedBy}` : ""}`
                : "Tài liệu hướng dẫn thao tác thêm thiết bị và tạo hệ thống trên cây thư mục."}
            </DialogDescription>
          </DialogHeader>

          {(hasPdf || canManage) && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {hasPdf && (
                <a href={guide!.url!} download target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4" /> Tải xuống
                  </Button>
                </a>
              )}
              {canManage && (
                <>
                  <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={onPick} />
                  <Button size="sm" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
                    {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {hasPdf ? "Thay tài liệu" : "Tải lên tài liệu (PDF)"}
                  </Button>
                  {hasPdf && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRemove}
                      disabled={remove.isPending}
                      title="Xoá tài liệu hướng dẫn"
                    >
                      {remove.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="flex h-[70vh] items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : hasPdf ? (
            <iframe
              src={pdfUrl}
              title="Hướng dẫn tạo mới thiết bị"
              className="h-[70vh] w-full rounded-lg border border-border"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <FileText className="h-8 w-8" />
              </span>
              <div>
                <div className="font-semibold text-ink">Chưa có tài liệu hướng dẫn</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {canManage
                    ? "Tải lên tệp PDF hướng dẫn tạo mới thiết bị."
                    : "Tài liệu sẽ được Quản trị hệ thống cập nhật. Vui lòng quay lại sau."}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
