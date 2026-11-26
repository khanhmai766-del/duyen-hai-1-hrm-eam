// Bảng ngưỡng tiêu chuẩn rung — chép nguyên từ vibracontrol/data/nguong_tieu_chuan_rung.json (+ vibration-standards.js). Không sửa số tay; mỗi số có nguồn.
// Port: data/nguong_tieu_chuan_rung.json -> window.VIBRATION_STANDARDS
/* eslint-disable @typescript-eslint/no-explicit-any */
export const VIBRATION_STANDARDS: { schema_version: string; ngay_cap_nhat: string; tieu_chuan: any[]; [k: string]: any } = {
 "schema_version": "1.2",
 "ngay_cap_nhat": "2026-09-29",
 "mo_ta": "Bảng ngưỡng rung máy đọc được cho phần mềm phân tích rung NMNĐ Duyên Hải 1. Mọi con số có trường 'nguon' trỏ tới mã nguồn trong HUONG_DAN_AI_PHAN_TICH_RUNG_DONG.md (bảng 22.3). Không sửa số ở đây mà không cập nhật nguồn.",
 "quy_uoc": {
  "van_toc": "mm/s RMS, tổng dải 10–1000 Hz (máy ≤ 600 v/p: 2–1000 Hz)",
  "dich_chuyen_than_o": "µm RMS (ISO 10816-3/20816-3 Phụ lục A) — số đo cầm tay thường là pk-pk, phải chia 2√2 trước khi so",
  "dich_chuyen_truc": "µm pk-pk (ISO 7919 / 20816-2 / 20816-3 Phụ lục B)",
  "sai_so_do_tuong_doi": 0.1,
  "sai_so_do_nguon": "R21 mục 8.1.1; R22 Bảng 1 ghi chú 1",
  "vung_sat_ranh_gioi": "giá trị nằm trong ± sai_so_do_tuong_doi quanh một ranh giới → gắn cờ 'sat_ranh_gioi'"
 },
 "tieu_chuan": [
  {
   "id": "ISO_20816_3_2022",
   "ten": "ISO 20816-3:2022 — Industrial machinery > 15 kW, 120–30 000 r/min",
   "thay_the": [
    "ISO 10816-3:2009",
    "ISO 7919-3:2009"
   ],
   "ghi_chu_phien_ban": "Thay thế ISO 10816-3:2009(+Amd1:2017) và ISO 7919-3:2009(+Amd1:2017). ISO/FDIS 20816-3 (lần 2) đang bỏ phiếu — chưa dùng số liệu FDIS.",
   "nguon": "R1 — bản gốc ISO 20816-3:2022 (PXVH1 đã mua): Phụ lục A Bảng A.1, A.2; §4.6; §5.2; §5.3; §6.2.3; §6.3; §6.4 Bảng 1; §6.5; Phụ lục B, C, D",
   "pham_vi": {
    "cong_suat_kw_min": 15,
    "toc_do_vpm_min": 120,
    "toc_do_vpm_max": 30000,
    "tuabin_hoi_mw_max": 40,
    "quat": "R1 §1 Chú thích 3: áp dụng cho quạt > 300 kW hoặc quạt KHÔNG đặt trên gối đàn hồi; quạt khác tham khảo ISO 14694",
    "loai_tru": [
     "bơm cánh động (ISO 10816-7)",
     "máy nén thể tích quay (trục vít, Roots)",
     "máy piston",
     "bơm chìm",
     "tuabin gió",
     "tổ máy thuỷ điện",
     "tuabin/máy phát > 40 MW ở 1500/1800/3000/3600 v/p (ISO 20816-2)"
    ]
   },
   "nhom": {
    "1": "> 300 kW; máy điện H ≥ 315 mm",
    "2": "15–300 kW; máy điện 160 ≤ H < 315 mm"
   },
   "bang_van_toc": [
    {
     "nhom": "1",
     "gia_do": "cung",
     "A/B": 2.3,
     "B/C": 4.5,
     "C/D": 7.1
    },
    {
     "nhom": "1",
     "gia_do": "mem",
     "A/B": 3.5,
     "B/C": 7.1,
     "C/D": 11
    },
    {
     "nhom": "2",
     "gia_do": "cung",
     "A/B": 1.4,
     "B/C": 2.8,
     "C/D": 4.5
    },
    {
     "nhom": "2",
     "gia_do": "mem",
     "A/B": 2.3,
     "B/C": 4.5,
     "C/D": 7.1
    }
   ],
   "bang_dich_chuyen_rms_um": [
    {
     "nhom": "1",
     "gia_do": "cung",
     "A/B": 29,
     "B/C": 57,
     "C/D": 90
    },
    {
     "nhom": "1",
     "gia_do": "mem",
     "A/B": 45,
     "B/C": 90,
     "C/D": 140
    },
    {
     "nhom": "2",
     "gia_do": "cung",
     "A/B": 22,
     "B/C": 45,
     "C/D": 71
    },
    {
     "nhom": "2",
     "gia_do": "mem",
     "A/B": 37,
     "B/C": 71,
     "C/D": 113
    }
   ],
   "rung_truc_tuong_doi_pkpk_um": {
    "cong_thuc": "S = K / sqrt(n_max_vpm)",
    "K": {
     "A/B": 4800,
     "B/C": 9000,
     "C/D": 13200
    },
    "nguon": "ISO 7919-3 (đối chiếu biểu đồ Vibsens R23); R1 Phụ lục B"
   },
   "quy_tac": {
    "lay_max_hai_phuong_huong_kinh": true,
    "van_toc_va_dich_chuyen_lay_vung_khat_khe_hon": true,
    "doc_truc_chi_ap_cho_goi_chan": true,
    "tieu_chi_II_ty_le": 0.25,
    "tieu_chi_II_co_so": "B/C",
    "alarm": {
     "cong_them_ty_le": 0.25,
     "co_so": "B/C",
     "tran_he_so": 1.25,
     "tran_co_so": "B/C"
    },
    "trip": {
     "tran_he_so": 1.25,
     "tran_co_so": "C/D"
    },
    "nghiem_thu_may_moi_tran_he_so": 1.25,
    "nghiem_thu_co_so": "A/B",
    "qua_do": [
     {
      "toc_do_ty_le": "<0.2",
      "than_o": null,
      "truc_he_so_C/D": 1.5
     },
     {
      "toc_do_ty_le": "0.2-0.9",
      "than_o_he_so_C/D": 1,
      "truc_he_so_C/D": 1.5
     },
     {
      "toc_do_ty_le": ">0.9",
      "than_o_he_so_C/D": 1,
      "truc_he_so_C/D": 1
     }
    ],
    "dich_chuyen_ap_dung": {
     "toc_do_duoi_vpm": 600,
     "tan_so_gia_dinh_Hz": {
      "1": 12.5,
      "2": 10
     },
     "nguon": "R1 Phụ lục A: phổ có thành phần tần số thấp → đánh giá cả vận tốc và dịch chuyển; bảng dịch chuyển chủ yếu cho máy < 600 v/p"
    },
    "rung_nen": {
     "ty_le": 0.25,
     "quy_tac": "min(ty_le × rung khi chạy, ty_le × B/C)",
     "nguon": "R1 §4.6"
    },
    "be_theo_phuong": {
     "cung_khi_tan_so_rieng_toi_thieu_he_so": 1.25,
     "nguon": "R1 §5.3 — xét theo từng phương đo"
    },
    "tieu_chi_II_theo": "cùng vị trí và cùng phương cảm biến, điều kiện vận hành xấp xỉ (R1 §6.3)",
    "nghiem_thu_sau_sua": "≤ 1,25 × A/B; xét phạm vi công việc và rung trước khi sửa (R1 §6.2.3)",
    "khe_ho_bac_phu_luc_C": {
     "A/B": 0.4,
     "B/C": 0.6,
     "C/D": 0.7,
     "ghi_chu": "hệ số minh hoạ, áp khi C/D > khe hở đường kính, đo sát màng dầu"
    }
   },
   "doi_chieu_ban_goc": "2026-09-28 — ranh giới vận tốc và dịch chuyển Bảng A.1/A.2 khớp bản gốc",
   "bang_dich_chuyen_ghi_chu": "Dịch chuyển RMS tính từ vận tốc với tần số trội giả định 12,5 Hz (Nhóm 1), 10 Hz (Nhóm 2); là giới hạn trên (R1 Phụ lục A)"
  },
  {
   "id": "ISO_10816_7_2009",
   "ten": "ISO 10816-7:2009 — Rotodynamic pumps for industrial applications",
   "nguon": "R5 mục 1.5 (Europump); R2",
   "pham_vi": {
    "cong_suat_kw_min": 1,
    "loai_tru": [
     "bơm thể tích",
     "bơm bùn / xử lý chất rắn",
     "bơm chìm",
     "bơm thuỷ điện > 1 MW"
    ],
    "ghi_chu": "không phân biệt móng cứng/mềm; bơm liền trục áp cho cả cụm; động cơ rời theo ISO 20816-3"
   },
   "loai": {
    "I": "độ tin cậy cao — nhà máy điện, dầu khí, hoá chất",
    "II": "ứng dụng chung"
   },
   "bang_van_toc": [
    {
     "loai": "I",
     "cong_suat": "<=200",
     "A/B": 2.5,
     "B/C": 4,
     "C/D": 6.6,
     "nghiem_thu_POR": 2.5,
     "nghiem_thu_AOR": 3.4
    },
    {
     "loai": "I",
     "cong_suat": ">200",
     "A/B": 3.5,
     "B/C": 5,
     "C/D": 7.6,
     "nghiem_thu_POR": 3.5,
     "nghiem_thu_AOR": 4.4
    },
    {
     "loai": "II",
     "cong_suat": "<=200",
     "A/B": 3.2,
     "B/C": 5.1,
     "C/D": 8.5,
     "nghiem_thu_POR": 3.2,
     "nghiem_thu_AOR": 4.2
    },
    {
     "loai": "II",
     "cong_suat": ">200",
     "A/B": 4.2,
     "B/C": 6.1,
     "C/D": 9.5,
     "nghiem_thu_POR": 4.2,
     "nghiem_thu_AOR": 5.2
    }
   ],
   "quy_tac": {
    "tieu_chi_II_ty_le": 0.25,
    "tieu_chi_II_co_so": "B/C",
    "alarm": {
     "tran_he_so": 1.25,
     "tran_co_so": "B/C"
    },
    "trip": {
     "tran_he_so": 1.25,
     "tran_co_so": "C/D"
    },
    "tre_bao_dong_giay": 10
   }
  },
  {
   "id": "ISO_14694_2003_AMCA_204_20",
   "ten": "ISO 14694:2003 / ANSI/AMCA 204-20 — Fans: balance quality and vibration levels",
   "nguon": "R21 Bảng 6.1, 7.1, 8.1, 8.3; R25 mục 1, định nghĩa 3.13, 3.24",
   "ghi_chu_nguon": "Giá trị lấy từ cột RMS Bảng 8.3 AMCA 204-20 (công khai). Chưa đối chiếu bảng tại chỗ trong bản ISO 14694 gốc.",
   "pham_vi": {
    "cong_suat_kw_max": 300,
    "ghi_chu": "quạt > 300 kW dùng ISO 20816-3; đo tại chỗ là tổng dải (filter-out) ≥ 10–1000 Hz"
   },
   "hang_ung_dung": [
    {
     "ung_dung": "cong_nghiep_va_phat_dien",
     "cong_suat_kw": "<=298",
     "bv": "BV-3",
     "G": 6.3
    },
    {
     "ung_dung": "cong_nghiep_va_phat_dien",
     "cong_suat_kw": ">298",
     "bv": "BV-4",
     "G": 2.5
    },
    {
     "ung_dung": "hoa_dau",
     "cong_suat_kw": "<=37",
     "bv": "BV-3",
     "G": 6.3
    },
    {
     "ung_dung": "hoa_dau",
     "cong_suat_kw": ">37",
     "bv": "BV-4",
     "G": 2.5
    },
    {
     "ung_dung": "phong_sach",
     "cong_suat_kw": "all",
     "bv": "BV-5",
     "G": 1
    }
   ],
   "bang_tai_cho_rms": [
    {
     "bv": "BV-3",
     "gia_do": "cung",
     "khoi_dong": 4.5,
     "canh_bao": 7.1,
     "dung": 9
    },
    {
     "bv": "BV-3",
     "gia_do": "mem",
     "khoi_dong": 6.3,
     "canh_bao": 11.8,
     "dung": 12.5
    },
    {
     "bv": "BV-4",
     "gia_do": "cung",
     "khoi_dong": 2.8,
     "canh_bao": 4.5,
     "dung": 7.1
    },
    {
     "bv": "BV-4",
     "gia_do": "mem",
     "khoi_dong": 4.5,
     "canh_bao": 7.1,
     "dung": 11.2
    },
    {
     "bv": "BV-5",
     "gia_do": "cung",
     "khoi_dong": 1.8,
     "canh_bao": 4,
     "dung": 5.6
    },
    {
     "bv": "BV-5",
     "gia_do": "mem",
     "khoi_dong": 2.8,
     "canh_bao": 5.6,
     "dung": 7.1
    }
   ],
   "dich_chuyen_truc_o_truot": {
    "canh_bao_ty_le_khe_ho": 0.5,
    "dung_ty_le_khe_ho": 0.7,
    "nguon": "R21 Bảng 8.1"
   },
   "gia_do": {
    "cung": "rung móng gần chân máy < 25 % rung gối đỡ (R25 3.24); tần số cơ bản hệ đỡ > tốc độ chạy (R21)",
    "mem": "tần số riêng hệ đỡ < 25 % tần số quay thấp nhất (R25 3.13); dưới tốc độ chạy (R21)"
   },
   "quy_tac": {
    "tieu_chi_thay_doi_ty_le": 0.25,
    "tieu_chi_thay_doi_co_so": "canh_bao",
    "tieu_chi_thay_doi_nguon": "QUY ƯỚC CỦA TỆP (suy luận) — tiêu chuẩn không cho % cố định; cấu hình được"
   }
  },
  {
   "id": "ISO_20816_2_2017",
   "ten": "ISO 20816-2:2017 — Land-based gas/steam turbines and generators > 40 MW, fluid-film bearings",
   "nguon": "R23 (phạm vi: iso.org/standard/70047; giá trị: ISO 10816-2:2009 và ISO 7919-2:2009 qua biểu đồ Vibsens)",
   "ghi_chu_nguon": "CHƯA đối chiếu bản gốc ISO 20816-2:2017. Ngưỡng TSI của nhà chế tạo luôn ưu tiên.",
   "bang_than_o_van_toc": [
    {
     "toc_do_vpm": [
      1500,
      1800
     ],
     "A/B": 2.8,
     "B/C": 5.3,
     "C/D": 8.5
    },
    {
     "toc_do_vpm": [
      3000,
      3600
     ],
     "A/B": 3.8,
     "B/C": 7.5,
     "C/D": 11.8
    }
   ],
   "bang_truc_pkpk_um": [
    {
     "toc_do_vpm": 1500,
     "tuong_doi": {
      "A/B": 100,
      "B/C": 200,
      "C/D": 320
     },
     "tuyet_doi": {
      "A/B": 120,
      "B/C": 240,
      "C/D": 385
     }
    },
    {
     "toc_do_vpm": 1800,
     "tuong_doi": {
      "A/B": 90,
      "B/C": 185,
      "C/D": 290
     },
     "tuyet_doi": {
      "A/B": 110,
      "B/C": 220,
      "C/D": 350
     }
    },
    {
     "toc_do_vpm": 3000,
     "tuong_doi": {
      "A/B": 80,
      "B/C": 165,
      "C/D": 260
     },
     "tuyet_doi": {
      "A/B": 100,
      "B/C": 200,
      "C/D": 320
     }
    },
    {
     "toc_do_vpm": 3600,
     "tuong_doi": {
      "A/B": 75,
      "B/C": 150,
      "C/D": 240
     },
     "tuyet_doi": {
      "A/B": 90,
      "B/C": 180,
      "C/D": 290
     }
    }
   ],
   "quy_tac": {
    "tieu_chi_II_ty_le": 0.25,
    "tieu_chi_II_co_so": "B/C"
   }
  },
  {
   "id": "IEC_60034_14_2018",
   "ten": "IEC 60034-14:2018 — Rotating electrical machines, shaft height ≥ 56 mm (FACTORY test, uncoupled)",
   "nguon": "R22 Bảng 1, mục 1, 4.2, 5, 6, 7.4",
   "pham_vi": {
    "chi_thu_tai_xuong": true,
    "khong_ap_dung_tai_cho": true
   },
   "bang": [
    {
     "cap": "A",
     "H_mm": "56-132",
     "lap": "treo_tu_do",
     "dich_chuyen_rms_um": 45,
     "van_toc": 2.8
    },
    {
     "cap": "A",
     "H_mm": ">132",
     "lap": "treo_tu_do",
     "dich_chuyen_rms_um": 45,
     "van_toc": 2.8
    },
    {
     "cap": "A",
     "H_mm": ">132",
     "lap": "cung",
     "dich_chuyen_rms_um": 37,
     "van_toc": 2.3,
     "van_toc_khi_2FL_troi": 2.8
    },
    {
     "cap": "B",
     "H_mm": "56-132",
     "lap": "treo_tu_do",
     "dich_chuyen_rms_um": 18,
     "van_toc": 1.1
    },
    {
     "cap": "B",
     "H_mm": ">132",
     "lap": "treo_tu_do",
     "dich_chuyen_rms_um": 29,
     "van_toc": 1.8
    },
    {
     "cap": "B",
     "H_mm": ">132",
     "lap": "cung",
     "dich_chuyen_rms_um": 24,
     "van_toc": 1.5,
     "van_toc_khi_2FL_troi": 1.8
    }
   ],
   "quy_tac": {
    "cap_mac_dinh": "A",
    "duoi_600_vpm_dung_dich_chuyen": true,
    "phach_2_cuc": "x = sqrt((xmax^2 + xmin^2)/2)",
    "khoi_luong_cam_bien_toi_da_ty_le": 0.02,
    "rung_nen_ty_le_toi_da": 0.25
   }
  },
  {
   "id": "ISO_21940_11_2016",
   "ten": "ISO 21940-11:2016 — Balance quality of rigid rotors",
   "nguon": "R26; R21 mục 7.2",
   "cong_thuc_U_per_gmm": "9549 * G * m_kg / n_max_vpm",
   "cap_G": [
    {
     "G": 6.3,
     "vi_du": [
      "quạt",
      "bơm",
      "bánh răng",
      "máy công nghệ",
      "động cơ/máy phát H≥80 mm, n_max ≤ 950 v/p",
      "động cơ H<80 mm",
      "tuabin thuỷ lực"
     ]
    },
    {
     "G": 2.5,
     "vi_du": [
      "tuabin hơi",
      "tuabin khí",
      "máy nén",
      "động cơ/máy phát H≥80 mm, n_max > 950 v/p"
     ]
    },
    {
     "G": 16,
     "vi_du": [
      "máy nghiền đập",
      "trục các-đăng",
      "máy nông nghiệp"
     ]
    },
    {
     "G": 1,
     "vi_du": [
      "truyền động máy mài"
     ]
    }
   ]
  },
  {
   "id": "WOWK_BANG_1",
   "ten": "Wowk — A Brief Tutorial on Machine Vibration, Bảng 1 Vibration Limits",
   "nguon": "WOWK tr.3 Bảng 1 (bản 10 trang; PXVH1 lưu tại D:/QTVH/Đo độ rung các thiết bị/vibration-analysis_compress.pdf)",
   "ghi_chu": "Mức chấp nhận chung, đo tại hoặc sát ổ; máy đặt trên lò xo/bệ nâng hoặc có nguồn rung lân cận lớn có thể cho phép cao hơn (WOWK tr.3). Dịch chuyển mils pk-pk tại 1X; vận tốc tổng in/s PEAK 10–1000 Hz; gia tốc tổng g PEAK 0–5000 Hz. Đổi: mm/s RMS = in/s pk × 25,4 / √2; µm pk-pk = mils × 25,4.",
   "bang_van_toc_in_s_pk": {
    "dong_co_1000_2000": 0.2,
    "dong_co_tren_2000": 0.2,
    "may_phat": 0.2,
    "quat_ly_tam": 0.3,
    "quat_huong_truc": 0.2,
    "may_thoi": 0.3,
    "bom": 0.2,
    "may_nen_ly_tam": 0.2,
    "hop_so": 0.4,
    "hop_so_thap_giai_nhiet": 0.4,
    "tuabin": 0.2,
    "may_nen_truc_vit_doi": 1,
    "dong_co_dot_trong": 1
   },
   "bang": [
    {
     "ma": "dong_co_1000_2000",
     "ten": "Động cơ điện 1 000–2 000 v/p",
     "loai": "dong_co",
     "vpm_min": 1000,
     "vpm_max": 2000,
     "dich_chuyen_mils_pp": 2,
     "van_toc_in_s_pk": 0.2,
     "gia_toc_g_pk": 0.5
    },
    {
     "ma": "dong_co_tren_2000",
     "ten": "Động cơ điện > 2 000 v/p",
     "loai": "dong_co",
     "vpm_min": 2000,
     "vpm_max": null,
     "dich_chuyen_mils_pp": 1,
     "van_toc_in_s_pk": 0.2,
     "gia_toc_g_pk": 1
    },
    {
     "ma": "may_phat",
     "ten": "Máy phát",
     "loai": "may_phat",
     "vpm_min": null,
     "vpm_max": null,
     "dich_chuyen_mils_pp": 2,
     "van_toc_in_s_pk": 0.2,
     "gia_toc_g_pk": 0.5
    },
    {
     "ma": "quat_ly_tam_duoi_600",
     "ten": "Quạt ly tâm < 600 v/p",
     "loai": "quat",
     "vpm_min": null,
     "vpm_max": 600,
     "dich_chuyen_mils_pp": 4,
     "van_toc_in_s_pk": 0.3,
     "gia_toc_g_pk": 0.5
    },
    {
     "ma": "quat_ly_tam_600_1000",
     "ten": "Quạt ly tâm 600–1 000 v/p",
     "loai": "quat",
     "vpm_min": 600,
     "vpm_max": 1000,
     "dich_chuyen_mils_pp": 3,
     "van_toc_in_s_pk": 0.3,
     "gia_toc_g_pk": 1
    },
    {
     "ma": "quat_ly_tam_1000_2000",
     "ten": "Quạt ly tâm 1 000–2 000 v/p",
     "loai": "quat",
     "vpm_min": 1000,
     "vpm_max": 2000,
     "dich_chuyen_mils_pp": 2,
     "van_toc_in_s_pk": 0.3,
     "gia_toc_g_pk": 1.5
    },
    {
     "ma": "quat_ly_tam_tren_2000",
     "ten": "Quạt ly tâm > 2 000 v/p",
     "loai": "quat",
     "vpm_min": 2000,
     "vpm_max": null,
     "dich_chuyen_mils_pp": 1,
     "van_toc_in_s_pk": 0.3,
     "gia_toc_g_pk": 2
    },
    {
     "ma": "quat_huong_truc",
     "ten": "Quạt hướng trục (vaneaxial)",
     "loai": "quat_huong_truc",
     "vpm_min": null,
     "vpm_max": null,
     "dich_chuyen_mils_pp": 1,
     "van_toc_in_s_pk": 0.2,
     "gia_toc_g_pk": 0.5
    },
    {
     "ma": "may_thoi",
     "ten": "Máy thổi (blower)",
     "loai": "may_thoi_roots",
     "vpm_min": null,
     "vpm_max": null,
     "dich_chuyen_mils_pp": 1,
     "van_toc_in_s_pk": 0.3,
     "gia_toc_g_pk": 0.5
    },
    {
     "ma": "bom",
     "ten": "Bơm",
     "loai": "bom",
     "vpm_min": null,
     "vpm_max": null,
     "dich_chuyen_mils_pp": 2,
     "van_toc_in_s_pk": 0.2,
     "gia_toc_g_pk": 0.5
    },
    {
     "ma": "may_nen_ly_tam",
     "ten": "Máy nén ly tâm",
     "loai": "may_nen_ly_tam",
     "vpm_min": null,
     "vpm_max": null,
     "dich_chuyen_mils_pp": 1,
     "van_toc_in_s_pk": 0.2,
     "gia_toc_g_pk": 3
    },
    {
     "ma": "hop_so_thap_giai_nhiet",
     "ten": "Hộp số tháp giải nhiệt",
     "loai": "hop_so_thap_giai_nhiet",
     "vpm_min": null,
     "vpm_max": null,
     "dich_chuyen_mils_pp": 3,
     "van_toc_in_s_pk": 0.4,
     "gia_toc_g_pk": 2
    },
    {
     "ma": "dong_co_dot_trong",
     "ten": "Động cơ đốt trong (khí/diesel)",
     "loai": "dong_co_dot_trong",
     "vpm_min": null,
     "vpm_max": null,
     "dich_chuyen_mils_pp": 5,
     "van_toc_in_s_pk": 1,
     "gia_toc_g_pk": 10
    },
    {
     "ma": "tuabin",
     "ten": "Tuabin",
     "loai": "tuabin_hoi",
     "vpm_min": null,
     "vpm_max": null,
     "dich_chuyen_mils_pp": 1,
     "van_toc_in_s_pk": 0.2,
     "gia_toc_g_pk": 0.5
    },
    {
     "ma": "hop_so",
     "ten": "Hộp số",
     "loai": "hop_so",
     "vpm_min": null,
     "vpm_max": null,
     "dich_chuyen_mils_pp": 1,
     "van_toc_in_s_pk": 0.4,
     "gia_toc_g_pk": 2
    },
    {
     "ma": "may_nen_truc_vit_doi",
     "ten": "Máy nén trục vít đôi",
     "loai": "may_nen_truc_vit",
     "vpm_min": null,
     "vpm_max": null,
     "dich_chuyen_mils_pp": 1,
     "van_toc_in_s_pk": 1,
     "gia_toc_g_pk": 15
    }
   ],
   "tieu_chi": {
    "tang_dang_ke": 2,
    "tang_nghiem_trong": 5,
    "nguon": "WOWK tr.8: tăng 2× (6 dB) so với nền là thay đổi vật lý đáng kể; 5× là nghiêm trọng"
   }
  },
  {
   "id": "MD_CHART_1989",
   "ten": "Machine Dynamics — Vibration Limits for Bearing Cap Measurements (08/1989)",
   "nguon": "CHART; tệp HD mục 4.2 (đọc xấp xỉ từ ảnh, ±10 % ở góc gãy)",
   "don_vi": "in/s PEAK theo tần số Hz",
   "ranh_gioi": [
    {
     "ten": "GOOD/ACCEPTABLE",
     "V": 0.03,
     "f_dau": 45,
     "f_cuoi": 200
    },
    {
     "ten": "ACCEPTABLE/TOLERABLE",
     "V": 0.1,
     "f_dau": 30,
     "f_cuoi": 165
    },
    {
     "ten": "TOLERABLE/EXCESSIVE",
     "V": 0.3,
     "f_dau": 10,
     "f_cuoi": 190
    },
    {
     "ten": "EXCESSIVE/EXTREMELY ROUGH",
     "V": 0.7,
     "f_dau": 2.3,
     "f_cuoi": 250
    }
   ],
   "cong_thuc": "ranh_gioi(f) = V * min(f/f_dau, 1, f_cuoi/f)"
  },
  {
   "id": "DH1_BANG_THEO_DOI",
   "ten": "Ngưỡng chung bảng theo dõi hằng tuần PXVH1 (Google Sheets / web PHP)",
   "nguon": "tệp HD mục 4.5; bảng settings MySQL",
   "noi_bo": true,
   "van_toc_canh_bao": 4.5,
   "van_toc_nguy_hiem": 7.1,
   "nhiet_canh_bao_C": 70,
   "nhiet_nguy_hiem_C": 85,
   "ghi_chu": "Đây là ngưỡng Nhóm 1 móng cứng áp chung cho mọi máy — KHÔNG đúng cho động cơ Nhóm 2, bơm, quạt ≤ 300 kW. Phần mềm mới phải dùng ngưỡng theo từng thiết bị (mục 24)."
  },
  {
   "id": "DH1_SCCN_PDM",
   "ten": "Ngưỡng hệ thống giám sát định kỳ máy nghiền (SCCN)",
   "nguon": "SCCN-T4; tệp HD mục 4.4",
   "noi_bo": true,
   "VEL_mm_s": {
    "alert": 4.5,
    "danger": 7.1
   },
   "ACC_g": {
    "alert": 2,
    "danger": 3.5
   },
   "gE_E3": {
    "alert": 2,
    "danger": 5
   }
  }
 ]
};
