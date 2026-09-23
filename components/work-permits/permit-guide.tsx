"use client";

import { useState } from "react";
import { AlertTriangle, BookOpen, Building2, ChevronRight, HardHat, Library, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/*
 * Hướng dẫn cấp PCT ngay trong Sổ PCT (thay vì file PDF): nội dung nằm cạnh giao diện nên sửa quy
 * trình là sửa luôn hướng dẫn ở đây — tên nút trong từng bước phải KHỚP chữ trên màn hình.
 *
 * Mỗi phần = một dải lưu đồ ngắn (tên bước) + thẻ chi tiết từng bước. Cố ý giữ ít màu, ít biểu
 * tượng: đây là trang đọc để làm theo, không phải bảng điều khiển.
 */
type GuideStep = { title: string; where?: string; points: string[] };
type GuideSection = { key: string; label: string; icon: LucideIcon; intro: string; steps: GuideStep[]; note?: string };

const SECTIONS: GuideSection[] = [
  {
    key: "internal",
    label: "PCT nội bộ · điện tử",
    icon: Building2,
    intro: "Phiếu cho đơn vị sửa chữa nội bộ. Khai số và nội dung trên sổ này trước, sau đó cấp phiếu trên NKVH theo đúng nội dung đã khai.",
    steps: [
      {
        title: "Mở biểu mẫu",
        where: "Sổ PCT → chọn tab sổ Cơ – Nhiệt – Hóa hoặc Điện → Cấp phiếu nội bộ",
        points: ["Phiếu được ghi vào đúng sổ của tab đang mở — kiểm tra tab trước khi bấm."],
      },
      {
        title: "Khai thông tin & lấy số",
        where: "Bước 1 · Thông tin",
        points: [
          "Chọn Cương vị trước: hộp Chọn SYC sẽ lọc sẵn SYC của cương vị đó.",
          "Bấm Lấy số PCT. Số được giữ lại kể cả khi đóng biểu mẫu (xem mục Số đã lấy, chưa lưu phiếu).",
          "Điền Tổ máy, Ngày thực hiện, Số SYC (bấm Chọn SYC để liên kết), Thiết bị / vị trí, Nội dung công việc.",
        ],
      },
      {
        title: "Khai nhân sự",
        where: "Bước 2 · Nhân sự",
        points: [
          "Người cấp PCT điền sẵn theo tài khoản; sửa nếu người cấp thực tế khác.",
          "Người chỉ huy trực tiếp, Người lãnh đạo công việc: gõ tên — ô gợi ý các tên đã dùng ở phiếu trước.",
          "Đơn vị công tác điền sẵn (PXSC Cơ nhiệt / PXSC Điện tự động), sửa nếu khác. Nhập Số nhân viên.",
        ],
      },
      {
        title: "Lưu vào sổ",
        where: "Bước 3 · Trạng thái → Lưu",
        points: ["Phiếu lưu ở trạng thái Đã cấp, số PCT chính thức gắn vào phiếu."],
      },
      {
        title: "Cấp phiếu trên NKVH",
        where: "Trong danh sách, bấm số PCT (Sao chép số & mở NKVH)",
        points: [
          "Số PCT được sao chép và trang NKVH đúng sổ được mở sẵn.",
          "Cấp phiếu trên NKVH theo đúng nội dung vừa khai ở sổ này.",
        ],
      },
      {
        title: "Gắn link NKVH",
        where: "Bấm dòng phiếu → khung Liên kết NKVH → Gắn link NKVH",
        points: ["Dán link chi tiết phiếu trên NKVH. Từ đó bấm số PCT là mở đúng phiếu NKVH."],
      },
      {
        title: "Đóng phiếu",
        where: "Bấm dòng phiếu → Ghi nhận đóng phiếu",
        points: [
          "Chọn Đã đóng, ghi thời điểm đóng (kết quả không bắt buộc).",
          "Phiếu gắn SYC đã xử lý đủ 24 giờ sẽ tự đóng trong sổ.",
        ],
      },
    ],
    note: "Ghi nhận đóng phiếu trên sổ này KHÔNG đóng phiếu trên NKVH — thủ tục trên NKVH vẫn làm như thường lệ.",
  },
  {
    key: "contractor",
    label: "PCT nhà thầu · giấy",
    icon: HardHat,
    intro: "Phiếu giấy cho nhà thầu: khai đủ nội dung mẫu giấy trên sổ, in phiếu, rồi ghi từng lần làm việc đến khi đóng phiếu.",
    steps: [
      {
        title: "Mở biểu mẫu",
        where: "Sổ PCT → chọn tab sổ → Cấp phiếu nhà thầu",
        points: ["CHTT nhà thầu phải có sẵn trong tab Nhân sự nhà thầu (xem phần Danh mục dùng chung)."],
      },
      {
        title: "Khai thông tin & lấy số",
        where: "Bước 1 · Thông tin",
        points: [
          "Bấm Lấy số PCT. Điền Số phiếu ĐKCT, Đơn vị công tác, Phân loại (Kế hoạch / Ngoài kế hoạch / Đột xuất).",
          "Điền Tổ máy, Ngày thực hiện, Cương vị, Số SYC (bấm Chọn SYC).",
          "Phần A: tick Chuyên môn, điền Địa điểm, Nội dung, Phạm vi, Thời gian bắt đầu / kết thúc dự kiến.",
        ],
      },
      {
        title: "Mối nguy & biện pháp",
        where: "Bước 2 · Mẫu giấy → Chọn từ danh mục",
        points: [
          "Tick các cặp mối nguy – biện pháp phù hợp, bấm Thêm vào phiếu.",
          "Ở từng cặp, chọn đơn vị thực hiện: Đơn vị cho phép và/hoặc Đơn vị công tác — bảng Phần B / C tự cập nhật.",
          "Thiếu cặp phù hợp thì bấm Bổ sung cặp riêng cho phiếu.",
        ],
      },
      {
        title: "Chọn CHTT",
        where: "Bước 3 · Nhân sự",
        points: [
          "Bấm Chọn CHTT nhà thầu — Đơn vị công tác tự lấy theo đơn vị của CHTT.",
          "Lãnh đạo, nhân viên công tác bổ sung: mở mục Thông tin bổ sung (không bắt buộc).",
        ],
      },
      {
        title: "Lưu & in phiếu",
        where: "Bước 4 → Lưu, rồi bấm dòng phiếu → Xem và in HTML / Xuất Word",
        points: ["Mẫu in điền sẵn theo thông tin đã lưu; ô kiểm tra và chữ ký để trống để ký tay."],
      },
      {
        title: "Ghi từng lần làm việc",
        where: "Bấm dòng phiếu → Cho phép / mở lần làm việc",
        points: [
          "Mỗi ngày làm việc là một lần: ghi CHTT, nhân viên, thời điểm cho phép.",
          "Hết ngày bấm Kết thúc lần làm việc — CHTT được giải phóng, phiếu vẫn mở để làm tiếp lần sau.",
        ],
      },
      {
        title: "Đóng phiếu",
        where: "Bấm dòng phiếu → Cập nhật tiến độ",
        points: ["Sau khi kết thúc lần làm việc cuối: chọn Đã đóng, ghi Kết quả công việc và thời điểm đóng."],
      },
    ],
  },
  {
    key: "fix",
    label: "Khi cấp sai",
    icon: AlertTriangle,
    intro: "Cấp sai thì SỬA hoặc ĐỔI LOẠI phiếu với chính số đó — hạn chế hủy số để sổ không bị thủng số.",
    steps: [
      {
        title: "Đã lấy số nhưng chưa lưu",
        where: "Mục Số đã lấy, chưa lưu phiếu (đầu sổ) → Tiếp tục",
        points: ["Mở lại biểu mẫu với đúng số đã giữ, khai tiếp rồi lưu."],
      },
      {
        title: "Chọn nhầm nội bộ / nhà thầu",
        where: "Công tắc Nội bộ · PCT điện tử ⇄ Nhà thầu · PCT giấy ở đầu biểu mẫu",
        points: [
          "Số PCT giữ nguyên; phần nhân sự và mẫu giấy của loại cũ được xoá để khai lại.",
          "Phiếu đã cấp chỉ đổi được khi còn Đã cấp, chưa cho phép làm việc và chưa có lần làm việc nào.",
        ],
      },
      {
        title: "Sai nội dung sau khi cấp",
        where: "Bấm dòng phiếu → Chỉnh sửa / cấp phiếu",
        points: [
          "Sửa được đến khi phiếu đóng hoặc hủy; mẫu Word/HTML in lại theo nội dung mới.",
          "Phiếu nhà thầu đang có lần làm việc mở: kết thúc lần làm việc trước khi sửa.",
        ],
      },
      {
        title: "Phiếu không thực hiện",
        where: "Chỉnh sửa / cấp phiếu → Bước Trạng thái → Đã hủy",
        points: ["Ghi lý do hủy. Phiếu vẫn nằm trong sổ để đối chiếu."],
      },
      {
        title: "Báo quản trị",
        where: "Chỉ tài khoản quản trị",
        points: [
          "Lấy nhầm sổ Cơ ↔ Điện: số không chuyển sổ được — quản trị dùng Hủy lượt để trả số.",
          "Phiếu cần xoá hẳn (trùng phiếu, ghi nhầm sổ…): quản trị dùng Xóa PCT, bắt buộc ghi lý do.",
        ],
      },
    ],
  },
  {
    key: "catalog",
    label: "Danh mục dùng chung",
    icon: Library,
    intro: "Các danh mục phải có trước để cấp phiếu nhanh và đúng. Khai một lần, dùng cho mọi phiếu.",
    steps: [
      {
        title: "Nhân sự nhà thầu",
        where: "Tab Nhân sự nhà thầu",
        points: [
          "Bấm Thêm đơn vị, sau đó bấm Thêm nhân sự trên dòng của đơn vị: Họ tên, Số thẻ an toàn, SĐT, đánh dấu CHTT.",
          "Bấm dòng đơn vị để xem danh sách người; bút chì để sửa tên đơn vị (đổi sang tên đã có là gộp hai đơn vị).",
        ],
      },
      {
        title: "Biện pháp an toàn Cơ",
        where: "Tab Biện pháp an toàn Cơ",
        points: [
          "Thêm biện pháp: nhập cặp Nhận diện mối nguy – Biện pháp an toàn.",
          "Mục không còn dùng thì sửa sang Ngừng sử dụng; mục nhập trùng thì xoá.",
        ],
      },
      {
        title: "Mốc sổ giấy",
        where: "Nút Mốc sổ giấy (quản trị)",
        points: ["Đặt số bắt đầu của từng sổ theo năm. Chưa đặt mốc thì chưa lấy được số PCT."],
      },
    ],
  },
];

export function PermitGuideButton() {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setOpen(true)}><BookOpen />Hướng dẫn</Button>
    {open && <PermitGuideDialog onClose={() => setOpen(false)} />}
  </>;
}

function PermitGuideDialog({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(SECTIONS[0].key);
  const section = SECTIONS.find(item => item.key === active) ?? SECTIONS[0];
  return <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
    <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
      <div className="shrink-0 border-b border-border px-5 py-4 pr-12">
        <DialogTitle className="text-lg">Hướng dẫn cấp phiếu công tác</DialogTitle>
        <DialogDescription className="mt-1 text-[13px]">Làm theo thứ tự các bước. Dòng chữ xanh dưới mỗi bước cho biết bấm ở đâu — tên nút, tên mục ghi đúng như trên màn hình.</DialogDescription>
        <div className="mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Phần hướng dẫn">
          {SECTIONS.map(item => {
            const Icon = item.icon;
            const selected = item.key === section.key;
            return <button key={item.key} type="button" role="tab" aria-selected={selected} onClick={() => setActive(item.key)}
              className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                selected ? "bg-slate-900 text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <Icon className="h-3.5 w-3.5" />{item.label}
            </button>;
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" role="tabpanel">
        <p className="text-sm leading-6 text-foreground">{section.intro}</p>
        {/* Lưu đồ: chỉ tên bước, nhìn một lượt là thấy thứ tự; chi tiết nằm ở các thẻ bên dưới. */}
        <ol className="flex flex-wrap items-center gap-y-2 rounded-xl border border-border bg-muted/25 px-3 py-3" aria-label="Lưu đồ các bước">
          {section.steps.map((step, index) => <li key={step.title} className="flex items-center">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm dark:bg-background dark:text-foreground">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[#00558F] text-[10px] font-bold text-white">{index + 1}</span>{step.title}
            </span>
            {index < section.steps.length - 1 && <ChevronRight className="mx-1 h-4 w-4 shrink-0 text-muted-foreground/60" />}
          </li>)}
        </ol>
        <div className="space-y-2.5">
          {section.steps.map((step, index) => <section key={step.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-[#00558F] text-xs font-bold text-white">{index + 1}</span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
              {step.where && <p className="mt-0.5 text-xs font-medium text-blue-800 dark:text-blue-300">{step.where}</p>}
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13px] leading-5 text-slate-700 dark:text-muted-foreground">
                {step.points.map(point => <li key={point}>{point}</li>)}
              </ul>
            </div>
          </section>)}
        </div>
        {section.note && <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">{section.note}</p>}
      </div>
    </DialogContent>
  </Dialog>;
}
