import test from 'node:test';
import assert from 'node:assert/strict';
import {installNumberInputWheelGuard} from '../../lib/number-input-wheel.ts';

function harness() {
  let callback;
  const view = {
    document: { activeElement: null },
    addEventListener(type, listener, options) {
      assert.equal(type, 'wheel');
      assert.deepEqual(options, { capture: true, passive: true });
      callback = listener;
    },
    removeEventListener(type, listener, capture) {
      assert.equal(type, 'wheel');
      assert.equal(listener, callback);
      assert.equal(capture, true);
      callback = undefined;
    },
  };
  const dispose = installNumberInputWheelGuard(view);
  return { view, dispose, wheel: target => callback?.({ target }) };
}

test('blurs a focused number input anywhere in the app, even when the wheel targets another element', () => {
  const { view, dispose, wheel } = harness();
  let blurred = 0;
  const input = { tagName: 'INPUT', type: 'number', value: '123.45', blur: () => blurred++ };
  view.document.activeElement = input;
  wheel(input);
  wheel({ tagName: 'DIV' });
  assert.equal(blurred, 2);
  assert.equal(input.value, '123.45');
  dispose();
  wheel(input);
  assert.equal(blurred, 2);
});

test('leaves text, date, select, read-only and disabled fields alone', () => {
  const { view, wheel, dispose } = harness();
  const blur = () => assert.fail('unexpected blur');
  for (const fields of [
    { type: 'text', inputMode: 'decimal' }, { type: 'date' }, { tagName: 'SELECT' },
    { type: 'number', readOnly: true }, { type: 'number', disabled: true },
  ]) {
    view.document.activeElement = { tagName: 'INPUT', ...fields, blur };
    wheel(view.document.activeElement);
  }
  view.document.activeElement = null;
  wheel({ tagName: 'INPUT', type: 'number', blur });
  dispose();
});
