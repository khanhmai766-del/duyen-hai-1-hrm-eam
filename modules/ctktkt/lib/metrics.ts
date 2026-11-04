export const metrics = [
  { code: "BI_NGHIEN", name: "Suất hao bi nghiền / than", unit: "g/tấn than", limit: 206.47 },
  { code: "NH3", name: "Suất hao NH₃", unit: "g/kWh", limit: 0.8638 },
  { code: "TUDUNG", name: "Tỷ lệ điện tự dùng", unit: "%", limit: 7.98 },
  { code: "MO_BOITRON", name: "Suất hao mỡ bôi trơn bánh răng", unit: "g/kWh", limit: 0.0028 },
  { code: "NAOH", name: "Suất hao NaOH (30%)", unit: "g/kWh", limit: 0.0177 },
  { code: "HCL", name: "Suất hao HCl (31%)", unit: "g/kWh", limit: 0.012 },
  { code: "PAC", name: "Suất hao PAC", unit: "g/kWh", limit: 0.0128 },
] as const;

export function numberInput(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !/^\d+(?:[.,]\d+)?$/.test(value.trim())) throw new Error("Nhập số không âm; dùng dấu phẩy hoặc dấu chấm cho phần thập phân, không dùng dấu phân cách hàng nghìn.");
  const n = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(n)) throw new Error("Số nhập quá lớn.");
  return n;
}

export function validateMeasurement(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Dữ liệu không hợp lệ.");
  const data = input as Record<string, unknown>;
  const metric = metrics.find(m => m.code === data.metricCode);
  if (!metric) throw new Error("Chỉ tiêu không hợp lệ.");
  if (typeof data.period !== "string" || !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(data.period)) throw new Error("Kỳ phải là tháng hợp lệ từ năm 1900 đến 2199.");
  if (typeof data.note !== "string" || data.note.length > 1000) throw new Error("Ghi chú tối đa 1.000 ký tự.");
  let actual: number;
  let note = data.note.trim();
  if (metric.code === "TUDUNG") {
    const gross = numberInput(data.gross);
    const exported = numberInput(data.exported);
    if (gross <= 0 || exported < 0 || exported > gross) throw new Error("Điện sản xuất phải lớn hơn 0; điện giao nhận từ 0 đến điện sản xuất.");
    actual = (gross - exported) / gross * 100;
    note = `[Tự tính v1: sản xuất=${gross} kWh; giao nhận=${exported} kWh] ${note}`;
  } else {
    const mass = numberInput(data.mass);
    const denominator = numberInput(data.denominator);
    if (mass < 0 || denominator <= 0) throw new Error("Khối lượng phải không âm; mẫu số phải lớn hơn 0.");
    actual = mass / denominator * 1000;
    if (!Number.isFinite(actual)) throw new Error("Kết quả vượt giới hạn tính toán.");
    note = `[Tự tính v1: khối lượng=${mass} kg; ${metric.code === "BI_NGHIEN" ? "than" : "điện xuất tuyến"}=${denominator} ${metric.code === "BI_NGHIEN" ? "tấn" : "kWh"}] ${note}`;
  }
  // Remove binary floating-point residue, keeping 15 significant digits (not display rounding).
  actual = Number(actual.toPrecision(15));
  return { metricCode: metric.code, metricName: metric.name, period: data.period, actual: String(actual), limitValue: String(metric.limit), note };
}
