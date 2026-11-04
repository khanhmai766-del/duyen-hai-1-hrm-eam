(() => {
  const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
  const normalized = value => clean(value).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
  const parseNumber = raw => {
    let value = clean(raw).replace(/[\s ]/g, "").replace(/[^0-9,.-]/g, "");
    if (!value) return null;
    const comma = value.lastIndexOf(","), dot = value.lastIndexOf(".");
    if (comma >= 0 && comma > dot) value = value.replace(/\./g, "").replace(",", ".");
    else if (dot >= 0 && dot > comma) value = value.replace(/,/g, "");
    else value = value.replace(",", ".");
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const normalizeDate = raw => {
    const match = clean(raw).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
  };
  const required = [
    { meter: "DHA_S1", channel: "kWhGiao", label: "Đầu cực S1" },
    { meter: "DH1_285M", channel: "kWhGiao", label: "Điểm bán S1" },
    { meter: "DH1_285M", channel: "kWhNhan", label: "Điện nhận lưới S1" },
    { meter: "DHA_S2", channel: "kWhGiao", label: "Đầu cực S2" },
    { meter: "DH1_283M", channel: "kWhGiao", label: "Điểm bán S2" },
    { meter: "DH1_283M", channel: "kWhNhan", label: "Điện nhận lưới S2" },
  ];
  const confirmedStopped = (target, options) =>
    (options?.stoppedUnits || []).includes(["DHA_S1", "DH1_285M"].includes(target.meter) ? "S1" : "S2");
  const stopped = (target, options) => target.channel === "kWhGiao" && confirmedStopped(target, options);
  function meterPayload(readings, operatingDate, sourcePage) {
    const actual = readings.filter(Boolean);
    const missingReceiveMeters = required.filter(target => target.channel === "kWhNhan" &&
      !actual.some(reading => reading.meter === target.meter && reading.channel === target.channel)).map(target => target.meter);
    return { version: 1, kind: "ppa-meter", operatingDate, sourcePage, readings: actual,
      ...(missingReceiveMeters.length ? { missingReceiveMeters } : {}) };
  }
  function stoppedReading(target, operatingDate, sourcePage) {
    return { meter: target.meter, channel: target.channel, operatingDate, total: 0,
      intervals: Array(48).fill(0), sourceName: `${sourcePage} · xác nhận tổ máy ngừng cả ngày` };
  }

  // --- Cách 1 (dự phòng): dò bảng HTML đã hiển thị đủ cột H1–H48 trong DOM.
  // Trang QLKT thật thường KHÔNG render đủ 48 cột cùng lúc (bảng ảo hoá theo
  // chiều ngang lẫn chiều dọc), nên cách này chỉ còn dùng khi cách 2 thất bại.
  function extractPpaMeterReadings(tables, operatingDate, sourcePage = "QLKT · Số liệu đo đếm công tơ", options = {}) {
    let header = null, dataRows = [], headerTableIndex = -1, headerRowIndex = -1;
    for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
      const rows = tables[tableIndex];
      const headerIndex = rows.findIndex(row => {
        const cells = row.map(normalized);
        return cells.includes("ten diem do") && cells.includes("kenh") && cells.includes("tong") && cells.some(cell => cell === "h1" || cell === "h01");
      });
      if (headerIndex < 0) continue;
      const candidate = rows[headerIndex].map(normalized);
      const hasAllIntervals = Array.from({ length: 48 }, (_, index) => {
        const hour = index + 1;
        return candidate.includes(`h${hour}`) || candidate.includes(`h${String(hour).padStart(2, "0")}`);
      }).every(Boolean);
      if (hasAllIntervals) { header = candidate; headerTableIndex = tableIndex; headerRowIndex = headerIndex; break; }
    }
    if (!header) throw new Error("Không tìm thấy bảng Số liệu đo đếm công tơ có đủ H1–H48.");
    dataRows = tables.flatMap((rows, tableIndex) => tableIndex === headerTableIndex ? rows.slice(headerRowIndex + 1) : rows);

    const meterIndex = header.indexOf("ten diem do"), channelIndex = header.indexOf("kenh"), dateIndex = header.indexOf("ngay"), totalIndex = header.indexOf("tong");
    const hourIndexes = Array.from({ length: 48 }, (_, index) => {
      const hour = index + 1;
      const plain = header.indexOf(`h${hour}`);
      return plain >= 0 ? plain : header.indexOf(`h${String(hour).padStart(2, "0")}`);
    });
    const readings = required.map(target => {
      const row = dataRows.find(candidate => {
        const actualMeterIndex = candidate.findIndex(cell => normalized(cell) === normalized(target.meter));
        const offset = actualMeterIndex - meterIndex;
        return actualMeterIndex >= 0 && normalized(candidate[channelIndex + offset]) === normalized(target.channel)
          && (dateIndex < 0 || normalizeDate(candidate[dateIndex + offset]) === operatingDate);
      });
      if (!row) {
        const stale = dataRows.some(candidate => {
          const actual = candidate.findIndex(cell => normalized(cell) === normalized(target.meter)), offset = actual - meterIndex;
          return actual >= 0 && normalized(candidate[channelIndex + offset]) === normalized(target.channel) && dateIndex >= 0 && normalizeDate(candidate[dateIndex + offset]) !== operatingDate;
        });
        if (stopped(target, options) && !stale) return stoppedReading(target, operatingDate, sourcePage);
        if (target.channel === "kWhNhan" && confirmedStopped(target, options) && !stale) return null;
        throw new Error(`Không tìm thấy ${target.meter} / ${target.channel} cho ngày đã chọn.`);
      }
      const offset = row.findIndex(cell => normalized(cell) === normalized(target.meter)) - meterIndex;
      const intervals = hourIndexes.map(index => parseNumber(row[index + offset]));
      if (intervals.some(value => value === null || value < 0)) throw new Error(`${target.meter}: thiếu hoặc sai giá trị trong H1–H48.`);
      const numericIntervals = intervals;
      const intervalTotal = numericIntervals.reduce((sum, value) => sum + value, 0);
      const reportedTotal = parseNumber(row[totalIndex + offset]);
      if (reportedTotal === null) throw new Error(`${target.meter}: không đọc được cột Tổng.`);
      if (stopped(target, options) && reportedTotal > 0) throw new Error(`${target.meter}: có điện phát, không khớp xác nhận ngừng cả ngày.`);
      const tolerance = Math.max(50, Math.abs(reportedTotal) * 0.000005);
      if (Math.abs(intervalTotal - reportedTotal) > tolerance) throw new Error(`${target.meter}: tổng H1–H48 không khớp cột Tổng.`);
      return { meter: target.meter, channel: target.channel, operatingDate, total: reportedTotal, intervals: numericIntervals, sourceName: sourcePage };
    });
    return meterPayload(readings, operatingDate, sourcePage);
  }

  // --- Cách 2 (chính): đọc thẳng dữ liệu đầy đủ mà QLKT đã nhúng sẵn trong
  // trang, bên trong thẻ <script> khởi tạo widget bảng tính "ExtSheet"
  // (PrimeFaces Extensions). Widget này chỉ HIỂN THỊ một phần nhỏ số cột/dòng
  // cùng lúc (ảo hoá để tăng tốc độ), nhưng toàn bộ dữ liệu — kể cả 48 cột
  // H1–H48 của mọi điểm đo — luôn có sẵn nguyên vẹn dưới dạng mảng JSON ngay
  // trong mã nguồn trang, không phụ thuộc việc người dùng đã cuộn/hiển thị
  // tới đâu. Đây là lý do cách đọc bảng DOM (cách 1) hay báo "không tìm thấy
  // đủ H1–H48": trình duyệt chỉ vẽ ra một phần bảng, còn dữ liệu thật nằm ở
  // đây.
  function extractDataArraysFromScripts(scriptTexts) {
    const arrays = [];
    for (const text of scriptTexts) {
      if (typeof text !== "string" || text.indexOf("ExtSheet") < 0 || text.indexOf("data:[") < 0) continue;
      let searchFrom = 0;
      for (;;) {
        const dataKeyIndex = text.indexOf("data:[", searchFrom);
        if (dataKeyIndex < 0) break;
        const arrStart = dataKeyIndex + "data:".length;
        let depth = 0, i = arrStart, inString = false, quoteChar = "";
        for (; i < text.length; i += 1) {
          const character = text[i];
          if (inString) {
            if (character === "\\") { i += 1; continue; }
            if (character === quoteChar) inString = false;
            continue;
          }
          if (character === '"' || character === "'") { inString = true; quoteChar = character; continue; }
          if (character === "[") depth += 1;
          else if (character === "]") { depth -= 1; if (depth === 0) { i += 1; break; } }
        }
        const arrayText = text.slice(arrStart, i);
        try {
          const parsed = JSON.parse(arrayText);
          if (Array.isArray(parsed)) arrays.push(parsed);
        } catch {
          // Đoạn không parse được (không phải JSON hợp lệ) thì bỏ qua, thử đoạn "data:[" tiếp theo nếu có.
        }
        searchFrom = Math.max(i, dataKeyIndex + 6);
      }
    }
    return arrays;
  }

  function extractPpaMeterReadingsFromScripts(scriptTexts, operatingDate, sourcePage = "QLKT · Số liệu đo đếm công tơ", options = {}) {
    const arrays = extractDataArraysFromScripts(scriptTexts);
    if (!arrays.length) {
      // Ghi thêm thông tin chẩn đoán vào thông báo lỗi để không cần dò lại
      // thủ công lần nữa nếu vẫn thất bại: đã quét bao nhiêu thẻ <script>,
      // bao nhiêu thẻ có chữ "ExtSheet", bao nhiêu thẻ có "data:[".
      const total = scriptTexts.length;
      const withExtSheet = scriptTexts.filter(text => typeof text === "string" && text.indexOf("ExtSheet") >= 0).length;
      const withDataKey = scriptTexts.filter(text => typeof text === "string" && text.indexOf("data:[") >= 0).length;
      throw new Error(`Không tìm thấy dữ liệu bảng công tơ (ExtSheet) trong mã nguồn trang. (Đã quét ${total} thẻ script; ${withExtSheet} thẻ có "ExtSheet"; ${withDataKey} thẻ có "data:[").`);
    }
    const rows = arrays.flat().filter(row => Array.isArray(row) && row.length >= 53);
    if (!rows.length) throw new Error(`Không tìm thấy dòng dữ liệu điểm đo hợp lệ trong bảng công tơ. (Tìm thấy ${arrays.length} mảng dữ liệu nhưng không dòng nào đủ cột.)`);

    const readings = required.map(target => {
      const row = rows.find(candidate => {
        if (normalized(candidate[1]) !== normalized(target.channel)) return false;
        if (normalized(candidate[0]) !== normalized(target.meter)) return false;
        const rowDate = normalizeDate(candidate[2]);
        if (rowDate && rowDate !== operatingDate) return false;
        return true;
      });
      if (!row) {
        const meterRowsAnyChannel = rows.filter(candidate => normalized(candidate[0]) === normalized(target.meter));
        const stale = meterRowsAnyChannel.some(candidate => normalized(candidate[1]) === normalized(target.channel) && normalizeDate(candidate[2]) !== operatingDate);
        if (stopped(target, options) && !stale) return stoppedReading(target, operatingDate, sourcePage);
        if (target.channel === "kWhNhan" && confirmedStopped(target, options) && !stale) return null;
        const channelsFound = [...new Set(meterRowsAnyChannel.map(candidate => candidate[1]))];
        const datesFound = [...new Set(meterRowsAnyChannel.map(candidate => candidate[2]))];
        throw new Error(`Không tìm thấy ${target.meter} / ${target.channel} cho ngày đã chọn. (Tìm thấy ${meterRowsAnyChannel.length} dòng của ${target.meter}, kênh: ${channelsFound.join(", ") || "không có"}; ngày: ${datesFound.join(", ") || "không có"}.)`);
      }
      const intervals = row.slice(row.length - 48).map(parseNumber);
      if (intervals.some(value => value === null || value < 0)) throw new Error(`${target.meter}: thiếu hoặc sai giá trị trong H1–H48.`);
      const intervalTotal = intervals.reduce((sum, value) => sum + value, 0);
      const reportedTotal = parseNumber(row[row.length - 49]);
      if (reportedTotal === null) throw new Error(`${target.meter}: không đọc được cột Tổng.`);
      if (stopped(target, options) && reportedTotal > 0) throw new Error(`${target.meter}: có điện phát, không khớp xác nhận ngừng cả ngày.`);
      const tolerance = Math.max(50, Math.abs(reportedTotal) * 0.000005);
      if (Math.abs(intervalTotal - reportedTotal) > tolerance) throw new Error(`${target.meter}: tổng H1–H48 không khớp cột Tổng.`);
      return { meter: target.meter, channel: target.channel, operatingDate, total: reportedTotal, intervals, sourceName: sourcePage };
    });
    return meterPayload(readings, operatingDate, sourcePage);
  }

  function extractPpaMeterReadingsFromDataArrays(arrays, operatingDate, sourcePage = "QLKT · Số liệu đo đếm công tơ", options = {}) {
    const scriptTexts = (Array.isArray(arrays) ? arrays : []).map(data => `ExtSheet data:${JSON.stringify(data)}`);
    return extractPpaMeterReadingsFromScripts(scriptTexts, operatingDate, sourcePage, options);
  }

  globalThis.QlktMeterExtractor = { extractPpaMeterReadings, extractPpaMeterReadingsFromScripts, extractPpaMeterReadingsFromDataArrays };
})();
