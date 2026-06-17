// Operation support links (from LinkDH1.xlsx) + control-room contacts.

// "ops" = hỗ trợ công tác vận hành · "personal" = hỗ trợ cá nhân người dùng.
export type SupportLinkGroup = "ops" | "personal";

export const SUPPORT_LINKS: { name: string; href: string; group: SupportLinkGroup }[] = [
  { name: "Duyên Hải TPC Portal", href: "https://portal.tpcduyenhai.com.vn/login.xhtml?faces-redirect=true", group: "ops" },
  { name: "EVN Digital Office", href: "https://doffice.evngenco1.vn/sign-in", group: "ops" },
  { name: "EVN E-Learning", href: "https://elearninglms.evn.com.vn/user/login/?logout=1", group: "personal" },
  { name: "Nhật ký vận hành", href: "https://nkvh.tpcduyenhai.com.vn/nkvh/Login", group: "ops" },
  {
    name: "Theo dõi vật tư",
    href: "https://docs.google.com/spreadsheets/d/1jGwOsAc18N_aCLarHbGppuhcNM1RDkLDfgh4dmVBnoA/edit?gid=1363993822",
    group: "ops",
  },
  { name: "Theo dõi PCCC", href: "https://sites.google.com/view/pcccdh1/trang-ch%E1%BB%A7", group: "ops" },
  { name: "Giám sát thông số môi trường", href: "https://gsmt.tpcduyenhai.com.vn/auth/login?returnUrl=%2Fdashboard%2Ftable", group: "ops" },
  { name: "Đăng ký đổi ca, nghỉ phép", href: "https://gsmt.tpcduyenhai.com.vn/auth/login?returnUrl=%2Fdashboard%2Ftable", group: "personal" },
  { name: "Mail nội bộ công ty", href: "https://mail.tpcduyenhai.com.vn/#5", group: "personal" },
  { name: "Công tác định kỳ hằng ca", href: "http://vh.tpcduyenhai.com.vn/", group: "ops" },
  {
    name: "PYC Sửa Chữa Cơ",
    href: "https://docs.google.com/spreadsheets/d/1zKRH9zhEAkCwGRl4KiaNwUlkLg9_l4WXNSBeg3FK_MA/edit?gid=428426440",
    group: "ops",
  },
  {
    name: "PYC Sửa Chữa Điện",
    href: "https://docs.google.com/spreadsheets/d/1nPKFBr3wXfOFE4y_WACDs7cvb1ZZA-mg0mZbsIuB_lQ/edit?gid=1906730067",
    group: "ops",
  },
];

export const CONTROL_ROOM_CONTACTS: { label: string; phone: string }[] = [
  { label: "Phòng ĐKTT Duyên Hải 1", phone: "02943923238" },
  { label: "Phòng ĐKTT Duyên Hải 1", phone: "02943923239" },
  { label: "Phòng ĐKTT Duyên Hải 3, 3MR", phone: "02943923271" },
  { label: "Phòng ĐKTT Duyên Hải 3, 3MR", phone: "02946280123" },
];
