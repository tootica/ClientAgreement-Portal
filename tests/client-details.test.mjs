import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateClientDetails,clientDetailsLines} from '../dist/client-details.mjs';
import {clientDetails} from './client-fixture.mjs';

test('client details normalize phone, email and optional tax reference', () => {
  const result = validateClientDetails({...clientDetails,clinicName:' Example Clinic ',phone:'9876543210',email:'client@EXAMPLE.COM',gstin:'29abcde1234f1z5'});
  assert.equal(result.valid,true);
  assert.equal(result.value.phone,'+919876543210');
  assert.equal(result.value.email,'client@example.com');
  assert.equal(result.value.gstin,'29ABCDE1234F1Z5');
  assert.equal(result.value.clinicName,'Example Clinic');
});
test('client details reject missing fields, invalid contacts, unsupported addresses and control characters', () => {
  for (const field of ['clinicName','contactName','email','phone','addressLine1','city','state','postalCode']) {
    const result=validateClientDetails({...clientDetails,[field]:''});
    assert.equal(result.valid,false,field);
    assert.ok(result.errors[field],field);
  }
  for (const change of [{phone:'123'},{phone:'++919876543210'},{postalCode:'012345'},{postalCode:'56000'},{gstin:'invalid'},{country:'Other'},{clinicName:'bad\r\nname'},{addressLine1:'x'.repeat(161)}]) assert.equal(validateClientDetails({...clientDetails,...change}).valid,false);
  assert.equal(validateClientDetails(clientDetails).valid,true);
  for (const phone of ['987654321','98765432101','98765 43210','98765abc10','+19876543210']) assert.ok(validateClientDetails({...clientDetails,phone}).errors.phone,phone);
});
test('review lines include clinic, contact and full billing details without optional empty lines', () => {
  const lines=clientDetailsLines(clientDetails);
  assert.ok(lines.includes(clientDetails.clinicName));
  assert.ok(lines.includes(clientDetails.phone));
  assert.ok(lines.some(line=>line.includes(clientDetails.postalCode)));
  assert.ok(!lines.some(line=>line.startsWith('GSTIN:')));
});
