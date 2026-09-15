import assert from "node:assert/strict";
import test from "node:test";
import { AiQueueTimeoutError, createAiChatQueue } from "../../lib/ai-chat-queue";

const noAbort = () => new AbortController().signal;

test("vượt số câu hỏi đồng thời thì người sau chờ, được báo vị trí và chạy khi có chỗ", async () => {
  const queue = createAiChatQueue({ maxConcurrent: 1, maxPerWindow: 10, timeoutMs: 1_000 });
  const releaseFirst = await queue.acquire(noAbort());
  const positions: number[] = [];
  let secondStarted = false;
  const second = queue.acquire(noAbort(), (position) => positions.push(position)).then((release) => {
    secondStarted = true;
    return release;
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(secondStarted, false);
  assert.deepEqual(positions, [1]);
  releaseFirst();
  (await second)();
  assert.equal(secondStarted, true);
  assert.deepEqual(queue.snapshot(), { running: 0, waiting: 0 });
});

test("vào trước ra trước: người thứ ba chờ sau người thứ hai", async () => {
  const queue = createAiChatQueue({ maxConcurrent: 1, maxPerWindow: 10, timeoutMs: 1_000 });
  const release = await queue.acquire(noAbort());
  const order: string[] = [];
  const thirdPositions: number[] = [];
  const second = queue.acquire(noAbort()).then((done) => { order.push("hai"); return done; });
  const third = queue.acquire(noAbort(), (position) => thirdPositions.push(position)).then((done) => { order.push("ba"); return done; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(thirdPositions, [2]);
  release();
  (await second)();
  (await third)();
  assert.deepEqual(order, ["hai", "ba"]);
  assert.deepEqual(thirdPositions, [2, 1]);
});

test("hết lượt trong cửa sổ thời gian thì chờ tới khi cửa sổ trôi qua", async () => {
  const queue = createAiChatQueue({ maxConcurrent: 5, maxPerWindow: 2, windowMs: 120, timeoutMs: 1_000 });
  (await queue.acquire(noAbort()))();
  (await queue.acquire(noAbort()))();
  const started = Date.now();
  (await queue.acquire(noAbort()))();
  assert.ok(Date.now() - started >= 90, `chỉ chờ ${Date.now() - started}ms`);
});

test("chờ quá hạn thì báo bận; người huỷ giữa chừng rời hàng, không chặn người sau", async () => {
  const queue = createAiChatQueue({ maxConcurrent: 1, maxPerWindow: 10, timeoutMs: 60 });
  const release = await queue.acquire(noAbort());
  await assert.rejects(queue.acquire(noAbort()), AiQueueTimeoutError);

  const controller = new AbortController();
  const cancelled = queue.acquire(controller.signal);
  const next = queue.acquire(noAbort());
  controller.abort();
  await assert.rejects(cancelled);
  release();
  (await next)();
  assert.deepEqual(queue.snapshot(), { running: 0, waiting: 0 });
});
