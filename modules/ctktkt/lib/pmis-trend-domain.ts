/** Preserve small fractional ranges (NH3) and negative ranges (condenser vacuum). */
export function pmisTrendDomain(values:(number|null)[]):[number,number] {
  const finite=values.filter((v):v is number=>v!==null && Number.isFinite(v));
  if(!finite.length) return [0,1];
  const min=Math.min(...finite),max=Math.max(...finite);
  const pad=(max-min)*.15 || Math.abs(max)*.05 || 1;
  return [min-pad,max+pad];
}
