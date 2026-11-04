import test from "node:test";
import assert from "node:assert/strict";
import {coalGeminiConfig,coalGeminiRequestHeaders,DEFAULT_COAL_GEMINI_MODEL} from "../../../modules/ctktkt/lib/coal-gemini-config.ts";
import {readCoalMeterGemini} from "../../../modules/ctktkt/lib/coal-meter-gemini.ts";
const own="test-own-key-"+"a".repeat(32),server="test-server-key-"+"b".repeat(32);
test("temporary Gemini key works without Vercel environment",()=>{
  const config=coalGeminiConfig(new Headers({"x-coal-gemini-key":own}));
  assert.deepEqual(config,{ok:true,key:own,model:DEFAULT_COAL_GEMINI_MODEL});
});
test("temporary key/model never persist or modify server credentials",()=>{
  const headers=new Headers({"x-coal-gemini-key":own,"x-coal-gemini-model":"gemini-test"});
  assert.deepEqual(coalGeminiConfig(headers,server,"gemini-server"),{ok:true,key:own,model:"gemini-test"});
  assert.deepEqual(coalGeminiConfig(new Headers({"x-coal-gemini-model":"gemini-costly"}),server,"gemini-server"),{ok:true,key:server,model:"gemini-server"});
  assert.equal(coalGeminiConfig(new Headers()).ok,false);
});
test("reject invalid key/model without echoing sensitive input",()=>{
  for(const key of ["x","@".repeat(40),"a".repeat(257)]) {
    const config=coalGeminiConfig(new Headers({"x-coal-gemini-key":key}));assert.equal(config.ok,false);assert.ok(!JSON.stringify(config).includes(key));
  }
  assert.equal(coalGeminiConfig(new Headers({"x-coal-gemini-key":own,"x-coal-gemini-model":"https://elsewhere.test"})).ok,false);
});
test("AQ auth key remains byte-for-byte unchanged from browser headers to Google OCR",async()=>{
  // Synthetic shape only: never put a user's credential in a test fixture.
  const aq="AQ."+"x".repeat(47)+"_-X";
  const config=coalGeminiConfig(new Headers(coalGeminiRequestHeaders(` ${aq} `," gemini-test ")),server,"gemini-server");
  assert.equal(config.ok,true);assert.equal(config.key,aq);assert.equal(config.model,"gemini-test");
  await readCoalMeterGemini({data:"fake-image",mediaType:"image/jpeg"},config.key,config.model,async(url,options)=>{
    assert.equal(options.headers["x-goog-api-key"],aq);
    assert.equal(new Headers(options.headers).has("Authorization"),false);
    assert.ok(!url.includes(aq));assert.ok(!options.body.includes(aq));
    return Response.json({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify({screen_type:"led_total",meter_label:"1A1",total_display:"12345.678",total_unit:"t",photo_timestamp:null,confidence:"high",note:""})}]}}]});
  });
});
test("switching to shared key removes temporary key and model headers",()=>{
  const headers=new Headers(coalGeminiRequestHeaders("","gemini-other"));
  assert.equal(headers.has("x-coal-gemini-key"),false);assert.equal(headers.has("x-coal-gemini-model"),false);
  assert.deepEqual(coalGeminiConfig(headers,server,"gemini-server"),{ok:true,key:server,model:"gemini-server"});
});
