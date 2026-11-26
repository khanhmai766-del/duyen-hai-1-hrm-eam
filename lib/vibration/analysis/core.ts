/* eslint-disable @typescript-eslint/no-explicit-any */
// LÕI TÍNH TOÁN phân tích rung. Port 1:1 từ vibracontrol/vibration-core.js (window.VC). Không sửa số ở đây:
// ngưỡng lấy từ VIBRATION_STANDARDS (standards-data.ts). Đơn vị: v mm/s RMS · d_pp pk-pk · d_rms µm RMS · f Hz · n v/p.
import { VIBRATION_STANDARDS } from "./standards-data";

export const SQRT2 = Math.SQRT2;
export const MM_PER_IN = 25.4;
export const SAI_SO_DO = 0.1;
export const ZONES = ["A", "B", "C", "D"] as const;
// vibration-core.js: TC
export const TC: Record<string, any> = Object.fromEntries((VIBRATION_STANDARDS.tieu_chuan || []).map((t: any) => [t.id, t]));

// 1. Quy đổi (vibration-core.js §1)
export const peakSangRms = (x: number) => x / SQRT2;
export const rmsSangPeak = (x: number) => x * SQRT2;
export const rmsSangPkpk = (x: number) => x * 2 * SQRT2;
export const pkpkSangRms = (x: number) => x / (2 * SQRT2);
export const inSPkSangMmSRms = (v: number) => (v * MM_PER_IN) / SQRT2;
export const mmSRmsSangInSPk = (v: number) => (v * SQRT2) / MM_PER_IN;
export const dichChuyenPkpkUmTuVanToc = (v: number, f: number) => ((SQRT2 * v) / (Math.PI * f)) * 1000;
export const vanTocRmsTuDichChuyen = (dUm: number, f: number) => (Math.PI * f * (dUm / 1000)) / SQRT2;
export const tanSoTuongDuong = (v: number | null | undefined, dMm: number | null | undefined): number | null =>
  v == null || dMm == null || v <= 0 || dMm <= 0 ? null : (SQRT2 * v) / (Math.PI * dMm);

// 2. Chất lượng số liệu
export function chonDonViBienDo(v: number | null, d: number | null, f1x?: number | null): "um" | "mm" | "khong_ro" {
  if (!v || !d || v <= 0 || d <= 0) return "khong_ro";
  const [lo, hi] = f1x ? [0.5 * f1x, 20 * f1x] : [2, 1000];
  const fUm = tanSoTuongDuong(v, d / 1000) as number;
  const fMm = tanSoTuongDuong(v, d) as number;
  const okUm = lo <= fUm && fUm <= hi;
  const okMm = lo <= fMm && fMm <= hi;
  return okUm && !okMm ? "um" : okMm && !okUm ? "mm" : "khong_ro";
}
export function nghiDaoCot(v: number | null, d: number | null, f1x?: number | null): boolean {
  if (!v || !d || v <= 0 || d <= 0) return false;
  const [lo, hi] = f1x ? [0.5 * f1x, 20 * f1x] : [2, 1000];
  const hopLy = (a: number, b: number) =>
    [b / 1000, b].some((dd) => {
      const f = tanSoTuongDuong(a, dd) as number;
      return lo <= f && f <= hi;
    });
  return !hopLy(v, d) && hopLy(d, v);
}

// 3. Công cụ vùng — giá trị BẰNG ranh giới thuộc vùng dưới
export const vungTheoRanhGioi = (x: number, ab: number, bc: number, cd: number) => (x <= ab ? "A" : x <= bc ? "B" : x <= cd ? "C" : "D");
export const satRanhGioi = (x: number, rg: Record<string, number>, tol = SAI_SO_DO): string[] =>
  Object.entries(rg).filter(([, b]) => b && Math.abs(x - b) <= tol * b).map(([k]) => k);
export const khatKheHon = (z1: string | null, z2: string | null): string | null => {
  const zs = [z1, z2].filter(Boolean) as string[];
  return zs.length ? zs.reduce((a, b) => ((ZONES as readonly string[]).indexOf(b) > (ZONES as readonly string[]).indexOf(a) ? b : a)) : null;
};
function dong(bang: any[], khoa: Record<string, any>) {
  const d = bang.find((r) => Object.entries(khoa).every(([k, v]) => String(r[k]) === String(v)));
  if (!d) throw Error("Không có dòng " + JSON.stringify(khoa));
  return d;
}
const rgOf = (d: any) => ({ "A/B": d["A/B"], "B/C": d["B/C"], "C/D": d["C/D"] });
const vmax = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x) => x != null) as number[];
  return v.length ? Math.max(...v) : null;
};

// 4. ISO 20816-3 (Criterion I)
export function danhGiaIso20816_3(tc: any, nhom: any, giaDo: any, vanToc: number[], dichChuyenRmsUm: number[] = []) {
  const dv = dong(tc.bang_van_toc, { nhom, gia_do: giaDo });
  const v = vmax(vanToc);
  const zv = v != null ? vungTheoRanhGioi(v, dv["A/B"], dv["B/C"], dv["C/D"]) : null;
  const ds = vmax(dichChuyenRmsUm);
  let zd: string | null = null;
  if (ds != null) {
    const dd = dong(tc.bang_dich_chuyen_rms_um, { nhom, gia_do: giaDo });
    zd = vungTheoRanhGioi(ds, dd["A/B"], dd["B/C"], dd["C/D"]);
  }
  const rg = rgOf(dv);
  return { tieu_chuan: tc.id, nhom, gia_do: giaDo, v_max: v, vung_van_toc: zv, vung_dich_chuyen: zd, vung: khatKheHon(zv, zd), sat_ranh_gioi: v != null ? satRanhGioi(v, rg) : [], ranh_gioi: rg } as any;
}
export function gioiHanTrucIso20816_3(tc: any, n: number) {
  const K = tc.rung_truc_tuong_doi_pkpk_um.K;
  return Object.fromEntries(["A/B", "B/C", "C/D"].map((k) => [k, K[k] / Math.sqrt(n)]));
}
export const nhomIso20816_3 = (P: number, H: number | null = null) => (P > 300 || (H != null && H >= 315) ? "1" : "2");

// 5. ISO 10816-7 bơm
export function danhGiaBomIso10816_7(tc: any, loai: string, P: number, vanToc: number[]) {
  const cs = P <= 200 ? "<=200" : ">200";
  const d = dong(tc.bang_van_toc, { loai, cong_suat: cs });
  const v = vmax(vanToc) as number;
  const rg = rgOf(d);
  return { tieu_chuan: tc.id, loai, cong_suat: cs, v_max: v, vung: vungTheoRanhGioi(v, d["A/B"], d["B/C"], d["C/D"]), sat_ranh_gioi: satRanhGioi(v, rg), ranh_gioi: rg } as any;
}

// 6. Quạt ISO 14694 / AMCA 204
export const MUC_QUAT = ["duoi_khoi_dong", "khoi_dong_den_canh_bao", "canh_bao_den_dung", "vuot_dung"] as const;
export function hangBvQuat(tc: any, P: number, ungDung = "cong_nghiep_va_phat_dien"): string {
  for (const d of tc.hang_ung_dung) {
    if (d.ung_dung !== ungDung) continue;
    const cs = d.cong_suat_kw;
    if (cs === "all") return d.bv;
    if (cs.startsWith("<=") && P <= Number(cs.slice(2))) return d.bv;
    if (cs.startsWith(">") && P > Number(cs.slice(1))) return d.bv;
  }
  throw Error("Không xác định được hạng BV");
}
export function danhGiaQuatBv(tc: any, bv: string, giaDo: any, vanToc: number[]) {
  const d = dong(tc.bang_tai_cho_rms, { bv, gia_do: giaDo });
  const v = vmax(vanToc) as number;
  const muc = v <= d.khoi_dong ? MUC_QUAT[0] : v <= d.canh_bao ? MUC_QUAT[1] : v <= d.dung ? MUC_QUAT[2] : MUC_QUAT[3];
  const rg = { khoi_dong: d.khoi_dong, canh_bao: d.canh_bao, dung: d.dung };
  return { tieu_chuan: tc.id, bv, gia_do: giaDo, v_max: v, muc, sat_ranh_gioi: satRanhGioi(v, rg), ranh_gioi: rg } as any;
}

// 7. ISO 20816-2 tuabin – máy phát
export function danhGiaIso20816_2ThanO(tc: any, n: number, vanToc: number[]) {
  for (const d of tc.bang_than_o_van_toc)
    if (d.toc_do_vpm.includes(n)) {
      const v = Math.max(...vanToc);
      const rg = rgOf(d);
      return { tieu_chuan: tc.id, v_max: v, vung: vungTheoRanhGioi(v, d["A/B"], d["B/C"], d["C/D"]), sat_ranh_gioi: satRanhGioi(v, rg), ranh_gioi: rg } as any;
    }
  throw new RangeError("ISO 20816-2 chỉ áp dụng cho 1500/1800/3000/3600 v/p");
}

// 9. Tiêu chí II, ALARM, TRIP (ISO 10816-3 §5.2, §5.3)
export function tieuChiII(nen: number, hienTai: number, coSo: number, tyLe = 0.25) {
  const delta = hienTai - nen;
  const nguong = tyLe * coSo;
  return { delta, nguong, dang_ke: Math.abs(delta) > nguong };
}
export const datAlarm = (nen: number, bc: number, cong = 0.25, tran = 1.25) => Math.min(nen + cong * bc, tran * bc);
export const tranTrip = (cd: number, tran = 1.25) => tran * cd;
export const tySoWowk = (nen: number, hienTai: number) => {
  if (nen <= 0) return "khong_tinh_duoc";
  const r = hienTai / nen;
  return r >= 5 ? "nghiem_trong_5x" : r >= 2 ? "dang_ke_2x" : "duoi_2x";
};

// 10. Biểu đồ Machine Dynamics 1989
export const TEN_VUNG_MD = ["GOOD", "ACCEPTABLE", "TOLERABLE", "EXCESSIVE", "EXTREMELY ROUGH"] as const;
export function vungBieuDoMd(tc: any, f: number, vInSPk: number): string {
  let n = 0;
  for (const rg of tc.ranh_gioi) {
    const b = rg.V * Math.min(f / rg.f_dau, 1, rg.f_cuoi / f);
    if (vInSPk > b) n++;
  }
  return TEN_VUNG_MD[n];
}

// 13. Chọn tiêu chuẩn (HD 24)
export function chonTieuChuan(tb: any) {
  const loai = tb.loai;
  const P = tb.cong_suat_kw || 0;
  const n = tb.toc_do_vpm || 0;
  const out: { chinh: string | null; tham_chieu: string[]; ghi_chu: string[] } = { chinh: null, tham_chieu: [], ghi_chu: [] };
  if (n && n < 120) { out.ghi_chu.push("Tốc độ < 120 v/p: ngoài dải ISO 20816-3 — dùng xu hướng/dịch chuyển/ngưỡng SCCN"); return out; }
  if (n > 30000) { out.ghi_chu.push("Tốc độ > 30 000 v/p: ngoài dải ISO 20816-3 — cần tiêu chuẩn hoặc giới hạn nhà chế tạo"); return out; }
  if (["may_nen_truc_vit", "may_thoi_roots"].includes(loai)) { out.ghi_chu.push("Máy nén/thổi thể tích quay: ngoài phạm vi ISO 20816-3 — khuyến cáo nhà chế tạo + xu hướng"); return out; }
  if (loai === "dong_co" && tb.thu_tai_xuong) { out.chinh = "IEC_60034_14_2018"; return out; }
  if (["tuabin_hoi", "may_phat"].includes(loai) && P > 40000 && [1500, 1800, 3000, 3600].includes(n)) { out.chinh = "ISO_20816_2_2017"; out.ghi_chu.push("Ngưỡng TSI của nhà chế tạo luôn ưu tiên"); return out; }
  if (loai === "bom") {
    const kieu = tb.kieu_bom || "canh_dong";
    if (["bun", "chim", "the_tich"].includes(kieu)) { out.ghi_chu.push("Bơm " + kieu + ": ngoài phạm vi ISO 10816-7 — dùng xu hướng (tiêu chí II)"); return out; }
    out.chinh = "ISO_10816_7_2009";
    out.ghi_chu.push("Động cơ rời của bơm đánh giá riêng theo ISO 20816-3");
    return out;
  }
  if (loai === "quat") {
    if (P > 300) { out.chinh = "ISO_20816_3_2022"; out.tham_chieu.push("ISO_14694_2003_AMCA_204_20"); out.ghi_chu.push("Quạt > 300 kW: ISO 20816-3 Nhóm 1"); }
    else if (tb.gia_do === "mem") { out.chinh = "ISO_14694_2003_AMCA_204_20"; out.ghi_chu.push("Quạt ≤ 300 kW trên gối đàn hồi: ngoài ISO 20816-3 (R1 §1 Chú thích 3) — ISO 14694 BV-3"); }
    else { out.chinh = "ISO_20816_3_2022"; out.tham_chieu.push("ISO_14694_2003_AMCA_204_20"); out.ghi_chu.push("Quạt ≤ 300 kW không đặt trên gối đàn hồi: ISO 20816-3 Nhóm 2 (R1 §1 Chú thích 3); tham chiếu ISO 14694 BV-3" + (tb.gia_do === "cung" ? "" : " — chưa xác định bệ: nếu là gối đàn hồi thì dùng ISO 14694")); }
    return out;
  }
  if (P > 15) { out.chinh = "ISO_20816_3_2022"; if (loai === "hop_so") out.tham_chieu.push("ISO 20816-9:2020 (nghiệm thu hộp số — chưa có bảng số)"); return out; }
  out.ghi_chu.push("≤ 15 kW: ngoài ISO 20816-3 — xu hướng + Wowk Bảng 1");
  return out;
}

// 14. Quy tắc bổ sung theo bản gốc ISO 20816-3:2022
export function apDungDichChuyen(tc: any, nhom: string, n: number | null | undefined, fTd: number | null | undefined): boolean {
  const q = tc.quy_tac.dich_chuyen_ap_dung;
  if (n && n < q.toc_do_duoi_vpm) return true;
  return fTd != null && fTd < q.tan_so_gia_dinh_Hz[nhom];
}
export function rungNen(vDung: number, vChay: number, bc: number, tyLe = 0.25) {
  const nguong = Math.min(tyLe * vChay, tyLe * bc);
  return { nguong, dang_ke: vDung > nguong };
}
export const nghiemThu = (v: number, ab: number, heSo = 1.25) => ({ gioi_han: heSo * ab, dat: v <= heSo * ab });

export const VC_META = { schema: VIBRATION_STANDARDS.schema_version as string, ngay: VIBRATION_STANDARDS.ngay_cap_nhat as string };
