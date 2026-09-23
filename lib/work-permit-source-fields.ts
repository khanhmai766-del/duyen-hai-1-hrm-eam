export const DEFAULT_PERMIT_MANAGING_UNIT = "Phân xưởng Vận hành 1";
export const DEFAULT_PERMIT_PLANT = "Duyên Hải 1";

/** Đơn vị công tác mặc định của PCT NỘI BỘ theo sổ: phiếu Cơ giao PXSC Cơ nhiệt, phiếu Điện giao
 *  PXSC Điện tự động. Chỉ là giá trị điền sẵn — người cấp vẫn sửa được theo đơn vị thực tế. */
export const DEFAULT_INTERNAL_TEAM_NAME = {
  MECHANICAL: "Phân xưởng Sửa chữa Cơ nhiệt",
  ELECTRICAL: "Phân xưởng Sửa chữa Điện tự động",
} as const;
