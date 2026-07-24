/**
 * API đồng bộ khiếm khuyết V2.
 * - Chỉ đọc hai Google Sheet công ty.
 * - Nhận token bằng POST body, không đặt token trên URL.
 * - Đọc riêng từng nguồn và phân trang để tránh phản hồi JSON quá lớn.
 * - Kiểm tra chặt các cột bắt buộc trước khi trả dữ liệu.
 */
const DEFECT_SCHEMA_VERSION = 2;
const DEFECT_DEFAULT_PAGE_SIZE = 750;
const DEFECT_MAX_PAGE_SIZE = 1000;
const DEFECT_SOURCES = {
  CO: {
    spreadsheetId: "1zKRH9zhEAkCwGRl4KiaNwUlkLg9_l4WXNSBeg3FK_MA",
    sheetName: "DH1",
    sourceName: "CƠ_DH1",
    requestType: "Cơ",
  },
  DIEN: {
    spreadsheetId: "1nPKFBr3wXfOFE4y_WACDs7cvb1ZZA-mg0mZbsIuB_lQ",
    sheetName: "DH1",
    sourceName: "ĐIỆN_DH1",
    requestType: "Điện",
  },
};

/**
 * GET chỉ dùng kiểm tra Web App đã triển khai đúng phiên bản.
 * Không trả dữ liệu nguồn và không nhận token trên URL.
 */
function doGet() {
  return defectJsonResponse({
    success: true,
    service: "DH1_DEFECT_SYNC",
    schemaVersion: DEFECT_SCHEMA_VERSION,
    message: "Dùng POST để kiểm tra quyền hoặc đọc dữ liệu.",
  });
}

function doPost(e) {
  try {
    const request = defectParseRequest(e);
    defectAssertToken(request.token);

    if (request.action === "health") {
      return defectHealthResponse();
    }
    if (request.action !== "page") {
      throw defectError("INVALID_ACTION", "Action không hợp lệ");
    }

    return defectReadPage(request);
  } catch (error) {
    return defectJsonResponse({
      success: false,
      schemaVersion: DEFECT_SCHEMA_VERSION,
      errorCode: error && error.code ? error.code : "UNEXPECTED_ERROR",
      error: String(error && error.message ? error.message : error),
    });
  }
}

/**
 * Chạy thủ công trong Apps Script Editor để kiểm tra quyền đọc và tên cột,
 * không cần triển khai Web App và không đọc toàn bộ dữ liệu.
 */
function kiemTraNguonV2() {
  const result = defectHealthResponse().getContent();
  console.log(result);
  return result;
}

function defectParseRequest(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw defectError("INVALID_REQUEST", "Yêu cầu POST không có JSON body");
  }
  try {
    return JSON.parse(e.postData.contents);
  } catch (_error) {
    throw defectError("INVALID_JSON", "JSON body không hợp lệ");
  }
}

function defectAssertToken(receivedToken) {
  const expectedToken = PropertiesService.getScriptProperties().getProperty("SYNC_TOKEN");
  if (!expectedToken || String(receivedToken || "") !== expectedToken) {
    throw defectError("UNAUTHORIZED", "Không có quyền truy cập");
  }
}

function defectHealthResponse() {
  const sources = Object.keys(DEFECT_SOURCES).map(function (sourceCode) {
    const source = DEFECT_SOURCES[sourceCode];
    const workbook = SpreadsheetApp.openById(source.spreadsheetId);
    const sheet = workbook.getSheetByName(source.sheetName);
    if (!sheet) throw defectError("SHEET_NOT_FOUND", "Không tìm thấy tab " + source.sheetName + " trong " + source.sourceName);
    const layout = defectInspectLayout(sheet, source);
    return {
      source: sourceCode,
      sourceName: source.sourceName,
      lastRow: sheet.getLastRow(),
      lastColumn: sheet.getLastColumn(),
      headerRow: layout.headerRow,
      columns: layout.columnNames,
    };
  });

  return defectJsonResponse({
    success: true,
    service: "DH1_DEFECT_SYNC",
    schemaVersion: DEFECT_SCHEMA_VERSION,
    checkedAt: new Date().toISOString(),
    sources: sources,
  });
}

function defectReadPage(request) {
  const sourceCode = String(request.source || "").toUpperCase();
  const source = DEFECT_SOURCES[sourceCode];
  if (!source) throw defectError("INVALID_SOURCE", "Nguồn phải là CO hoặc DIEN");

  const offset = Math.max(0, Math.floor(Number(request.offset) || 0));
  const requestedLimit = Math.floor(Number(request.limit) || DEFECT_DEFAULT_PAGE_SIZE);
  const limit = Math.min(DEFECT_MAX_PAGE_SIZE, Math.max(1, requestedLimit));

  const workbook = SpreadsheetApp.openById(source.spreadsheetId);
  const sheet = workbook.getSheetByName(source.sheetName);
  if (!sheet) throw defectError("SHEET_NOT_FOUND", "Không tìm thấy tab " + source.sheetName + " trong " + source.sourceName);

  const layout = defectInspectLayout(sheet, source);
  const firstDataRow = layout.headerRow + 1;
  const totalDataRows = Math.max(0, sheet.getLastRow() - layout.headerRow);
  const rawRowCount = Math.min(limit, Math.max(0, totalDataRows - offset));
  const records = [];

  if (rawRowCount > 0) {
    const rows = sheet
      .getRange(firstDataRow + offset, 1, rawRowCount, sheet.getLastColumn())
      .getDisplayValues();

    rows.forEach(function (row, index) {
      const content = defectCell(row, layout.columns.content);
      if (!content) return;
      records.push({
        sourceSpreadsheetId: source.spreadsheetId,
        sourceSheet: source.sourceName,
        sourceTab: source.sheetName,
        sourceRow: firstDataRow + offset + index,
        requestType: source.requestType,
        stt: defectCell(row, layout.columns.stt),
        unit: defectCell(row, layout.columns.unit),
        deviceRaw: defectCell(row, layout.columns.device),
        positionRaw: defectCell(row, layout.columns.position),
        content: content,
        detectedAtRaw: defectCell(row, layout.columns.detectedAt),
        shiftLeaderRaw: defectCell(row, layout.columns.shiftLeader),
        reminderRaw: defectCell(row, layout.columns.reminder),
        repeatedRepairRaw: defectCell(row, layout.columns.repeatedRepair),
        fireSafetyImpact: defectCell(row, layout.columns.fireSafety),
        environmentSafetyImpact: defectCell(row, layout.columns.environment),
        severityRaw: defectCell(row, layout.columns.severity),
        conditionRaw: defectCell(row, layout.columns.condition),
        sourceStatusRaw: defectCell(row, layout.columns.status),
        repairResultRaw: defectCell(row, layout.columns.repairResult),
        completedAtRaw: defectCell(row, layout.columns.completedAt),
        noteRaw: defectCell(row, layout.columns.note),
      });
    });
  }

  const nextOffset = offset + rawRowCount;
  return defectJsonResponse({
    success: true,
    schemaVersion: DEFECT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: sourceCode,
    sourceName: source.sourceName,
    offset: offset,
    limit: limit,
    rawRowCount: rawRowCount,
    recordCount: records.length,
    totalDataRows: totalDataRows,
    nextOffset: nextOffset,
    hasMore: nextOffset < totalDataRows,
    records: records,
  });
}

function defectInspectLayout(sheet, source) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) throw defectError("EMPTY_SHEET", source.sourceName + " không có dữ liệu");

  const previewRowCount = Math.min(30, sheet.getLastRow());
  const preview = sheet.getRange(1, 1, previewRowCount, lastColumn).getDisplayValues();
  const headerIndex = defectFindHeaderRow(preview);
  if (headerIndex < 0) {
    throw defectError("HEADER_NOT_FOUND", "Không tìm thấy dòng tiêu đề trong " + source.sourceName);
  }

  const normalizedHeaders = preview[headerIndex].map(defectNormalizeText);
  const columns = defectBuildColumnIndexes(normalizedHeaders);
  const required = [
    ["STT", columns.stt],
    ["Tổ máy", columns.unit],
    ["Nội dung khiếm khuyết", columns.content],
    ["Ngày phát hiện", columns.detectedAt],
  ];
  const missing = required.filter(function (item) { return item[1] < 0; }).map(function (item) { return item[0]; });
  if (missing.length) {
    throw defectError("MISSING_COLUMNS", source.sourceName + " thiếu cột bắt buộc: " + missing.join(", "));
  }

  const columnNames = {};
  Object.keys(columns).forEach(function (key) {
    columnNames[key] = columns[key] >= 0 ? preview[headerIndex][columns[key]] : null;
  });
  return { headerRow: headerIndex + 1, columns: columns, columnNames: columnNames };
}

function defectFindHeaderRow(values) {
  for (let i = 0; i < values.length; i++) {
    const row = values[i].map(defectNormalizeText);
    const hasStt = defectFindColumn(row, ["stt"]) >= 0;
    const hasContent = defectFindColumn(row, ["ton tai/kiem khuyet", "ton tai", "khiem khuyet"]) >= 0;
    if (hasStt && hasContent) return i;
  }
  return -1;
}

function defectBuildColumnIndexes(headers) {
  return {
    stt: defectFindColumn(headers, ["stt"]),
    unit: defectFindColumn(headers, ["to may"]),
    device: defectFindColumn(headers, ["thiet bi"]),
    position: defectFindColumn(headers, ["cuong vi"]),
    content: defectFindColumn(headers, ["ton tai/kiem khuyet", "ton tai", "khiem khuyet"]),
    detectedAt: defectFindColumn(headers, ["ngay phat hien"]),
    shiftLeader: defectFindColumn(headers, ["truong ca"]),
    reminder: defectFindColumn(headers, ["nhac lai"]),
    repeatedRepair: defectFindColumn(headers, ["sua chua lap lai"]),
    fireSafety: defectFindColumn(headers, ["anh huong pccc"]),
    environment: defectFindColumn(headers, ["moi truong, atvsld", "moi truong", "atvsld"]),
    severity: defectFindColumn(headers, ["phan loai anh huong", "phan loai"]),
    condition: defectFindColumn(headers, ["dk thuc hien", "dieu kien thuc hien", "dk thuc"]),
    status: defectFindColumn(headers, ["ghi chu kq", "tinh trang khiem khuyet", "tinh trang"]),
    repairResult: defectFindColumn(headers, ["ket qua thuc hien"]),
    completedAt: defectFindColumn(headers, ["ngay ket thuc"]),
    note: defectFindColumn(headers, ["ghi chu (vh1)", "ghi chu vh1", "ghi chu"]),
  };
}

/**
 * Ưu tiên tiêu đề khớp chính xác; chỉ dùng contains khi không có exact match.
 */
function defectFindColumn(headers, aliases) {
  for (let aliasIndex = 0; aliasIndex < aliases.length; aliasIndex++) {
    const exactIndex = headers.indexOf(aliases[aliasIndex]);
    if (exactIndex >= 0) return exactIndex;
  }
  for (let aliasIndex = 0; aliasIndex < aliases.length; aliasIndex++) {
    for (let headerIndex = 0; headerIndex < headers.length; headerIndex++) {
      if (headers[headerIndex].indexOf(aliases[aliasIndex]) >= 0) return headerIndex;
    }
  }
  return -1;
}

function defectCell(row, index) {
  return index < 0 ? "" : String(row[index] || "").trim();
}

function defectNormalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function defectError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function defectJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
