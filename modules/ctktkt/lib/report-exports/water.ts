import ExcelJS from "exceljs";
import { getRawDb } from "@/modules/ctktkt/db";
import {
  formatIsoToDmy,
  recalculateWaterShiftChain,
  type WaterShiftLog,
} from "@/modules/ctktkt/lib/water-report/calculations";
import { ensureWaterSchema } from "@/modules/ctktkt/lib/water-report/schema";

const monthPattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/;

import {waterAdjustmentsFromRow} from "@/modules/ctktkt/lib/water-report/adjustments";
function rowToLog(row: Record<string, unknown>): WaterShiftLog {
  return {
    ...waterAdjustmentsFromRow(row),
    id: Number(row.id || 0),
    logDate: String(row.log_date || ""),
    shiftTime: String(row.shift_time || ""),
    shiftTeam: String(row.shift_team || ""),
    shiftLeader: String(row.shift_leader || ""),
    elecRecS1: Number(row.elec_rec_s1 ?? 0),
    elecRecS2: Number(row.elec_rec_s2 ?? 0),
    elecGenS1: Number(row.elec_gen_s1 ?? 0),
    elecGenS2: Number(row.elec_gen_s2 ?? 0),
    waterRecS1: Number(row.water_rec_s1 ?? 0),
    waterRecS2: Number(row.water_rec_s2 ?? 0),
    waterUsedS1: Number(row.water_used_s1 ?? 0),
    waterUsedS2: Number(row.water_used_s2 ?? 0),
    waterRatioS1: Number(row.water_ratio_s1 ?? 0),
    waterRatioS2: Number(row.water_ratio_s2 ?? 0),
    condenserRecS1: Number(row.condenser_rec_s1 ?? 0),
    condenserRecS2: Number(row.condenser_rec_s2 ?? 0),
    condenserUsedS1: Number(row.condenser_used_s1 ?? 0),
    condenserUsedS2: Number(row.condenser_used_s2 ?? 0),
    resinWaterS1_24h: Number(row.resin_water_s1_24h ?? 0),
    resinWaterS2_24h: Number(row.resin_water_s2_24h ?? 0),
    note: String(row.note || ""),
  };
}

export async function exportReport(request: Request) {
  const url = new URL(request.url);
  const month = url.searchParams.get("month") || "";

  if (!monthPattern.test(month)) {
    return Response.json({ error: "Tháng không hợp lệ (định dạng YYYY-MM)." }, { status: 400 });
  }

  try {
    const rawDb = getRawDb();
    await ensureWaterSchema(rawDb);

    // Lấy baseline
    const baselineRow = (await rawDb
      .prepare(
        `SELECT * FROM water_shift_logs
         WHERE log_date < ?
         ORDER BY log_date DESC,
                  CASE shift_time WHEN '22h00' THEN 3 WHEN '14h00' THEN 2 WHEN '06h00' THEN 1 ELSE 0 END DESC
         LIMIT 1`
      )
      .bind(`${month}-01`)
      .first()) as Record<string, unknown> | null;

    const baseline = baselineRow ? rowToLog(baselineRow) : null;

    // Lấy toàn bộ ca trong tháng
    const [yearStr, monthStr] = month.split("-");
    const year = Number(yearStr);
    const m = Number(monthStr);
    const nextMonth = m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;

    const monthRowsRes = await rawDb
      .prepare(
        `SELECT * FROM water_shift_logs
         WHERE log_date >= ? AND log_date < ?
         ORDER BY log_date ASC,
                  CASE shift_time WHEN '06h00' THEN 1 WHEN '14h00' THEN 2 WHEN '22h00' THEN 3 ELSE 9 END ASC`
      )
      .bind(`${month}-01`, `${nextMonth}-01`)
      .all();

    const monthShifts = monthRowsRes.results.map(r => rowToLog(r as Record<string, unknown>));
    const chainInput = baseline ? [baseline, ...monthShifts] : monthShifts;
    const chained = recalculateWaterShiftChain(chainInput);

    // Tạo Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Phân xưởng Vận hành 1";
    workbook.created = new Date();

    const sheetName = `T${monthStr}.${year}`;
    const ws = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }],
    });

    // Cấu hình các cột (20 cột gốc chuẩn Nhà máy)
    ws.columns = [
      { width: 14 }, // A: Ngày
      { width: 13 }, // B: Thời gian
      { width: 10 }, // C: Kíp
      { width: 14 }, // D: Trưởng Ca
      { width: 16 }, // E: Công tơ điện nhận S1
      { width: 16 }, // F: Công tơ điện nhận S2
      { width: 18 }, // G: Điện phát trong ca S1
      { width: 18 }, // H: Điện phát trong ca S2
      { width: 16 }, // I: Số nước nhận S1
      { width: 16 }, // J: Số nước nhận S2
      { width: 18 }, // K: Nước bổ sung S1
      { width: 18 }, // L: Nước bổ sung S2
      { width: 15 }, // M: Hệ số S1
      { width: 15 }, // N: Hệ số S2
      { width: 20 }, // O: Nước cấp bình ngưng S1
      { width: 20 }, // P: Nước cấp bình ngưng S2
      { width: 20 }, // Q: Lượng nước cấp bình ngưng S1
      { width: 20 }, // R: Lượng nước cấp bình ngưng S2
      { width: 20 }, // S: Lượng nước tái sinh hạt S1 (24h)
      { width: 20 }, // T: Lượng nước tái sinh hạt S2 (24h)
    ];

    // Hàng 1
    const r1 = ws.getRow(1);
    r1.height = 36;
    r1.values = [
      "NGÀY",
      "THỜI GIAN",
      "Kíp",
      "Trưởng Ca",
      "CÔNG TƠ ĐIỆN \nNHẬN CA ",
      "CÔNG TƠ ĐIỆN \nNHẬN CA ",
      "SẢN LƯỢNG ĐIỆN\nĐÃ PHÁT TRONG CA\n(MW)",
      "SẢN LƯỢNG ĐIỆN\nĐÃ PHÁT TRONG CA\n(MW)",
      "SỐ NƯỚC \nNHẬN CA\n(m3)",
      "SỐ NƯỚC \nNHẬN CA\n(m3)",
      "LƯỢNG NƯỚC BỔ SUNG \nSỬ DỤNG TRONG CA\n(m3)",
      "LƯỢNG NƯỚC BỔ SUNG \nSỬ DỤNG TRONG CA\n(m3)",
      "HỆ SỐ \n(NƯỚC/CÔNG SUẤT)\nm3/MWh",
      "HỆ SỐ \n(NƯỚC/CÔNG SUẤT)\nm3/MWh",
      "Nước cấp \nvào bình ngưng S1",
      "Nước cấp \nvào bình ngưng S2",
      "Lượng nước cấp \nvào bình ngưng S1",
      "Lượng nước cấp\n vào bình ngưng S2",
      "Lượng nước tái sinh hạt S1 (24h)",
      "Lượng Nước tái  sinh hạt S2 (24h)",
    ];

    // Hàng 2
    const r2 = ws.getRow(2);
    r2.height = 24;
    r2.values = [
      "NGÀY",
      "THỜI GIAN",
      "Kíp",
      "Trưởng Ca",
      "S1",
      "S2",
      "S1",
      "S2",
      "S1",
      "S2",
      "S1",
      "S2",
      "S1",
      "S2",
      null,
      null,
      null,
      null,
      null,
      null,
    ];

    // Merge Header Cells
    const merges = [
      "A1:A2",
      "B1:B2",
      "C1:C2",
      "D1:D2",
      "E1:F1",
      "G1:H1",
      "I1:J1",
      "K1:L1",
      "M1:N1",
      "O1:O2",
      "P1:P2",
      "Q1:Q2",
      "R1:R2",
      "S1:S2",
      "T1:T2",
    ];
    for (const m of merges) ws.mergeCells(m);

    // Style Header: Màu xanh chuẩn gốc #00B050, Times New Roman 13 Bold
    const headerFill: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF00B050" },
    };
    const headerFont: Partial<ExcelJS.Font> = {
      name: "Times New Roman",
      size: 13,
      bold: true,
      color: { argb: "FF000000" },
    };
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    for (let r = 1; r <= 2; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= 20; c++) {
        const cell = row.getCell(c);
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = thinBorder;
      }
    }

    // Ghi dữ liệu từng dòng
    let currentRowIdx = 3;
    const dayGroups: { logDate: string; startRow: number; endRow: number }[] = [];

    for (let i = 0; i < chained.length; i++) {
      const item = chained[i];
      const isBaseline = i === 0 && baseline !== null;
      const row = ws.getRow(currentRowIdx);
      row.height = 22;

      // Col A: Ngày
      row.getCell(1).value = isBaseline ? "" : formatIsoToDmy(item.logDate);
      // Col B: Thời gian
      row.getCell(2).value = item.shiftTime;
      // Col C: Kíp
      row.getCell(3).value = item.shiftTeam;
      // Col D: Trưởng ca
      row.getCell(4).value = item.shiftLeader;

      // Col E: Công tơ điện nhận S1
      row.getCell(5).value = item.elecRecS1;
      // Col F: Công tơ điện nhận S2
      row.getCell(6).value = item.elecRecS2;

      if (isBaseline) {
        // Dòng đầu tiên (baseline): Ghi giá trị tĩnh nếu có
        row.getCell(7).value = item.elecGenS1 || 0;
        row.getCell(8).value = item.elecGenS2 || 0;
        row.getCell(9).value = item.waterRecS1;
        row.getCell(10).value = item.waterRecS2;
        row.getCell(11).value = item.waterUsedS1 || 0;
        row.getCell(12).value = item.waterUsedS2 || 0;
        row.getCell(13).value = item.waterRatioS1 || 0;
        row.getCell(14).value = item.waterRatioS2 || 0;
        row.getCell(15).value = item.condenserRecS1 || 0;
        row.getCell(16).value = item.condenserRecS2 || 0;
        row.getCell(17).value = null;
        row.getCell(18).value = null;
        row.getCell(19).value = null;
        row.getCell(20).value = null;
      } else {
        // Gom nhóm theo ngày để gộp ô A (Ngày), S (Tái sinh S1), T (Tái sinh S2)
        const lastGroup = dayGroups[dayGroups.length - 1];
        if (!lastGroup || lastGroup.logDate !== item.logDate) {
          dayGroups.push({ logDate: item.logDate, startRow: currentRowIdx, endRow: currentRowIdx });
        } else {
          lastGroup.endRow = currentRowIdx;
        }

        const prevIdx = currentRowIdx - 1;
        const meterFormula=(column:string,adjustment:number|null|undefined,rollover=0)=>{
          const difference=`${column}${currentRowIdx}-${column}${prevIdx}`;
          const correction=adjustment!=null?String(adjustment):rollover?`IF(AND(${difference}<0,${difference}>-${rollover}),${rollover},0)`:"0";
          return `IF(AND(${column}${prevIdx}>0,${column}${currentRowIdx}${adjustment!=null?">=":">"}0),ROUND(${difference}+${correction},2),0)`;
        };
        // Col G: Sản lượng điện phát S1 = E[r] - E[r-1]
        row.getCell(7).value = { formula: `E${currentRowIdx}-E${prevIdx}`, result: item.elecGenS1 };
        // Col H: Sản lượng điện phát S2 = F[r] - F[r-1]
        row.getCell(8).value = { formula: `F${currentRowIdx}-F${prevIdx}`, result: item.elecGenS2 };

        // Col I: Số nước nhận S1
        row.getCell(9).value = item.waterRecS1;
        // Col J: Số nước nhận S2
        row.getCell(10).value = item.waterRecS2;

        // Col K: Lượng nước bổ sung S1 = I[r] - I[r-1]
        row.getCell(11).value = { formula: meterFormula("I",item.waterAdjustmentS1,25000), result: item.waterUsedS1 };
        // Col L: Lượng nước bổ sung S2 = J[r] - J[r-1]
        row.getCell(12).value = { formula: meterFormula("J",item.waterAdjustmentS2,25000), result: item.waterUsedS2 };

        // Col M: Hệ số S1 = K[r] / G[r]
        row.getCell(13).value = { formula: `IF(G${currentRowIdx}>0, K${currentRowIdx}/G${currentRowIdx}, 0)`, result: item.waterRatioS1 };
        // Col N: Hệ số S2 = L[r] / H[r]
        row.getCell(14).value = { formula: `IF(H${currentRowIdx}>0, L${currentRowIdx}/H${currentRowIdx}, 0)`, result: item.waterRatioS2 };

        // Col O: Nước cấp bình ngưng nhận S1
        row.getCell(15).value = item.condenserRecS1;
        // Col P: Nước cấp bình ngưng nhận S2
        row.getCell(16).value = item.condenserRecS2;

        // Col Q: Lượng nước bình ngưng dùng S1 = O[r] - O[r-1]
        row.getCell(17).value = { formula: meterFormula("O",item.condenserAdjustmentS1), result: item.condenserUsedS1 };
        // Col R: Lượng nước bình ngưng dùng S2 = P[r] - P[r-1]
        row.getCell(18).value = { formula: meterFormula("P",item.condenserAdjustmentS2), result: item.condenserUsedS2 };

        // Col S, T: Tái sinh hạt 24h
        row.getCell(19).value = item.resinWaterS1_24h ?? 0;
        row.getCell(20).value = item.resinWaterS2_24h ?? 0;
      }

      // Format cells
      const dataFont: Partial<ExcelJS.Font> = {
        name: "Times New Roman",
        size: 13,
      };

      for (let c = 1; c <= 20; c++) {
        const cell = row.getCell(c);
        cell.font = dataFont;
        cell.border = thinBorder;
        cell.alignment = { vertical: "middle", horizontal: "center" };

        if (c === 13 || c === 14) {
          cell.numFmt = "0.0000";
        } else if (c >= 5 && c <= 18) {
          cell.numFmt = "#,##0.00";
        }
      }

      currentRowIdx++;
    }

    // Gộp ô theo ngày cho cột A, S:T (các giá trị 24h)
    for (const group of dayGroups) {
      if (group.endRow > group.startRow) {
        // Tìm giá trị tái sinh hạt của ngày (nếu có ca nhập > 0 thì lấy giá trị đó để điền vào toàn bộ ô trong nhóm)
        let dayResin1 = 0;
        let dayResin2 = 0;
        for (let r = group.startRow; r <= group.endRow; r++) {
          const val1 = Number(ws.getCell(`S${r}`).value || 0);
          const val2 = Number(ws.getCell(`T${r}`).value || 0);
          if (val1 > 0) dayResin1 = val1;
          if (val2 > 0) dayResin2 = val2;
        }

        for (let r = group.startRow; r <= group.endRow; r++) {
          ws.getCell(`S${r}`).value = dayResin1;
          ws.getCell(`T${r}`).value = dayResin2;
        }

        // Gộp 03 hàng cùng 1 ngày thành 1 ô
        ws.mergeCells(`A${group.startRow}:A${group.endRow}`);
        ws.mergeCells(`S${group.startRow}:S${group.endRow}`);
        ws.mergeCells(`T${group.startRow}:T${group.endRow}`);

        // Đảm bảo căn giữa theo cả chiều dọc và ngang
        ws.getCell(`A${group.startRow}`).alignment = { vertical: "middle", horizontal: "center" };
        ws.getCell(`S${group.startRow}`).alignment = { vertical: "middle", horizontal: "center" };
        ws.getCell(`T${group.startRow}`).alignment = { vertical: "middle", horizontal: "center" };
      }
    }

    const adjusted=monthShifts.filter(shift=>Object.values(waterAdjustmentsFromRow(shift as unknown as Record<string,unknown>)).some(value=>value!==null));
    if(adjusted.length){
      const correctionSheet=workbook.addWorksheet("Hieu chinh cong to");
      correctionSheet.addRow(["Ngày","Ca","Nước nhận S1 (m³)","Nước nhận S2 (m³)","Bình ngưng S1 (m³)","Bình ngưng S2 (m³)","Ghi chú"]);
      for(const shift of adjusted)correctionSheet.addRow([shift.logDate,shift.shiftTime,shift.waterAdjustmentS1??null,shift.waterAdjustmentS2??null,shift.condenserAdjustmentS1??null,shift.condenserAdjustmentS2??null,shift.note||""]);
      for(let column=1;column<=7;column++)correctionSheet.getColumn(column).width=23;
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `Theo_doi_luong_nuoc_Thang_${monthStr}_${year}.xlsx`;

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Lỗi xuất file Excel theo dõi lượng nước:", err);
    return Response.json({ error: "Không thể xuất file Excel." }, { status: 500 });
  }
}
