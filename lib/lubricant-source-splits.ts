const hvacBranches = {
  "Bơm nước làm mát HVAC": { deviceLabel: "Bơm nước làm mát", branch: 8 },
  "Bơm nước lạnh HVAC": { deviceLabel: "Bơm nước làm lạnh", branch: 9 },
} as const;

export function lubricantHvacPumps(group: string, name: string) {
  if (group !== "Điện" || !Object.hasOwn(hvacBranches, name)) return [];
  const { deviceLabel, branch } = hvacBranches[name as keyof typeof hvacBranches];
  return (["A", "B", "C"] as const).map((letter, index) => ({
    suffix: letter,
    name: `${deviceLabel} ${letter} HVAC`,
    target: {
      deviceSeq: `DH1.S1.6.9.${branch}.${5 + 10 * index}`,
      materialCode: "1.31.53.020.VIE.00.000",
      machine: "COMMON",
    },
  }));
}

export function lubricantCoalFeeders(group: string, name: string) {
  const unit = /^Lò S([12])$/.exec(group)?.[1];
  if (!unit || name !== `HGT Máy cấp S${unit}`) return [];
  return ["A", "B", "C", "D", "E", "F"].flatMap((letter, branch) =>
    [1, 2].map((number) => ({
      suffix: `${letter}${number}`,
      name: `Máy cấp than ${letter}${number}`,
      sourceAlias: unit === "2" && letter === "A" && number === 1 ? "HGT máy cấp 2A1" : undefined,
      target: {
        deviceSeq: `DH1.S1.1.8.${branch + 1}.2.${number + 2}`,
        materialCode: "1.31.73.139.EUR.00.000",
        machine: `S${unit}`,
      },
    })),
  );
}

/** "HGT ĐC xích cào MC Sx": một dòng Excel cho 12 hộp giảm tốc xích cào máy cấp A1…F2. */
export function lubricantChainConveyors(group: string, name: string) {
  const unit = /^Lò S([12])$/.exec(group)?.[1];
  if (!unit || name !== `HGT ĐC xích cào MC S${unit}`) return [];
  return ["A", "B", "C", "D", "E", "F"].flatMap((letter, branch) =>
    [1, 2].map((number) => ({
      suffix: `${letter}${number}`,
      name: `Xích cào than máy cấp ${letter}${number}`,
      target: {
        deviceSeq: `DH1.S1.1.8.${branch + 1}.2.${number + 5}`,
        materialCode: "1.31.73.046.VIE.00.000",
        machine: `S${unit}`,
      },
    })),
  );
}
