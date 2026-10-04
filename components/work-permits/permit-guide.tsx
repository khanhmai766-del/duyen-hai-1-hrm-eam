"use client";

import { useState } from "react";
import { AlertTriangle, Building2, ChevronRight, Download, HardHat, Library, Puzzle, type LucideIcon } from "lucide-react";
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
    key: "extension",
    label: "Cài tiện ích NKVH",
    icon: Puzzle,
    intro: "Cài tiện ích Cấp số PCT NKVH – PXVH1 để lấy số tại bước B1, đồng bộ nội dung và tự ghi nhận đóng phiếu theo trạng thái trên NKVH. Gói tải từ website là bản dùng chính thức và không có quyền kết nối localhost.",
    steps: [
      {
        title: "Tải và giải nén",
        where: "Bấm Tải tiện ích bên dưới",
        points: [
          "Giải nén tệp ZIP vào một thư mục cố định, ví dụ Tài liệu\\Cap-so-PCT-NKVH.",
          "Không xóa hoặc di chuyển thư mục này sau khi cài, vì trình duyệt sẽ tiếp tục đọc tiện ích tại đó.",
        ],
      },
      {
        title: "Mở trang quản lý tiện ích",
        where: "Chrome: chrome://extensions · Edge: edge://extensions",
        points: ["Dán địa chỉ phù hợp vào thanh địa chỉ của trình duyệt, sau đó bật Chế độ dành cho nhà phát triển (Developer mode)."],
      },
      {
        title: "Cài thư mục đã giải nén",
        where: "Tải tiện ích đã giải nén (Load unpacked)",
        points: [
          "Chọn đúng thư mục vừa giải nén — bên trong phải nhìn thấy tệp manifest.json.",
          "Ghim biểu tượng Cấp số PCT NKVH – PXVH1 lên thanh công cụ để dễ kiểm tra trạng thái đăng nhập.",
        ],
      },
      {
        title: "Đăng nhập và sử dụng",
        where: "duyenhai1.vn → đăng nhập · NKVH → mở PCT tại bước B1",
        points: [
          "Phải đăng nhập duyenhai1.vn trên cùng trình duyệt đang mở NKVH.",
          "Dưới ô Số phiếu sẽ xuất hiện khung Sổ PXVH1 và nút Lấy số PCT.",
          "Tiện ích tự ghi nhận Kết thúc phiếu trên sổ khi PCT T-C-N-H đã Khóa phiếu hoặc PCT Điện đã Hoàn thành; không cần chuyển đến bước cuối hay bấm đồng bộ.",
          "Ở trang danh sách NKVH, các dòng Khóa phiếu / Hoàn thành đang hiển thị cũng được tự đối chiếu và đồng bộ về sổ.",
        ],
      },
      {
        title: "Cập nhật bản mới",
        where: "Tải lại gói trên website → chrome://extensions hoặc edge://extensions",
        points: ["Giải nén đè vào thư mục cũ, sau đó bấm nút Tải lại (Reload) trên thẻ tiện ích."],
      },
    ],
    note: "Chrome và Edge không cho website tự cài tiện ích ngoài Store. Vì vậy, sau khi bấm tải vẫn cần giải nén và chọn Tải tiện ích đã giải nén một lần trên từng máy.",
  },
  {
    key: "internal",
    label: "PCT nội bộ",
    icon: Building2,
    intro: "Đơn vị nội bộ có thể cấp PCT điện tử trên NKVH hoặc PCT giấy trực tiếp trên sổ. Tiện ích chỉ dùng cho PCT điện tử và không tự bấm Lưu trên NKVH.",
    steps: [
      {
        title: "Chọn hình thức",
        where: "Cấp phiếu nội bộ → hộp chọn hình thức",
        points: [
          "Chọn PCT điện tử để lấy số và đồng bộ từ NKVH.",
          "Chọn PCT giấy để khai mẫu giấy, lấy số trực tiếp trên website và in phiếu.",
        ],
      },
      {
        title: "Mở phiếu NKVH",
        where: "NKVH → tạo PCT từ ĐKCT → mở phiếu ở bước B1",
        points: ["NKVH điền sẵn nội dung theo ĐKCT. Tiện ích chỉ lấy số khi phiếu đang ở bước B1 và thuộc PXVH1."],
      },
      {
        title: "Lấy số PCT",
        where: "Khung Sổ PXVH1 dưới ô Số phiếu → Lấy số PCT",
        points: [
          "Kiểm tra Tổ máy mà tiện ích nhận diện, chọn Cương vị, rồi bấm Lấy số & điền.",
          "Sổ PXVH1 cấp số tiếp theo của đúng sổ Cơ hoặc Điện, ghi phiếu vào sổ và điền số vào NKVH.",
          "Một phiếu NKVH chỉ nhận một số; bấm lại vẫn trả về đúng số đã cấp.",
          "Nếu NKVH đã có số dạng …/VH1-NĐDH nhưng sổ chưa có liên kết, bấm Đồng bộ số hiện có; hệ thống dùng đúng số đó và tự chặn mọi xung đột.",
        ],
      },
      {
        title: "Kiểm tra và lưu NKVH",
        where: "Trên phiếu NKVH",
        points: [
          "Kiểm tra số và nội dung, sau đó tự bấm Lưu trên NKVH. Tiện ích không bao giờ tự lưu.",
          "Không gõ tay số vào NKVH vì sổ PXVH1 sẽ không biết số đó đã được sử dụng.",
          "Nếu số sổ đưa ra đã có phiếu khác dùng trên NKVH và bạn sửa sang số khác, khung Sổ PXVH1 báo LỆCH SỐ: bấm Sửa sổ theo NKVH để sổ ghi đúng số đang có trong ô, hoặc Điền lại nếu gõ nhầm.",
        ],
      },
      {
        title: "Bổ sung hoặc đồng bộ",
        where: "NKVH bước B1 → Đồng bộ về sổ · hoặc Sổ PCT → mở dòng phiếu",
        points: [
          "Nếu sửa nội dung hoặc khai thêm CHTT, phạm vi… trên NKVH, bấm Đồng bộ về sổ.",
          "Phiếu thiếu CHTT, số nhân viên hoặc SYC sẽ có nhãn Cần bổ sung; có thể mở dòng phiếu trên sổ để khai đủ.",
        ],
      },
      {
        title: "Kết thúc trên NKVH",
        where: "PCT T-C-N-H: B5 Khóa phiếu · PCT Điện: B8 Hoàn thành phiếu",
        points: [
          "Tiện ích tự chuyển phiếu liên kết trên sổ thành Kết thúc phiếu khi nhận biết bước cuối đã hoàn thành, kể cả khi trang chi tiết đang mở ở B1.",
          "Nếu đang mở trang danh sách, tiện ích tự đối chiếu các dòng Khóa phiếu / Hoàn thành đang hiển thị. Gọi lại nhiều lần không tạo lịch sử trùng.",
          "Nếu tiện ích chưa hoạt động, có thể mở dòng phiếu trên sổ → Ghi nhận đóng phiếu để ghi thủ công.",
          "Phiếu gắn SYC đã xử lý đủ 24 giờ sẽ tự đóng trong sổ.",
        ],
      },
    ],
    note: "PCT nội bộ giấy và PCT nhà thầu giấy lấy số trực tiếp trên Sổ PCT. Ghi nhận đóng phiếu trên sổ KHÔNG đóng phiếu trên NKVH — thủ tục trên NKVH vẫn làm như thường lệ.",
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
        points: [
          "CHTT nhà thầu phải có sẵn trong tab Nhân sự nhà thầu (xem phần Danh mục dùng chung).",
          "Để cấp nhanh công việc tương tự: mở PCT giấy ở trạng thái Đã cấp hoặc Kết thúc phiếu, bấm Sao chép tạo PCT mới. Nội dung, nhân sự và biện pháp được giữ; số PCT, ĐKCT/SYC, thời gian và trạng thái được đặt lại.",
        ],
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
        points: ["Sau khi kết thúc lần làm việc cuối: chọn Kết thúc phiếu, ghi Kết quả công việc và thời điểm đóng."],
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
        title: "Chọn nhầm giấy / điện tử nội bộ",
        where: "Công tắc Nội bộ · PCT điện tử ⇄ Nội bộ · PCT giấy ở đầu biểu mẫu",
        points: [
          "Đổi hình thức trước khi lưu; nội dung đã nhập và số PCT đã lấy vẫn được giữ.",
          "PCT giấy mở thêm phần mẫu giấy và biện pháp an toàn; PCT điện tử dùng liên kết NKVH.",
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
        points: ["Ghi lý do hủy. Phiếu vẫn nằm trong sổ để đối chiếu và số được bỏ qua theo mặc định."],
      },
      {
        title: "Báo quản trị",
        where: "Chỉ tài khoản quản trị",
        points: [
          "Lấy nhầm sổ Cơ ↔ Điện: số không chuyển sổ được — quản trị dùng Hủy lượt để trả số.",
          "Phiếu test cần xoá hẳn: hủy phiếu trước, sau đó quản trị mở chi tiết → Xóa PCT đã hủy, ghi lý do và xác nhận xóa vĩnh viễn. Lịch sử cấp số vẫn được giữ.",
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
          "Bấm Thêm đơn vị, sau đó bấm Thêm nhân sự trên dòng của đơn vị: Họ tên, Số thẻ ra vào cổng, SĐT, đánh dấu CHTT.",
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
        points: [
          "Đặt số bắt đầu của từng sổ theo năm. Chưa đặt mốc thì chưa lấy được số PCT.",
          "Nếu số vừa hủy là số kế tiếp hợp lệ, quản trị có thể bấm Đặt lại để cấp số để đưa số đó vào lượt cấp tiếp theo; lịch sử phiếu hủy vẫn được giữ.",
        ],
      },
    ],
  },
];

export function PermitGuideButton() {
  const [open, setOpen] = useState(false);
  return <>
    {/* Điện thoại: ẩn nút Tiện ích (cài tiện ích trình duyệt NKVH chỉ làm trên máy tính). */}<Button variant="outline" size="sm" className="hidden h-9 text-xs md:inline-flex" onClick={() => setOpen(true)}><Puzzle />Tiện ích</Button>
    {open && <PermitGuideDialog onClose={() => setOpen(false)} />}
  </>;
}

function PermitGuideDialog({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(SECTIONS[0].key);
  const section = SECTIONS.find(item => item.key === active) ?? SECTIONS[0];
  return <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
    <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
      <div className="shrink-0 border-b border-border px-5 py-4 pr-12">
        <DialogTitle className="text-lg">Tiện ích và hướng dẫn cấp phiếu công tác</DialogTitle>
        <DialogDescription className="mt-1 text-[13px]">Cài tiện ích NKVH tại mục đầu tiên; các mục còn lại hướng dẫn đúng theo thao tác thực tế trên màn hình.</DialogDescription>
        <div className="mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Tiện ích và hướng dẫn">
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
        {section.key === "extension" && <Button asChild className="w-full sm:w-auto">
          <a href="/api/work-permits/nkvh-extension" download>
            <Download className="h-4 w-4" />Tải tiện ích Cấp số PCT NKVH
          </a>
        </Button>}
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
