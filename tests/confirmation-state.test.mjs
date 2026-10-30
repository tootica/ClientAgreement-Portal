import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmationEmailState} from '../dist/confirmation-state.mjs';

test('only confirmed email delivery claims an email was sent',()=>{
  const sent=confirmationEmailState('sent');
  assert.match(sent.message,/have been sent/);
  assert.equal(sent.badge,'Sent');
  for(const status of ['pending','disabled','review','missing','unknown']) {
    const view=confirmationEmailState(status);
    assert.doesNotMatch(view.message,/have been sent/);
    assert.notEqual(view.badge,'Sent');
  }
});
test('pending delivery offers a status check while download remains the disabled-email fallback',()=>{
  assert.equal(confirmationEmailState('pending').canCheck,true);
  assert.match(confirmationEmailState('pending').message,/queued/);
  assert.equal(confirmationEmailState('disabled').canCheck,false);
  assert.match(confirmationEmailState('disabled').hint,/Download your paid invoice/);
  assert.equal(confirmationEmailState('review').canCheck,true);
});
