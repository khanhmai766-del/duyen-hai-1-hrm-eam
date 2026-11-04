(() => {
  if (location.pathname.replace(/^\/tien-ich\/chi-tieu-ktkt/, "").replace(/\/$/,"") !== "/ppa-heat-rate") return;
  const channel="ctktkt-nkvh-ppa", requests=new Map();
  const post=message=>window.postMessage({channel,sender:"nkvh-extension",...message},location.origin);
  window.addEventListener("message",async event=>{
    if(event.source!==window || event.origin!==location.origin) return;
    const data=event.data;
    if(data?.channel!==channel || data.sender!=="ctktkt-web" || data.type!=="OPEN") return;
    if(!/^[a-zA-Z0-9-]{1,80}$/.test(data.requestId) || !/^\d{4}-\d{2}-\d{2}$/.test(data.operatingDate)) return;
    requests.clear(); requests.set(data.requestId,data.operatingDate);
    try {
      const result=await chrome.runtime.sendMessage({type:"OPEN_NKVH",requestId:data.requestId,operatingDate:data.operatingDate});
      post({type:"OPENED",requestId:data.requestId,...result});
    } catch(error) {post({type:"OPENED",requestId:data.requestId,ok:false,error:error.message});}
  });
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(sender.id!==chrome.runtime.id || message?.type!=="NKVH_APPLIED" || requests.get(message.requestId)!==message.operatingDate) return;
    post({type:"APPLY",requestId:message.requestId,operatingDate:message.operatingDate,eventS1:message.eventS1,eventS2:message.eventS2});
    requests.delete(message.requestId);reply({ok:true});
  });
})();
