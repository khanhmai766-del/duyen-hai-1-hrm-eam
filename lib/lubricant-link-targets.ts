import catalogLinks from "@/app/(dashboard)/replacements/lubricant-verified-links.json";
import { normalizeText } from "@/lib/nav";
import decisions from "@/app/(dashboard)/replacements/lubricant-link-decisions.json";
import { lubricantChainConveyors, lubricantCoalFeeders, lubricantHvacPumps } from "@/lib/lubricant-source-splits";

const normalize = (value: string) => normalizeText(value).replace(/\s+/g, " ").trim();

// Đối chiếu cây thiết bị và mã vật tư trên web. Khóa theo điểm nghiệp vụ để lần
// gia hạn tạo bản ghi mới vẫn nhận đúng thiết bị, tổ máy và vật tư.
export type VerifiedTarget = { materialCode: string; machine: string; altMaterialCodes?: string[]; altMaterialNames?: string[]; create?: boolean; position?: string } & (
  { deviceSeq: string } | { location: string }
);

export const verifiedTargets: Record<string, VerifiedTarget> = {
  ...catalogLinks,
  "Lò S1|FDF 1A": { deviceSeq: "DH1.S1.1.1.3.2.1", materialCode: "1.31.53.021.VIE.00.000", machine: "S1" },
  "Lò S1|FDF 1B": { deviceSeq: "DH1.S1.1.1.4.2.1", materialCode: "1.31.53.021.VIE.00.000", machine: "S1" },
  "Lò S1|PAF 1A": { deviceSeq: "DH1.S1.1.1.1.2.1", materialCode: "1.31.53.021.VIE.00.000", machine: "S1" },
  "Lò S1|PAF 1B": { deviceSeq: "DH1.S1.1.1.2.2.1", materialCode: "1.31.53.021.VIE.00.000", machine: "S1" },
  // Điểm S2 hiện dùng các nút bồn dầu cùng nhánh mã S1 theo xác nhận nghiệp vụ.
  "Lò S2|FDF 2A": { deviceSeq: "DH1.S1.1.1.3.2.1", materialCode: "1.31.53.021.VIE.00.000", machine: "S2" },
  "Lò S2|FDF 2B": { deviceSeq: "DH1.S1.1.1.4.2.1", materialCode: "1.31.53.021.VIE.00.000", machine: "S2" },
  "Lò S2|PAF 2A": { deviceSeq: "DH1.S1.1.1.1.2.1", materialCode: "1.31.53.021.VIE.00.000", machine: "S2" },
  "Lò S2|PAF 2B": { deviceSeq: "DH1.S1.1.1.2.2.1", materialCode: "1.31.53.021.VIE.00.000", machine: "S2" },
  "Lò S1|Hộp giảm tốc APH 1A;": { deviceSeq: "DH1.S1.1.1.7.1.3", materialCode: "1.11.11.003.SIN.00.000", machine: "S1" },
  "Lò S1|Hộp giảm tốc APH 1B;": { deviceSeq: "DH1.S1.1.1.8.1.3", materialCode: "1.11.11.003.SIN.00.000", machine: "S1" },
  "Lò S2|Hộp giảm tốc APH 2A;": { deviceSeq: "DH1.S1.1.1.7.1.3", materialCode: "1.11.11.003.SIN.00.000", machine: "S2" },
  "Lò S2|Hộp giảm tốc APH 2B;": { deviceSeq: "DH1.S1.1.1.8.1.3", materialCode: "1.11.11.003.SIN.00.000", machine: "S2" },
  "BOP|Bơm xới ngược B": { deviceSeq: "DH1.S1.5.3.28", materialCode: "1.31.53.020.VIE.00.000", machine: "COMMON" },
  "BOP|Bơm cấp RO2 A": { deviceSeq: "DH1.S1.5.2.4.1.2", materialCode: "1.31.53.020.VIE.00.000", machine: "COMMON" },
  "BOP|Bơm cấp RO2 B": { deviceSeq: "DH1.S1.5.2.4.1.7", materialCode: "1.31.53.020.VIE.00.000", machine: "COMMON" },
};

type Decisions = { links: Record<string, VerifiedTarget>; excelOnly: string[] };
const { links: rowLinks, excelOnly } = decisions as unknown as Decisions;
const excelOnlyKeys = new Set(excelOnly);

/** Dòng Excel được quyết định giữ nguyên như Excel (không gắn điểm theo dõi). */
export const isExcelOnly = (rowKey: string) => excelOnlyKeys.has(rowKey);

export const targetAcceptsCode = (target: VerifiedTarget, code: string) =>
  target.materialCode === code || !!target.altMaterialCodes?.includes(code);

export function verifiedTarget(group: string, sourceDevice: string, rowKey?: string): VerifiedTarget | undefined {
  const verified = (rowKey && rowLinks[rowKey]) || verifiedTargets[`${group}|${sourceDevice}`];
  if (verified || group !== "Máy nén khí") return verified;
  const control = /^MNK #([1-4])$/.exec(sourceDevice);
  const flyAsh = /^MNK ([A-J])$/.exec(sourceDevice);
  if (!control && !flyAsh) return undefined;
  return {
    machine: "COMMON",
    materialCode: "1.31.63.003.USA.00.000",
    location: control ? `Máy nén khí điều khiển số ${control[1]}` : `Máy nén khí vận chuyển tro bay ${flyAsh?.[1]}`,
  };
}

export function aphBearings(group: string, device: string) {
  const match = /^dau boi tron goi chan, goi dan huong aph ([12])([ab])$/.exec(device);
  if (!match || group !== `Lò S${match[1]}`) return [];
  const branch = match[2] === "a" ? 7 : 8;
  return [
    { branchSuffix: 5, name: "Gối chặn", label: "chan" },
    { branchSuffix: 4, name: "Gối dẫn hướng", label: "dan huong" },
  ].map(({ branchSuffix, name, label }) => ({
    name: `${name} APH ${match[1]}${match[2].toUpperCase()}`,
    label,
    target: {
      machine: `S${match[1]}`,
      deviceSeq: `DH1.S1.1.1.${branch}.${branchSuffix}.1`,
      materialCode: "1.31.73.047.SIN.00.000",
    },
  }));
}


export type ExpandedSourceRow = { key: string; group: string; name: string; target?: VerifiedTarget; cells: string[] };

/** Các dòng Excel sau khi tách (máy cấp than, bơm HVAC, gối APH) cùng đích đã xác minh của từng dòng. */
export function expandSourceRows(groups: Array<{ name: string; rows: string[][] }>): ExpandedSourceRow[] {
  return groups.flatMap(({ name: group, rows }) => {
    const machine = group.match(/S[12]$/)?.[0];
    const feederGroup = rows.find((cells) => cells[2] === `HGT Máy cấp ${machine}`);
    const feeders = feederGroup ? lubricantCoalFeeders(group, feederGroup[2]) : [];
    return rows.flatMap((cells, index): ExpandedSourceRow[] => {
      const key = `${group}:${index}`;
      if (feeders.some((feeder) => feeder.sourceAlias === cells[2])) return [];
      if (cells === feederGroup) return feeders.map((f) => ({ key: `${key}:${f.suffix}`, group, name: f.name, target: f.target, cells }));
      const bearings = aphBearings(group, normalize(cells[2]));
      if (bearings.length) return bearings.map((b) => ({ key: `${key}:${b.label}`, group, name: b.name, target: b.target, cells }));
      const chains = lubricantChainConveyors(group, cells[2]);
      if (chains.length) return chains.map((c) => ({ key: `${key}:${c.suffix}`, group, name: c.name, target: c.target, cells }));
      const pumps = lubricantHvacPumps(group, cells[2]);
      if (pumps.length) return pumps.map((p) => ({ key: `${key}:${p.suffix}`, group, name: p.name, target: p.target, cells }));
      return [{ key, group, name: cells[2], target: verifiedTarget(group, cells[2], key), cells }];
    });
  });
}

