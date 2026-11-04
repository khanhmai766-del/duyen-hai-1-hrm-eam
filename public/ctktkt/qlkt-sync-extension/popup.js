const targetInput = document.getElementById("targetUrl");
const openDashboardButton = document.getElementById("openDashboardButton");
const status = document.getElementById("status");
const DEFAULT_TARGET_URL = "https://ctktkt-dashboard.vercel.app/";
const LEGACY_LOCAL_TARGET = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::5173)?\/?$/i;

const sourceIds = {
  production: "source-production",
  fuel: "source-fuel",
  operation: "source-operation",
  meter: "source-meter",
  heatrate: "source-heatrate",
  pmis_02pd: "source-pmis_02pd",
};

function setBusy(busy) {
  openDashboardButton.disabled = busy;
}

async function refreshSources() {
  const { qlktPages = {} } = await chrome.storage.local.get({ qlktPages: {} });
  Object.entries(sourceIds).forEach(([key, id]) => {
    const element = document.getElementById(id);
    const ready = Boolean(qlktPages[key]);
    element.textContent = ready ? "Đã ghi nhớ" : "Chưa nhận diện";
    element.classList.toggle("ready", ready);
  });
}

async function recognizeActivePage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\/qlkt\.tpcduyenhai\.com\.vn\/qlkt\//i.test(tab.url || "")) return;
    const result = await chrome.tabs.sendMessage(tab.id, { type: "GET_QLKT_PAGE_KIND" });
    if (result?.pageKind) {
      await new Promise(resolve => setTimeout(resolve, 100));
      await refreshSources();
    }
  } catch {
    // Trang có thể vừa tải lại; lần mở tiện ích tiếp theo sẽ thử lại.
  }
}

chrome.storage.local.get({ targetUrl: DEFAULT_TARGET_URL }, value => {
  targetInput.value = LEGACY_LOCAL_TARGET.test(value.targetUrl) ? DEFAULT_TARGET_URL : value.targetUrl;
});
refreshSources();
recognizeActivePage();

openDashboardButton.addEventListener("click", async () => {
  status.textContent = "Đang mở trang Dữ liệu các tháng…";
  setBusy(true);
  try {
    const target = new URL(targetInput.value.trim());
    if (!/^https?:$/.test(target.protocol)) throw new Error("Địa chỉ web chỉ tiêu không hợp lệ.");
    const dashboard = new URL("/", target);
    await chrome.storage.local.set({ targetUrl: dashboard.toString() });
    await chrome.tabs.create({ url: dashboard.toString() });
    window.close();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Chưa mở được trang web.";
    setBusy(false);
    refreshSources();
  }
});
