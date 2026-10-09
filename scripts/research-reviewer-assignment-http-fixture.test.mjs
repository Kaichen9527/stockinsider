import test from 'node:test';
import assert from 'node:assert/strict';
import {oversizedReviewerFixture} from './research-reviewer-assignment-http-fixture.mjs';
test('oversized negative fixture detaches shared original input, preserving every original binding',()=>{
 const input={owner:'synthetic-original',attempt:1,scope:'research_observed_v1'},request={action:'readReviewerAssignment',input,inputHash:'a'.repeat(64)},before=structuredClone(request);const large=oversizedReviewerFixture(request);
 assert.equal(large.input.owner.length,9000);assert.notEqual(large.input,input);assert.deepEqual(request,before);assert.deepEqual({...large,input:{...large.input,owner:input.owner}},request);
});
