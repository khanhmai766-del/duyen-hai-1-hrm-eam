export type PlanInput = {
  year: number; closedMonth: number; kind: "material" | "electricity";
  target: number; used: number; actualProduction: number;
  future: { month: number; production: number; usage: number | null }[];
};
const stable = (value: number) => Number(value.toPrecision(15));
export function annualPlan(input: PlanInput) {
  const { year, closedMonth, kind, target, used, actualProduction, future } = input;
  if (!Number.isInteger(year) || year < 1900 || year > 2199 || !Number.isInteger(closedMonth) || closedMonth < 1 || closedMonth > 12) throw new Error("Năm hoặc tháng chốt không hợp lệ.");
  if (kind !== "material" && kind !== "electricity") throw new Error("Loại chỉ tiêu không hợp lệ.");
  const valid = (n: number) => Number.isFinite(n) && n >= 0;
  if (![target, used, actualProduction].every(valid) || target <= 0 || actualProduction <= 0) throw new Error("Định mức và sản lượng lũy kế phải lớn hơn 0; lượng đã dùng không được âm.");
  if (kind === "electricity" && (target > 100 || used > actualProduction)) throw new Error("Điện tự dùng không được lớn hơn điện đầu cực; mục tiêu không quá 100%.");
  if (future.length !== 12 - closedMonth || future.some((r, i) => r.month !== closedMonth + i + 1 || !valid(r.production) || (r.usage !== null && !valid(r.usage)))) throw new Error("Nhập đủ sản lượng không âm cho từng tháng còn lại; lượng dự kiến để trống hoặc nhập số không âm.");
  if (kind === "electricity" && future.some(r => r.usage !== null && r.usage > r.production)) throw new Error("Điện tự dùng dự kiến không được vượt điện đầu cực cùng tháng.");
  const factor = kind === "electricity" ? 100 : 1000;
  const futureProduction = future.reduce((a, r) => a + r.production, 0);
  const annualProduction = actualProduction + futureProduction;
  const annualAllowance = stable(target / factor * annualProduction);
  const remaining = stable(annualAllowance - used);
  const feasible = remaining >= 0;
  const allocatable = Math.min(Math.max(remaining, 0), kind === "electricity" ? futureProduction : Infinity);
  const months = future.map(r => {
    // Round downward to 0.001 kg/kWh so displayed allowances cannot overspend the budget.
    const allowance = futureProduction > 0 ? Math.floor(allocatable * (r.production / futureProduction) * 1000) / 1000 : 0;
    return { ...r, allowance, planned: r.usage ?? allowance };
  });
  const plannedRemaining = months.reduce((a, r) => a + r.planned, 0);
  const projectedUsage = used + plannedRemaining;
  const projectedRate = stable(projectedUsage / annualProduction * factor);
  const achieved = feasible && projectedRate <= target;
  const currentRate = stable(used / actualProduction * factor);
  const balance = stable(remaining - plannedRemaining);
  if (![annualProduction, annualAllowance, remaining, projectedRate, currentRate, balance, plannedRemaining].every(Number.isFinite)) throw new Error("Số liệu quá lớn để tính an toàn.");
  return { annualProduction, annualAllowance, remaining, feasible, futureProduction, months, plannedRemaining, projectedRate, achieved, currentRate, balance };
}
