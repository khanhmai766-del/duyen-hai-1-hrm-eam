import assert from "node:assert/strict";
import test from "node:test";
import { tagsInText } from "../lib/server/soot-blower-tree-defects";

const tags = (text: string) => [...tagsInText(text)].sort();

test("GGH: phiếu nói rõ vòi thổi bụi trên/dưới GGH (câu thật trên phiếu SYC)", () => {
  assert.deepEqual(tags("Kiểm tra xử lý đứt dây nguồn động cơ vòi thổi bụi trên GGH FGD S2 (20HTB10GS101-TOP) gấp"), ["GGH-TREN"]);
  assert.deepEqual(tags("Kiểm tra xử lý van điện cấp nước rửa cao áp vòi trên/dưới GGH FGD S1 không đóng mở được trên DCS và Local"), ["GGH-DUOI", "GGH-TREN"]);
  assert.deepEqual(tags("Tháo PT (10HTB30CP005) đo áp suất rửa cao áp vòi thổi bụi dưới lắp cho PT (10HTB30CP004)"), ["GGH-DUOI"]);
});

test("GGH: KKS tủ tại chỗ của cần vòi -TOP / -BOT", () => {
  assert.deepEqual(tags("Xử lý xì hơi mặt ghép (20HTB10GS101-TOP)"), ["GGH-TREN"]);
  assert.deepEqual(tags("Lắp lại thanh ray rửa cao áp (20htb10gs101-top/bot)"), ["GGH-DUOI", "GGH-TREN"]);
});

test("GGH: không quy về vòi khi phiếu không nói trên/dưới hoặc không phải vòi", () => {
  assert.deepEqual(tags("Kiểm tra xử lý đồng hồ đo áp suất tại chỗ PI quạt gió chèn gối đỡ trên, dưới và đầu vào vòi thổi bụi GGH báo sai"), []);
  assert.deepEqual(tags("Kiểm tra, xử lý Transmitter đo chênh áp khói thô/sạch GGH FGD S2 báo sai"), []);
  assert.deepEqual(tags("Xử đèn chiếu sáng khu vực GGH FGD S1 và S2 bị nhảy CB"), []);
  assert.deepEqual(tags("Kiểm tra xử lý động cơ phụ GGH(10HTB10AE002) vận hành bị trip"), []);
});

test("GGH: 'vòi trên/dưới' ngoài ngữ cảnh GGH thì không tính", () => {
  assert.deepEqual(tags("Xử lý rò van tay vòi trên bồn nước sinh hoạt"), []);
});
