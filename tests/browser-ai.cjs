/* Model schema and commitment checks without a DOM or network. */
const assert = require('assert/strict');
const fs = require('fs');
const crypto = require('crypto');
global.window = global;
global.RedPenGrade = require('../demo/static/grade.js');
const values = {};
global.localStorage = {getItem:k=>values[k] || null,setItem:(k,v)=>values[k]=v};
require('../demo/static/browser-ai.js');
(async () => {
  const original = JSON.parse(fs.readFileSync('demo/bank/cubic-lost-root.json'));
  assert(RedPenAI.validate(structuredClone(original),1));
  assert.throws(() => RedPenAI.validate(structuredClone(original),2));
  const invalid = structuredClone(original); invalid.key.errors[0].step = 99;
  assert.throws(() => RedPenAI.validate(invalid,1));
  assert.throws(() => RedPenAI.validateGrade({errors:[],false_alarms:[],bounties:[],feedback:'x'},1));
  assert.throws(() => RedPenAI.save({base:'https://example.com',key:'',model:'x'}));
  assert.throws(() => RedPenAI.save({base:'http://example.com',key:'x',model:'x'}));
  const canonical = RedPenGrade.canonicalize(original.key);
  assert.equal(await RedPenAI.hash(original.key),crypto.createHash('sha256').update(canonical).digest('hex'));
  const tampered = structuredClone(original.key); tampered.clean_final_answer += 'changed';
  assert.notEqual(await RedPenAI.hash(tampered),await RedPenAI.hash(original.key));
  for (let level = 0; level <= 4; level++) {
    const d = structuredClone(original); d.key.level = level;
    const count = [0,1,2,Math.max(3,Math.ceil(.4*d.steps.length)),Math.ceil(.7*d.steps.length)][level];
    d.key.errors = Array.from({length:count},(_,i) => ({...original.key.errors[0], step:i+1, corrupted:d.steps[i]}));
    assert(RedPenAI.validate(d,level));
  }
  console.log('PASS browser schemas for levels 0–4, grade validation, settings, SHA-256 parity and tamper detection');
})().catch(e => {console.error(e);process.exit(1);});
