import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldBlurNumberInputOnWheel} from '../../modules/ctktkt/components/spreadsheet-input-behavior.tsx';

const input=(type,inKtkt=true)=>({tagName:'INPUT',type,closest:sel=>inKtkt&&sel.includes('.ctktkt')?{}:null});

test('lăn chuột trên ô số KTKT đang chọn thì bỏ chọn để số không tự đổi',()=>{
 const el=input('number');
 assert.equal(shouldBlurNumberInputOnWheel(el,el),true);
});
test('không đụng ô chưa chọn, ô chữ hoặc ô số ngoài mục KTKT',()=>{
 const el=input('number');
 assert.equal(shouldBlurNumberInputOnWheel(el,null),false);
 const text=input('text');assert.equal(shouldBlurNumberInputOnWheel(text,text),false);
 const outside=input('number',false);assert.equal(shouldBlurNumberInputOnWheel(outside,outside),false);
 assert.equal(shouldBlurNumberInputOnWheel(null,null),false);
});
