chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({url: chrome.runtime.getURL("app.html")});
});

function isWeb(url) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\/tien-ich\/chi-tieu-ktkt/, "").replace(/\/$/, "") === "/ppa-heat-rate" &&
      (["https://ctktkt-dashboard.vercel.app","https://duyenhai1.vn","https://ctktkt.duyenhai1.vn"].includes(u.origin) || (u.protocol === "http:" && ["localhost","127.0.0.1"].includes(u.hostname)));
  } catch { return false; }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!["OPEN_NKVH", "NKVH_CONTEXT", "NKVH_APPLY"].includes(message?.type)) return;
  (async () => {
    if (message.type === "OPEN_NKVH") {
      if (!sender.tab?.id || !isWeb(sender.url) || !/^\d{4}-\d{2}-\d{2}$/.test(message.operatingDate) || !/^[a-zA-Z0-9-]{1,80}$/.test(message.requestId)) throw new Error("Yêu cầu mở không hợp lệ.");
      // Register context before loading the picker so its startup cannot race.
      const tab = await chrome.tabs.create({url:"about:blank",active:true});
      await chrome.storage.session.set({["picker:"+tab.id]:{webTab:sender.tab.id,date:message.operatingDate,requestId:message.requestId}});
      await chrome.tabs.update(tab.id,{url:chrome.runtime.getURL("app.html")});
      return {ok:true};
    }
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("app.html")) throw new Error("Nguồn yêu cầu không hợp lệ.");
    const key="picker:"+message.pickerTabId;
    const context=(await chrome.storage.session.get(key))[key];
    if (message.type === "NKVH_CONTEXT") return {ok:true,context:context || null};
    if (!context || context.date !== message.operatingDate) throw new Error("Phiên đồng bộ đã hết hoặc ngày không khớp. Bấm đồng bộ lại trên web.");
    if (typeof message.eventS1 !== "string" || typeof message.eventS2 !== "string" || message.eventS1.length>1000 || message.eventS2.length>1000) throw new Error("Rút gọn nội dung còn tối đa 1.000 ký tự/tổ máy trước khi đưa vào web.");
    if (!message.eventS1.trim() && !message.eventS2.trim()) throw new Error("Chưa có nội dung được chọn.");
    const webTab=await chrome.tabs.get(context.webTab);
    if(!isWeb(webTab.url)) throw new Error("Trang PPA đã đóng hoặc chuyển sang mục khác.");
    await chrome.tabs.sendMessage(context.webTab,{type:"NKVH_APPLIED",requestId:context.requestId,operatingDate:context.date,eventS1:message.eventS1,eventS2:message.eventS2});
    await chrome.storage.session.remove(key);
    await chrome.tabs.update(context.webTab,{active:true});
    return {ok:true};
  })().then(reply,error=>reply({ok:false,error:error.message}));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => { chrome.storage.session.remove("picker:"+tabId); });
