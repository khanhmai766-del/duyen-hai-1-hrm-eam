/* Pure calendar helpers; use UTC only as a numeric representation of Vietnam
 * wall-clock dates from NKVH, never convert those strings to computer time. */
(function (root) {
  function parse(value) {
    const m = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const [d, mo, y, h, min, sec] = m.slice(1).map(value => value === undefined ? 0 : Number(value));
    if (h > 23 || min > 59 || sec > 59) return null;
    const stamp = Date.UTC(y, mo - 1, d, h, min, sec);
    const check = new Date(stamp);
    return check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d ? stamp : null;
  }
  function dayStamp(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Ngày không hợp lệ.");
    const [y, mo, d] = iso.split("-").map(Number);
    const stamp = parse(`${String(d).padStart(2,"0")}/${String(mo).padStart(2,"0")}/${y} 00:00`);
    if (stamp === null) throw new Error("Ngày không hợp lệ.");
    return stamp;
  }
  function displayDay(stamp) {
    const d = new Date(stamp);
    return `${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${d.getUTCFullYear()}`;
  }
  function inDay(event, iso) {
    const from = dayStamp(iso), to = from + 86400000;
    const start = parse(event.start);
    if (start === null) return false;
    if (!String(event.end || "").trim()) return start >= from && start < to;
    const end = parse(event.end);
    if (end === null || end < start) return false;
    return end === start ? start >= from && start < to : start < to && end > from;
  }
  root.NkvhFilter = {parse, dayStamp, displayDay, inDay};
  if (typeof module !== "undefined") module.exports = root.NkvhFilter;
})(globalThis);
