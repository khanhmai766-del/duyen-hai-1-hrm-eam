import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {coalPhotoExpiry} from "../../../modules/ctktkt/lib/coal-photo-retention.ts";
import {readCoalMeterGemini,checkCoalGeminiConnection} from "../../../modules/ctktkt/lib/coal-meter-gemini.ts";
const reading={screen_type:"led_total",meter_label:"1A1",total_display:"8939.810",total_unit:"t",photo_timestamp:null,confidence:"high",note:""};
function mock(result,status=200){return async()=>new Response(JSON.stringify(result),{status,headers:{"Content-Type":"application/json"}});}
const noWait={sleep:async()=>{}};
test("retention follows shift endpoints not upload time, across months and leap day",()=>{
  assert.equal(coalPhotoExpiry("2026-10-25","08"),Date.parse("2026-10-26T16:00:00+07:00"));
  assert.equal(coalPhotoExpiry("2026-10-31","24"),Date.parse("2026-11-02T08:00:00+07:00"));
  assert.equal(coalPhotoExpiry("2028-02-29","16"),Date.parse("2028-03-02T00:00:00+07:00"));
  for(const [date,slot] of [["2026-02-29","08"],["2026-10-25","06"],["bad","08"]]) assert.throws(()=>coalPhotoExpiry(date,slot));
});
test("Gemini keeps visible digits, uses header key, returns parsed JSON",async()=>{
  let called=false;
  const result=await readCoalMeterGemini({data:"test",mediaType:"image/jpeg"},"test-key","model-test",async(url,options)=>{
    called=true;assert.ok(!url.includes("test-key"));assert.equal(options.headers["x-goog-api-key"],"test-key");
    return mock({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify(reading)}]}}]})();// response only
  });
  assert.ok(called);assert.equal(result.total_display,"8939.810");
});

test("OCR request checks dot-matrix 0/8 strokes without rewriting visible totals",async()=>{
  for(const total of ["30122.960","88824.149","80808.080"]){
    const result=await readCoalMeterGemini({data:"synthetic-image",mediaType:"image/jpeg"},"synthetic-key","test",async(url,options)=>{
      const prompt=JSON.parse(options.body).systemInstruction.parts[0].text;
      assert.match(prompt,/slash inside 0 is NOT the middle horizontal bar of 8/);
      assert.match(prompt,/SAME display\/font/);
      assert.match(prompt,/right to left/);
      assert.match(prompt,/total_display null and confidence "low"/);
      assert.match(prompt,/Never globally change 0 to 8 or 8 to 0/);
      return mock({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify({...reading,total_display:total})}]}}]})();
    });
    assert.equal(result.total_display,total);
  }
});

test("ambiguous 0/8 remains unreadable and low confidence for manual review",async()=>{
  const unclear={...reading,total_display:null,confidence:"low",note:"Chưa phân biệt được 0/8 ở chữ số thứ 2; nhập tay hoặc chụp lại ảnh."};
  const result=await readCoalMeterGemini({data:"synthetic-image",mediaType:"image/jpeg"},"synthetic-key","test",
    mock({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify(unclear)}]}}]}));
  assert.equal(result.total_display,null);
  assert.equal(result.confidence,"low");
  assert.match(result.note,/0\/8/);
});
test("Gemini rejects hallucinated units, invalid schema, truncated output and quota failure",async()=>{
  for(const value of [{...reading,total_unit:"t/h"},{...reading,confidence:"certain"}]) {
    await assert.rejects(()=>readCoalMeterGemini({data:"x",mediaType:"image/jpeg"},"key","test",mock({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify(value)}]}}]})));
  }
  await assert.rejects(()=>readCoalMeterGemini({data:"x",mediaType:"image/jpeg"},"key","test",mock({candidates:[{finishReason:"MAX_TOKENS"}]})));
  await assert.rejects(()=>readCoalMeterGemini({data:"x",mediaType:"image/jpeg"},"key","test",mock({},429)),error=>error.status===429);
});
test("network errors and timeouts become actionable errors without leaking provider details",async()=>{
  for (const [name,status,word] of [["TimeoutError",504,"45 giây"],["AbortError",504,"45 giây"],["TypeError",502,"kết nối"]]) {
    await assert.rejects(()=>readCoalMeterGemini({data:"x",mediaType:"image/jpeg"},"private-key","test",async()=>{
      throw Object.assign(new Error("provider debug private-key"),{name});
    },noWait),error=>error.status===status&&error.message.includes(word)&&!error.message.includes("private-key"));
  }
});
test("connection check runs a bounded text generation with raw key in the header only",async()=>{
  const result=await checkCoalGeminiConnection("private-key","gemini-test",async(url,options)=>{
    assert.equal(url,"https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
    assert.equal(options.method,"POST");assert.equal(options.headers["x-goog-api-key"],"private-key");
    assert.equal(new Headers(options.headers).has("Authorization"),false);
    const body=JSON.parse(options.body);assert.ok(body.generationConfig.maxOutputTokens<=256);
    assert.ok(!options.body.includes("private-key"));assert.ok(!options.body.includes("inlineData"));
    return mock({candidates:[{finishReason:"STOP",content:{parts:[{text:"OK"}]}}]})();
  });
  assert.match(result.message,/Đã gọi thử Gemini thành công/);assert.ok(!JSON.stringify(result).includes("private-key"));
});
test("connection probe rejects metadata-only success, auth errors and unavailable network without exposing secrets",async()=>{
  await assert.rejects(()=>checkCoalGeminiConnection("private-key","gemini-test",mock({error:{message:"private-key",details:[{reason:"API_KEY_INVALID"}]}},400)),error=>error.message.includes("Khóa Gemini")&&error.message.includes("HTTP 400")&&!error.message.includes("private-key"));
  await assert.rejects(()=>checkCoalGeminiConnection("private-key","gemini-test",mock({models:[{name:"models/gemini-test",supportedGenerationMethods:["embedContent"]}]})),error=>error.status===502);
  await assert.rejects(()=>checkCoalGeminiConnection("private-key","gemini-test",mock({name:"models/gemini-test",supportedGenerationMethods:["generateContent"]})),error=>error.status===502);
  await assert.rejects(()=>checkCoalGeminiConnection("private-key","gemini-test",mock({})),error=>error.status===502);
  await assert.rejects(()=>checkCoalGeminiConnection("private-key","gemini-test",async()=>{throw new Error("secret private-key");}),error=>error.status===504&&!error.message.includes("private-key"));
  const capped=await checkCoalGeminiConnection("private-key","gemini-test",mock({candidates:[{finishReason:"MAX_TOKENS"}]}));
  assert.match(capped.message,/Đã gọi thử Gemini thành công/);
  await assert.rejects(()=>checkCoalGeminiConnection("private-key","gemini-test",mock({candidates:[{finishReason:"SAFETY"}]})),error=>error.status===502);
  await assert.rejects(()=>checkCoalGeminiConnection("private-key","gemini-test",mock({},503)),error=>error.status===503&&error.message.includes("503"));
});
test("401 identifies authentication instead of image legibility, with only a safe reason",async()=>{
  const failure={error:{message:"secret private-key",details:[{reason:"ACCESS_TOKEN_TYPE_UNSUPPORTED"},{reason:"secret private-key"}]}};
  await assert.rejects(()=>readCoalMeterGemini({data:"x",mediaType:"image/jpeg"},"private-key","test",mock(failure,401)),error=>error.message.includes("lỗi xác thực")&&error.message.includes("ACCESS_TOKEN_TYPE_UNSUPPORTED")&&!error.message.includes("private-key"));
});
test("provider key, permission, model, quota and service errors stay distinct and redact raw messages",async()=>{
  for (const [status,reason,word] of [[400,"API_KEY_INVALID","Khóa Gemini"],[403,"","quyền"],[404,"","model"],[429,"","hạn mức"],[503,"","dịch vụ"]]) {
    await assert.rejects(()=>readCoalMeterGemini({data:"x",mediaType:"image/jpeg"},"private-key","test",mock({error:{message:"secret private-key",details:[{reason}]}},status),noWait),
      error=>error.message.toLowerCase().includes(word.toLowerCase())&&!error.message.includes("private-key"));
  }
  await assert.rejects(()=>readCoalMeterGemini({data:"x",mediaType:"image/jpeg"},"private-key","test",async()=>new Response("upstream html")),error=>error.status===502&&error.message.includes("không hợp lệ"));
});
test("archive access is owner-scoped and expiry-gated; cleanup never deletes operating readings",()=>{
  const route=readFileSync(new URL("../../../modules/ctktkt/server/routes/coal-meter-photos/route.ts",import.meta.url),"utf8");
  assert.ok(route.includes("owner_id=? AND expires_at>?"));
  assert.ok(route.includes("getSessionUser()"));
  const store=readFileSync(new URL("../../../modules/ctktkt/lib/coal-photo-store.ts",import.meta.url),"utf8");
  assert.ok(store.includes("DELETE FROM coal_meter_photos WHERE expires_at <= ?"));
  assert.ok(!store.includes("DELETE FROM daily_inputs"));
  const component=readFileSync(new URL("../../../modules/ctktkt/components/coal-meter-photo-import.tsx",import.meta.url),"utf8");
  assert.ok(!component.includes("matchCoalMeter("));
  assert.ok(component.includes("write: false"));
  const routeOcr=readFileSync(new URL("../../../modules/ctktkt/server/routes/coal-meter-ocr/route.ts",import.meta.url),"utf8");
  assert.ok(routeOcr.includes("reserveCoalPhotoRead(user.id)"));
  assert.ok(routeOcr.includes("GEMINI_API_KEY"));
  assert.ok(!routeOcr.includes("ANTHROPIC_API_KEY"));
});

test("temporary Gemini overload (503) is retried with backoff, then reads normally",async()=>{
  const statuses=[503,503,200],waits=[];let calls=0;
  const result=await readCoalMeterGemini({data:"x",mediaType:"image/jpeg"},"key","test",async()=>{
    const status=statuses[calls++];
    return status===200?mock({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify(reading)}]}}]})():mock({error:{message:"high demand"}},status)();
  },{sleep:async ms=>{waits.push(ms);}});
  assert.equal(calls,3);assert.deepEqual(waits,[2000,5000]);assert.equal(result.total_display,"8939.810");
});
test("persistent overload reports how many retries ran; quota (429) and auth errors are not retried",async()=>{
  let calls=0;
  await assert.rejects(()=>readCoalMeterGemini({data:"x",mediaType:"image/jpeg"},"key","test",async()=>{calls++;return mock({},503)();},noWait),
    error=>error.status===503&&error.message.includes("Đã tự thử lại 2 lần")&&error.message.includes("HTTP 503"));
  assert.equal(calls,3);
  for(const status of [429,401,400]){
    calls=0;
    await assert.rejects(()=>readCoalMeterGemini({data:"x",mediaType:"image/jpeg"},"key","test",async()=>{calls++;return mock({},status)();},noWait),error=>error.status!==undefined);
    assert.equal(calls,1,`HTTP ${status}`);
  }
});
test("retries stay inside the route time budget",async()=>{
  let clock=0,calls=0;
  await assert.rejects(()=>readCoalMeterGemini({data:"x",mediaType:"image/jpeg"},"key","test",async()=>{calls++;clock+=46000;return mock({},503)();},{sleep:async ms=>{clock+=ms;},now:()=>clock}),
    error=>error.status===503);
  assert.equal(calls,1);
});

test("image calls use a compact response schema and supported low-latency thinking levels",async()=>{
  for(const [model,level] of [["gemini-3.5-flash-lite","minimal"],["gemini-3.8-flash","low"],["gemini-custom",undefined]]){
    await readCoalMeterGemini({data:"synthetic-image",mediaType:"image/jpeg"},"synthetic-key",model,async(url,options)=>{
      const body=JSON.parse(options.body),cfg=body.generationConfig;
      assert.equal(cfg.thinkingConfig?.thinkingLevel,level);
      assert.equal(cfg.responseSchema.type,"OBJECT");
      assert.deepEqual(cfg.responseSchema.required,Object.keys(reading));
      assert.deepEqual(cfg.responseSchema.properties.total_display,{type:"STRING",nullable:true});
      assert.equal(cfg.responseMimeType,"application/json");
      return mock({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify(reading)}]}}]})();
    });
    await checkCoalGeminiConnection("synthetic-key",model,async(url,options)=>{
      assert.equal(JSON.parse(options.body).generationConfig.thinkingConfig?.thinkingLevel,level);
      return mock({candidates:[{finishReason:"STOP"}]})();
    });
  }
});
