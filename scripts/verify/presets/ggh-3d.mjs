// Mô hình 3D GGH (bộ sấy khói quay FGD) trong tab GGH của trang Vòi thổi bụi (17/10/2026) — chỉ xem, không ghi.
// Tuyến giả ?ggh=… chỉ để phân biệt ảnh chụp: toàn cảnh (thổi hơi), nhìn trên (rửa nước), nhìn cạnh.
// SMOKE_PERF=1: đo luồng chính 5 giây khi hoạt ảnh chạy (camera đứng yên) — CDP Performance metrics.
export const gghPreset = {
  description: "Tab GGH: rô-to quay, cần vòi trên/dưới làm sạch (vệt xoắn ốc), tia hơi / nước, khói thô xuống – khói sạch lên",
  async prepare() { return {}; },
  routes: () => ["/documents/archive?ggh=toan-canh", "/documents/archive?ggh=tren-rua-nuoc", "/documents/archive?ggh=canh"],
  async interact(page, route) {
    await page.getByRole("button", { name: "Vòi thổi bụi" }).first().evaluate((el) => el.click());
    await page.getByText("Vòi cần xử lý").first().waitFor({ timeout: 60_000 });
    // SMOKE_PERF=1: đo lúc mở tab GGH — thời gian tới khi khung 3D vẽ xong + các tác vụ dài (> 50 ms, làm khựng giao diện)
    const perf = process.env.SMOKE_PERF && route.endsWith("toan-canh");
    if (perf) await page.waitForTimeout(3000); // như người dùng: mở trang rồi vài giây sau mới bấm tab GGH
    if (perf) await page.evaluate(() => {
      window.__lt = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: false });
      window.__t0 = performance.now();
    });
    await page.getByRole("tab", { name: /GGH/ }).first().click();
    await page.getByRole("group", { name: "Góc nhìn GGH" }).waitFor({ timeout: 60_000 });
    if (perf) {
      const open = await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(Math.round(performance.now() - window.__t0))))));
      await page.waitForTimeout(1500);
      const lt = await page.evaluate(() => window.__lt.splice(0));
      console.log(`[ggh-perf] mở tab: ${open} ms tới khi khung vẽ · tác vụ dài: ${lt.length} (${lt.join(", ")} ms)`);
      await page.getByLabel("Dòng khói").check();
      await page.waitForTimeout(1500);
      const lt2 = await page.evaluate(() => window.__lt.splice(0));
      console.log(`[ggh-perf] bật dòng khói: tác vụ dài ${lt2.length} (${lt2.join(", ")} ms)`);
      await page.getByRole("group", { name: "Chế độ làm sạch" }).getByRole("button", { name: "Rửa nước", exact: true }).click();
      await page.waitForTimeout(1500);
      const lt3 = await page.evaluate(() => window.__lt.splice(0));
      console.log(`[ggh-perf] chuyển rửa nước: tác vụ dài ${lt3.length} (${lt3.join(", ")} ms)`);
      await page.getByLabel("Dòng khói").uncheck();
      await page.getByRole("group", { name: "Chế độ làm sạch" }).getByRole("button", { name: "Thổi hơi", exact: true }).click();
    }
    if (route.endsWith("tren-rua-nuoc")) {
      await page.getByRole("group", { name: "Góc nhìn GGH" }).getByRole("button", { name: "Trên", exact: true }).click();
      await page.getByRole("group", { name: "Chế độ làm sạch" }).getByRole("button", { name: "Rửa nước", exact: true }).click();
    }
    if (route.endsWith("=canh")) await page.getByRole("group", { name: "Góc nhìn GGH" }).getByRole("button", { name: "Cạnh", exact: true }).click();
    // để rô-to quay + cần vòi chạy một đoạn cho thấy vệt sạch
    await page.waitForTimeout(12000);
    if (process.env.SMOKE_PERF && route.endsWith("toan-canh")) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      const sample = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
      const frames = page.evaluate(() => new Promise((done) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(tick); else done(n); }; requestAnimationFrame(tick); }));
      const a = await sample(); const n = await frames; const b = await sample();
      const ms = (k) => ((b[k] - a[k]) * 1000).toFixed(0);
      console.log(`[ggh-perf] script ${ms("ScriptDuration")} ms · layout ${ms("LayoutDuration")} ms · recalc style ${ms("RecalcStyleDuration")} ms · task ${ms("TaskDuration")} ms / 5 s · rAF ${n}`);
    }
  },
};
