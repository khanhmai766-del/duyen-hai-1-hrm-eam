/**
 * Nhân bản DÒNG KHAI BÁO thiết bị (`isActive = false`) từ một vật tư sang một vật tư khác.
 *
 * Dùng khi hai vật tư THAY THẾ LẪN NHAU được (ví dụ hai loại dầu hộp số cùng cấp ISO VG 220)
 * và cần khai báo cùng một tập thiết bị, thay vì gõ tay hàng trăm dòng.
 *
 *   npx tsx scripts/clone-replacement-declarations.ts --from "Dầu Shell Omala S2 GX220" --to "Dầu Sinopec L-CKD 220" --by khanhmdk@tpcduyenhai.com.vn
 *   ... thêm --commit để GHI THẬT (mặc định chỉ chạy khô, không đụng dữ liệu)
 *
 * ─── Chỉ chép DÒNG KHAI BÁO ──────────────────────────────────────────────────
 * `MaterialReplacement` mang hai vai trò phân biệt bằng `isActive`:
 *   • isActive = false → DÒNG KHAI BÁO: "thiết bị này dùng vật tư này, mỗi lần X lít,
 *     chu kỳ Y tháng". Là nguồn của bảng "Chi tiết điểm thay thế" và của tổng nhu cầu
 *     một chu kỳ dùng cho dự toán năm.
 *   • isActive = true  → ĐIỂM THEO DÕI đang chạy, có ngày đến hạn và sinh cảnh báo.
 *
 * Script này CỐ Ý chỉ chép loại thứ nhất. Chép cả điểm theo dõi sẽ làm mỗi thiết bị có hai
 * đồng hồ đếm cho cùng một lần thay — hai cảnh báo đến hạn, dự toán cộng đôi, dễ ra SYC
 * trùng. Việc bật theo dõi để người dùng tự quyết trên giao diện khi thực sự châm loại dầu
 * này cho thiết bị nào.
 *
 * ─── Ghép theo TỔ MÁY ────────────────────────────────────────────────────────
 * `Material` khoá duy nhất theo `(code, machine)` nên mỗi tên vật tư có tối đa ba bản:
 * S1, S2, COMMON. Script ghép nguồn↔đích theo đúng `machine`, không trộn — vì `deviceSeq`
 * của mỗi tổ máy nằm ở nhánh cây riêng (S1/S2 → nhánh 1,2,3,7; COMMON → 5,6) và API tạo
 * điểm sẽ từ chối seq lệch tổ máy (`assertSeqsInScope`).
 *
 * ─── Chạy lại được ───────────────────────────────────────────────────────────
 * Bỏ qua dòng mà đích ĐÃ có khai báo cho cùng thiết bị (hoặc cùng hệ thống + vị trí khi
 * dòng không gắn thiết bị). Chạy lần hai không tạo bản sao.
 */
import { PrismaClient } from "@prisma/client";
import { positionCodeOf } from "../lib/position-catalog";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const arg = (ten: string, mac_dinh: string | null = null) => {
  const i = argv.indexOf(`--${ten}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : mac_dinh;
};
const co = (ten: string) => argv.includes(`--${ten}`);

const TEN_NGUON = arg("from");
const TEN_DICH = arg("to");
const EMAIL_NGUOI_TAO = arg("by");
const GHI_THAT = co("commit");

/** Cùng công thức với luồng nhập Excel (app/api/materials/import-replacements): ngày đến hạn
 *  của DÒNG KHAI BÁO tính lại từ hôm nay, không chép từ dòng nguồn. Dòng khai báo không
 *  theo dõi lịch nên giá trị này chỉ là chỗ giữ chân cho cột NOT NULL. */
function addMonths(base: Date, months: number) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

async function main() {
  if (!TEN_NGUON || !TEN_DICH || !EMAIL_NGUOI_TAO) {
    console.error("Thiếu đối số. Ví dụ:");
    console.error('  npx tsx scripts/clone-replacement-declarations.ts \\');
    console.error('    --from "Dầu Shell Omala S2 GX220" --to "Dầu Sinopec L-CKD 220" \\');
    console.error("    --by khanhmdk@tpcduyenhai.com.vn [--commit]");
    process.exit(1);
  }

  const nguoiTao = await prisma.user.findUnique({
    where: { email: EMAIL_NGUOI_TAO },
    select: { id: true, name: true },
  });
  if (!nguoiTao) {
    console.error(`Không tìm thấy tài khoản ${EMAIL_NGUOI_TAO}`);
    process.exit(1);
  }

  const [nguon, dich] = await Promise.all([
    prisma.material.findMany({
      where: { name: TEN_NGUON },
      select: { id: true, name: true, machine: true, unit: true },
    }),
    prisma.material.findMany({
      where: { name: TEN_DICH },
      select: { id: true, name: true, machine: true, unit: true },
    }),
  ]);

  if (!nguon.length) {
    console.error(`Không tìm thấy vật tư nguồn: ${TEN_NGUON}`);
    process.exit(1);
  }
  if (!dich.length) {
    console.error(`Không tìm thấy vật tư đích: ${TEN_DICH}`);
    process.exit(1);
  }

  const dichTheoMay = new Map(dich.map((m) => [m.machine, m]));

  console.log(`\n${"=".repeat(78)}`);
  console.log(`NHÂN BẢN DÒNG KHAI BÁO   ${TEN_NGUON}  →  ${TEN_DICH}`);
  console.log(`Người tạo: ${nguoiTao.name}   Chế độ: ${GHI_THAT ? "GHI THẬT (--commit)" : "CHẠY KHÔ"}`);
  console.log("=".repeat(78));

  let tongTao = 0;
  let tongBoQua = 0;
  const thieuDich: string[] = [];

  for (const src of nguon.sort((a, b) => a.machine.localeCompare(b.machine))) {
    const tgt = dichTheoMay.get(src.machine);
    if (!tgt) {
      thieuDich.push(src.machine);
      console.log(`\n### Tổ máy ${src.machine}: BỎ QUA — vật tư đích chưa có bản cho tổ máy này`);
      continue;
    }
    if (src.unit !== tgt.unit) {
      console.log(`\n### Tổ máy ${src.machine}: BỎ QUA — lệch ĐVT (${src.unit} vs ${tgt.unit}), số lượng sẽ sai nghĩa`);
      continue;
    }

    const khaiBao = await prisma.materialReplacement.findMany({
      where: { materialId: src.id, isActive: false },
      orderBy: [{ system: "asc" }, { location: "asc" }],
    });

    // Khai báo ĐÃ CÓ ở đích — khoá theo thiết bị, hoặc theo hệ thống+vị trí khi không gắn thiết bị.
    const daCo = await prisma.materialReplacement.findMany({
      where: { materialId: tgt.id, isActive: false },
      select: { deviceSeq: true, system: true, location: true },
    });
    const khoaDaCo = new Set(
      daCo.map((r) =>
        r.deviceSeq ? `device:${r.deviceSeq}` : `sys:${r.system ?? ""}|loc:${r.location ?? ""}`
      )
    );

    const canTao = khaiBao.filter((r) => {
      const khoa = r.deviceSeq ? `device:${r.deviceSeq}` : `sys:${r.system ?? ""}|loc:${r.location ?? ""}`;
      return !khoaDaCo.has(khoa);
    });
    const boQua = khaiBao.length - canTao.length;
    tongBoQua += boQua;

    console.log(
      `\n### Tổ máy ${src.machine}: nguồn ${khaiBao.length} dòng khai báo → tạo ${canTao.length}` +
        (boQua ? `, bỏ qua ${boQua} (đích đã có)` : "")
    );
    for (const r of canTao.slice(0, 5)) {
      console.log(
        `    ▸ ${(r.deviceSeq ?? "—").padEnd(22)} ${(r.system ?? "").slice(0, 30).padEnd(30)} ` +
          `${r.quantity}×${r.deviceCount} ${src.unit} · ${r.intervalMonths} tháng · ${r.managingPosition ?? "—"}`
      );
    }
    if (canTao.length > 5) console.log(`    … và ${canTao.length - 5} dòng nữa`);

    if (GHI_THAT && canTao.length) {
      const now = new Date();
      await prisma.$transaction(
        canTao.map((r) =>
          prisma.materialReplacement.create({
            data: {
              materialId: tgt.id,
              deviceSeq: r.deviceSeq,
              machine: tgt.machine,
              system: r.system,
              location: r.location,
              quantity: r.quantity,
              deviceCount: r.deviceCount,
              managingPosition: r.managingPosition,
              // Tính lại từ nhãn thay vì chép mã cũ: danh mục cương vị có thể đã đổi mã
              // kể từ lúc dòng nguồn được tạo.
              managingPositionCode: r.managingPosition ? positionCodeOf(r.managingPosition) : null,
              intervalMonths: r.intervalMonths,
              intervalNote: r.intervalNote,
              samplingOnly: r.samplingOnly,
              recoveryOnSupplement: r.recoveryOnSupplement,
              note: r.note,
              isActive: false,
              // Không chép `lastReplacedAt` / `renewalAppliedAt`: lịch sử thay thế thuộc về
              // vật tư nguồn, dòng khai báo mới chưa từng được thay lần nào.
              nextDueAt: addMonths(now, r.intervalMonths),
              createdById: nguoiTao.id,
            },
          })
        )
      );
    }
    tongTao += canTao.length;
  }

  console.log(`\n${"=".repeat(78)}`);
  if (GHI_THAT) {
    console.log(`ĐÃ TẠO ${tongTao} dòng khai báo${tongBoQua ? `, bỏ qua ${tongBoQua} dòng đã có` : ""}.`);
  } else {
    console.log(`SẼ TẠO ${tongTao} dòng khai báo${tongBoQua ? `, bỏ qua ${tongBoQua} dòng đã có` : ""}.`);
    console.log("Chạy khô — chưa ghi gì. Thêm --commit để ghi thật.");
  }
  if (thieuDich.length) {
    console.log(`⚠ Vật tư đích thiếu bản cho tổ máy: ${thieuDich.join(", ")} — tạo trước rồi chạy lại.`);
  }
  console.log("Điểm THEO DÕI không được tạo — bật trên giao diện khi thực sự dùng loại vật tư này.");
  console.log("=".repeat(78) + "\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
