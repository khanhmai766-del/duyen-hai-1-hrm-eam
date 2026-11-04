import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRatePaths, chartRange } from "../../../modules/ctktkt/lib/ppa-chart-layout.ts";
test("rate paths break at missing readings instead of joining across stopped/missing days", () => {
  assert.deepEqual(buildRatePaths([100,null,110,NaN,120], i=>i, v=>v), ["M0,100 ","M2,110 ","M4,120 "]);
});
test("chart scales keep zero for deltas, preserve true zeros and work with empty or constant data", () => {
  assert.deepEqual(chartRange([],false),[0,1]);
  assert.deepEqual(chartRange([],true),[-1,1]);
  const [min,max]=chartRange([-118,229],true);
  assert.ok(min<=-118 && max>=229 && min<0 && max>0);
  const [low,high]=chartRange([10500,10500],false);
  assert.ok(low<10500 && high>10500);
  assert.equal(buildRatePaths([0],()=>0,v=>v)[0],"M0,0 ");
});
