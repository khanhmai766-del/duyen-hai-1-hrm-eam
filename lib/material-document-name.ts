function vietnamDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year") };
}

function safeFilePart(value: string) {
  return value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120) || "thiet_bi";
}

export function bbntHandwrittenFileName(deviceNames: string[], issuedAt = new Date()) {
  const { day, month, year } = vietnamDateParts(issuedAt);
  const uniqueDeviceNames = [...new Set(deviceNames.map((name) => name.trim()).filter(Boolean))].join(", ");
  return `BBNT_ky_tay_${safeFilePart(uniqueDeviceNames)}_${day}${month}${year.slice(-2)}.docx`;
}

/** Tên file BBNT DO: "BBNT DO <tên thiết bị>_ddmmyy" — ddmmyy theo ngày bổ sung của BBNT ký tay. */
export function bbntDoFileName(deviceNames: string[], issuedAt = new Date()) {
  const { day, month, year } = vietnamDateParts(issuedAt);
  const uniqueDeviceNames = [...new Set(deviceNames.map((name) => name.trim()).filter(Boolean))].join(", ");
  return `BBNT DO ${safeFilePart(uniqueDeviceNames)}_${day}${month}${year.slice(-2)}.docx`;
}

export function vietnamDocumentDate(value: Date) {
  const { day, month, year } = vietnamDateParts(value);
  return `${day}/${month}/${year}`;
}
