// Chỉ liệt kê máy chủ mà manifest có quyền truy cập: bản nộp kho (đã bỏ localhost) chỉ còn duyenhai1.vn.
const SERVERS = [
  ["production", "https://duyenhai1.vn", "duyenhai1.vn (chính thức)"],
  ["local3030", "http://localhost:3030", "localhost:3030 (thử nghiệm)"],
  ["local3000", "http://localhost:3000", "localhost:3000 (thử nghiệm)"],
];
const allowed = chrome.runtime.getManifest().host_permissions || [];
const select = document.getElementById("server");
const saved = document.getElementById("saved");

for (const [value, origin, label] of SERVERS) {
  if (!allowed.includes(`${origin}/*`)) continue;
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}
if (select.options.length < 2) select.disabled = true;

chrome.storage.local.get("server").then(({ server }) => {
  if (server && [...select.options].some((option) => option.value === server)) select.value = server;
});

select.addEventListener("change", async () => {
  await chrome.storage.local.set({ server: select.value });
  saved.textContent = "Đã lưu. Tải lại trang NKVH để áp dụng.";
});
