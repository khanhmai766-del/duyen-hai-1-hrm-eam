// Fixed shift org-chart template (sáng/chiều/tối share the same layout).
// The chart always renders these seats; check-ins fill the seat whose title
// matches the chosen cương vị. Edit this file to adjust the standard layout.

export type OrgTone = "blue" | "green";

export interface OrgLead {
  title: string;
  tone: OrgTone;
  /** Each inner array is a vertical column of seat titles under the lead. */
  columns: string[][];
}

export const ORG_CHIEF = "Trưởng ca";

export const ORG_LEADS: OrgLead[] = [
  {
    title: "Trưởng kíp Lò - Máy DH1",
    tone: "blue",
    columns: [
      ["Máy trưởng S1", "Máy trưởng S2", "Trợ thủ S1", "Trợ thủ S2", "Máy phó S1", "Máy phó S2", "Trạm bơm tuần hoàn"],
      ["Lò trưởng S1", "Lò trưởng S2", "Lò phó S1", "Lò phó S2", "Máy nghiền S1", "Máy nghiền S2", "Thải xỉ"],
      ["I&C", "ESP S1", "ESP S2", "FGD S1", "FGD S2", "Khí nén - nhà dầu 300m3"],
    ],
  },
  {
    title: "Trưởng kíp điện",
    tone: "green",
    columns: [
      ["Trực chính điện", "Trực phụ điện", "XLN hỗn hợp", "XLNT - Nhà dầu 5000m3", "NH3 - Lò hơi phụ", "Trạm nước thô"],
    ],
  },
];

/** Flat, ordered list of every seat title — used by the check-in cương vị dropdown. */
export const ORG_SEAT_TITLES: string[] = [
  ORG_CHIEF,
  ...ORG_LEADS.flatMap((l) => [l.title, ...l.columns.flat()]),
];
