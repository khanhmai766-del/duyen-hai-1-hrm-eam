export const BGTS_TUABIN_NGUNG_HOURS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23] as const;

export type BgtsTuabinNgungFieldKey =
  | "turbineLubeOilPressure"
  | "shaftJackingOilPressure"
  | "rotateSpeed"
  | "turningGearElectricity"
  | "eccentricity"
  | "hpMpCasingExpansionLeft"
  | "hpMpCasingExpansionRight"
  | "axialDisplacement"
  | "hpMpCasingDifferentialExpansion"
  | "lpCasingDifferentialExpansion"
  | "hpMainSteamValveWallTempInside"
  | "hpMainSteamValveWallTempOutside"
  | "hpRegulatingValveWallTempInside"
  | "hpRegulatingValveWallTempOutside"
  | "hpInnerCasingLowerPartTempInside"
  | "hpInnerCasingLowerPartTempOutside"
  | "hpExhaustOuterCasingInnerWallTempTop"
  | "hpExhaustOuterCasingInnerWallTempLower"
  | "hpExhaustPipeTempLeft1"
  | "hpExhaustPipeTempLeft2"
  | "hpExhaustPipeTempRight1"
  | "hpExhaustPipeTempRight2"
  | "mpIntakeMetalTempInnerWall"
  | "mpIntakeMetalTempOuterWall"
  | "mpExhaustInnerWallTempTop"
  | "mpExhaustInnerWallTempLower";

export type BgtsTuabinNgungField = {
  key: BgtsTuabinNgungFieldKey;
  label: string;
  shortLabel: string;
  unit: string;
  excelHeader: string[];
};

export const BGTS_TUABIN_NGUNG_FIELDS: BgtsTuabinNgungField[] = [
  {
    key: "turbineLubeOilPressure",
    label: "Áp suất dầu bôi trơn Tuabin",
    shortLabel: "Dầu bôi trơn",
    unit: "MPa",
    excelHeader: ["Pressure of Turbine lube oil"],
  },
  {
    key: "shaftJackingOilPressure",
    label: "Áp suất dầu kích trục",
    shortLabel: "Dầu kích trục",
    unit: "MPa",
    excelHeader: ["shaft-jacking oil pressure"],
  },
  {
    key: "rotateSpeed",
    label: "Tốc độ quay",
    shortLabel: "Tốc độ",
    unit: "r/min",
    excelHeader: ["rotate speed"],
  },
  {
    key: "turningGearElectricity",
    label: "Dòng điện turning gear",
    shortLabel: "Turning gear",
    unit: "A",
    excelHeader: ["Turning gear electricity"],
  },
  {
    key: "eccentricity",
    label: "Độ lệch tâm",
    shortLabel: "Lệch tâm",
    unit: "µm",
    excelHeader: ["Eccentricity"],
  },
  {
    key: "hpMpCasingExpansionLeft",
    label: "Giãn nở vỏ HP & MP - trái",
    shortLabel: "HP&MP trái",
    unit: "mm",
    excelHeader: ["Expansion of HP & MP casings", "Left"],
  },
  {
    key: "hpMpCasingExpansionRight",
    label: "Giãn nở vỏ HP & MP - phải",
    shortLabel: "HP&MP phải",
    unit: "mm",
    excelHeader: ["Expansion of HP & MP casings", "Right"],
  },
  {
    key: "axialDisplacement",
    label: "Dịch trục",
    shortLabel: "Dịch trục",
    unit: "mm",
    excelHeader: ["Axial displacement"],
  },
  {
    key: "hpMpCasingDifferentialExpansion",
    label: "Giãn nở vi sai vỏ HP & MP",
    shortLabel: "Vi sai HP&MP",
    unit: "mm",
    excelHeader: ["HP&MP casing differential expansion"],
  },
  {
    key: "lpCasingDifferentialExpansion",
    label: "Giãn nở vi sai vỏ LP",
    shortLabel: "Vi sai LP",
    unit: "mm",
    excelHeader: ["LP casing", "differential expansion"],
  },
  {
    key: "hpMainSteamValveWallTempInside",
    label: "Nhiệt độ vách van hơi chính HP phải - trong",
    shortLabel: "Van hơi HP trong",
    unit: "℃",
    excelHeader: ["HP main steam valve wall temperature (right)", "inside"],
  },
  {
    key: "hpMainSteamValveWallTempOutside",
    label: "Nhiệt độ vách van hơi chính HP phải - ngoài",
    shortLabel: "Van hơi HP ngoài",
    unit: "℃",
    excelHeader: ["HP main steam valve wall temperature (right)", "outside"],
  },
  {
    key: "hpRegulatingValveWallTempInside",
    label: "Nhiệt độ vách van điều chỉnh HP - trong",
    shortLabel: "Van ĐC HP trong",
    unit: "℃",
    excelHeader: ["HP regulating valve wall temperature", "inside"],
  },
  {
    key: "hpRegulatingValveWallTempOutside",
    label: "Nhiệt độ vách van điều chỉnh HP - ngoài",
    shortLabel: "Van ĐC HP ngoài",
    unit: "℃",
    excelHeader: ["HP regulating valve wall temperature", "outside"],
  },
  {
    key: "hpInnerCasingLowerPartTempInside",
    label: "Nhiệt độ phần dưới vỏ trong HP - trong",
    shortLabel: "Vỏ trong HP trong",
    unit: "℃",
    excelHeader: ["temperature of HP inner casing lower part", "inside"],
  },
  {
    key: "hpInnerCasingLowerPartTempOutside",
    label: "Nhiệt độ phần dưới vỏ trong HP - ngoài",
    shortLabel: "Vỏ trong HP ngoài",
    unit: "℃",
    excelHeader: ["temperature of HP inner casing lower part", "outside"],
  },
  {
    key: "hpExhaustOuterCasingInnerWallTempTop",
    label: "Nhiệt độ vách trong vỏ ngoài thoát HP - trên",
    shortLabel: "Thoát HP trên",
    unit: "℃",
    excelHeader: ["HP exhaust outer casing inner wall temperature", "Top"],
  },
  {
    key: "hpExhaustOuterCasingInnerWallTempLower",
    label: "Nhiệt độ vách trong vỏ ngoài thoát HP - dưới",
    shortLabel: "Thoát HP dưới",
    unit: "℃",
    excelHeader: ["HP exhaust outer casing inner wall temperature", "lower"],
  },
  {
    key: "hpExhaustPipeTempLeft1",
    label: "Nhiệt độ ống thoát HP - left1",
    shortLabel: "Ống thoát L1",
    unit: "℃",
    excelHeader: ["HP exhaust pipe temperature", "left1"],
  },
  {
    key: "hpExhaustPipeTempLeft2",
    label: "Nhiệt độ ống thoát HP - left2",
    shortLabel: "Ống thoát L2",
    unit: "℃",
    excelHeader: ["HP exhaust pipe temperature", "left2"],
  },
  {
    key: "hpExhaustPipeTempRight1",
    label: "Nhiệt độ ống thoát HP - right1",
    shortLabel: "Ống thoát R1",
    unit: "℃",
    excelHeader: ["HP exhaust pipe temperature", "right1"],
  },
  {
    key: "hpExhaustPipeTempRight2",
    label: "Nhiệt độ ống thoát HP - right2",
    shortLabel: "Ống thoát R2",
    unit: "℃",
    excelHeader: ["HP exhaust pipe temperature", "right2"],
  },
  {
    key: "mpIntakeMetalTempInnerWall",
    label: "Nhiệt độ kim loại đầu vào MP - vách trong",
    shortLabel: "MP vào trong",
    unit: "℃",
    excelHeader: ["MP intake Metal temperature", "Inner wall"],
  },
  {
    key: "mpIntakeMetalTempOuterWall",
    label: "Nhiệt độ kim loại đầu vào MP - vách ngoài",
    shortLabel: "MP vào ngoài",
    unit: "℃",
    excelHeader: ["MP intake Metal temperature", "Outer wall"],
  },
  {
    key: "mpExhaustInnerWallTempTop",
    label: "Nhiệt độ vách trong thoát MP - trên",
    shortLabel: "Thoát MP trên",
    unit: "℃",
    excelHeader: ["MP exhaust inner wall temperature", "top"],
  },
  {
    key: "mpExhaustInnerWallTempLower",
    label: "Nhiệt độ vách trong thoát MP - dưới",
    shortLabel: "Thoát MP dưới",
    unit: "℃",
    excelHeader: ["MP exhaust inner wall temperature", "lower"],
  },
];

export const BGTS_TUABIN_NGUNG_FIELD_KEYS = BGTS_TUABIN_NGUNG_FIELDS.map((field) => field.key);
