const {test}=require('node:test');
const assert=require('node:assert/strict');
const beacon=require('../fixtures/round-100.json');
const {verifyBeacon}=require('../scripts/reference.cjs');

test('official quicknet fixture has a valid BLS signature',()=>{
  assert.doesNotThrow(()=>verifyBeacon(beacon));
});
test('a valid beacon signature fails for another round',()=>{
  assert.throws(()=>verifyBeacon({...beacon,round:beacon.round+1}),/BLS signature/);
});
test('a tampered randomness digest is rejected',()=>{
  assert.throws(()=>verifyBeacon({...beacon,randomness:'0'.repeat(64)}),/Invalid beacon/);
});
