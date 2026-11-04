const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function canEditOperatingDate(iso: string, isAdmin: boolean, today = vietnamDateIso()) {
  const latestEditableDate = addDaysIso(today, -1);
  return iso <= today && (isAdmin || iso >= latestEditableDate);
}

export function vietnamDateIso(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: VN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isFutureOperatingDate(iso: string, today = vietnamDateIso()) {
  return iso > today;
}

export function addDaysIso(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Số liệu vận hành chỉ hoàn tất sau khi kết thúc ngày, vì vậy mọi màn hình
// nhập/đồng bộ theo ngày đều mặc định mở ngày D-1 theo múi giờ Việt Nam.
export function defaultOperatingDate(date = new Date()) {
  return addDaysIso(vietnamDateIso(date), -1);
}

/** BCSX shift entry opens today's sheet from 06:00 Vietnam time. */
export function defaultBcsxDate(date=new Date()){
  const hour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:VN_TIME_ZONE,hour:"2-digit",hourCycle:"h23"}).format(date));
  return addDaysIso(vietnamDateIso(date),hour<6?-1:0);
}

export function millisecondsToBcsxRollover(date=new Date()){
  const today=vietnamDateIso(date);
  const boundary=Date.parse(`${today}T06:00:00+07:00`);
  const next=date.getTime()<boundary?boundary:Date.parse(`${addDaysIso(today,1)}T06:00:00+07:00`);
  return next-date.getTime();
}
