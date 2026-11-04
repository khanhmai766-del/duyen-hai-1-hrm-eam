export function chartRange(values: (number | null)[], includeZero: boolean): [number, number] {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!finite.length) return includeZero ? [-1, 1] : [0, 1];
  const min = Math.min(...finite, ...(includeZero ? [0] : []));
  const max = Math.max(...finite, ...(includeZero ? [0] : []));
  const pad = Math.max(1, (max - min) * .15);
  return [Math.floor(min - pad), Math.ceil(max + pad)];
}

/** Start a new line after missing data, rather than implying measurements through the gap. */
export function buildRatePaths(values: (number | null)[], x: (index: number) => number, y: (value: number) => number) {
  const paths: string[] = [];
  let current = "";
  for (const [index,value] of values.entries()) {
    if (value === null || !Number.isFinite(value)) {
      if (current) paths.push(current);
      current = "";
    } else current += `${current ? "L" : "M"}${x(index)},${y(value)} `;
  }
  if (current) paths.push(current);
  return paths;
}
