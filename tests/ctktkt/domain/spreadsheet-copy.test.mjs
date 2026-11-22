import test from 'node:test';
import assert from 'node:assert/strict';
import {copyBounds,spreadsheetCopyPayload} from '../../../modules/ctktkt/lib/spreadsheet-copy.ts';
import {parseSpreadsheetClipboard} from '../../../modules/ctktkt/lib/spreadsheet-grid.ts';

test('drag selection supports reversed corners, whole rows and whole columns',()=>{
  const a={row:4,column:3},b={row:2,column:1};
  assert.deepEqual(copyBounds(a,b,'cells',14,8),{top:2,bottom:4,left:1,right:3});
  assert.deepEqual(copyBounds(a,b,'rows',14,8),{top:2,bottom:4,left:0,right:7});
  assert.deepEqual(copyBounds(a,b,'columns',14,8),{top:0,bottom:13,left:1,right:3});
});
test('Excel copy retains blank cells, zero, decimal precision and rectangular TSV',()=>{
  const result=spreadsheetCopyPayload([['A1','9681.07','','0'],['A2','85350.47','85561.51','85813.57']]);
  assert.equal(result.text,'A1\t9681.07\t\t0\r\nA2\t85350.47\t85561.51\t85813.57');
  assert.match(result.html,/<td x:num="9681\.07">9681\.07<\/td>/);
  assert.match(result.html,/<td><\/td><td x:num="0">0<\/td>/);
});
test('copied notes cannot inject HTML or turn into spreadsheet formulas',()=>{
  const result=spreadsheetCopyPayload([['<img src=x>','=HYPERLINK("x")','+SUM(A1:A2)','-12.5','a\tb\nc']]);
  assert.ok(!result.html.includes('<img'));
  assert.match(result.html,/&lt;img src=x&gt;/);
  assert.ok(result.text.includes("'=HYPERLINK"));assert.ok(result.text.includes("'+SUM"));
  assert.ok(result.text.includes('\t-12.5\t'));assert.ok(result.text.endsWith('a b c'));
});

test('a meter block pasted back into the web keeps its rows, zero and missing readings',()=>{
  const readings=[['18217.16','18217.160','18217.160'],['89204.792','0','0'],['20045.664','','20045.664']];
  const clipboard=spreadsheetCopyPayload(readings);
  assert.deepEqual(parseSpreadsheetClipboard(clipboard.text,clipboard.html),[
    ['18217.16','18217.16','18217.16'],['89204.792','0','0'],['20045.664','','20045.664'],
  ]);
});
