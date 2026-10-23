/** Synthetic transport metadata only; not native roster acquisition/approval. */
import test from 'node:test';import assert from 'node:assert/strict';
import {currentPreparationInstrument as select} from './preparation-trading-identity.ts';
const stockId='10000000-0000-4000-8000-000000000001';
const scope={stockId,symbol:'2330',cutoff:'2026-10-23T05:30:00.000Z'};
const row=(patch:Record<string,unknown>={})=>({instrument_authority_id:'20000000-0000-4000-8000-000000000001',stock_id:stockId,symbol:'2330',exchange:'TWSE',instrument_type:'common_stock',listing_status:'active',provider:'twse',source_timestamp:'2026-10-22T05:30:00.000Z',valid_from:'2026-10-22T05:30:00.000Z',valid_to:null,roster_version:'tw-instrument-roster-v3.0',recorded_at:'2026-10-22T05:31:00.000000+00:00',...patch});
test('current finite official tuple returns an immutable copy without inventing an age expiry',()=>{
 const value=row({source_timestamp:'2020-01-01T00:00:00Z',valid_from:'2020-01-01T00:00:00Z',recorded_at:'2020-01-02T00:00:00Z'});const actual=select([value],scope);assert.equal(actual.status,'current');if(actual.status!=='current')throw Error('unreachable');assert.deepEqual(actual.instrument,value);assert.notEqual(actual.instrument,value);
});
test('new suspended/delisted head is never hidden behind an earlier active row',()=>{
 for(const listing_status of ['suspended','delisted']){const head=row({instrument_authority_id:'20000000-0000-4000-8000-000000000002',recorded_at:'2026-10-23T05:29:00Z',listing_status});assert.equal(select([row(),head],scope).status,'gap');assert.equal(select([head,row()],scope).status,'gap');}
});
test('missing, future, expired and equal-clock conflicting authority cannot produce current identity',()=>{
 assert.equal(select([],scope).status,'gap');
 for(const patch of [{recorded_at:'2099-01-01T00:00:00Z'},{source_timestamp:'2099-01-01T00:00:00Z'},{valid_from:'2099-01-01T00:00:00Z'},{valid_to:'2026-10-23T00:00:00Z'},{provider:'finmind'},{roster_version:'unknown'},{recorded_at:'2026-02-30T00:00:00Z'},{recorded_at:'infinity'}])assert.equal(select([row(patch)],scope).status,'gap');
 assert.equal(select([row(),row({instrument_authority_id:'20000000-0000-4000-8000-000000000002',listing_status:'suspended'})],scope).status,'gap');
});
test('actual microsecond ordering is preserved instead of collapsing two heads to milliseconds',()=>{
 const a=row({recorded_at:'2026-10-23T05:29:00.123456+00:00'}),b=row({instrument_authority_id:'20000000-0000-4000-8000-000000000002',recorded_at:'2026-10-23T05:29:00.123457+00:00',listing_status:'suspended'});
 assert.equal(select([a,b],scope).status,'gap');
 const back=select([{...a,listing_status:'suspended'},{...b,listing_status:'active'}],scope);assert.equal(back.status,'current');
});
test('cross-stock, current cross-symbol, unknown fields/types and overflow remain gaps',()=>{
 for(const values of [[row({stock_id:'30000000-0000-4000-8000-000000000001'})],[row(),row({instrument_authority_id:'20000000-0000-4000-8000-000000000002',symbol:'2408'})],[row({approved:true})],[row({exchange:true})],Array.from({length:1001},()=>row())])assert.equal(select(values,scope).status,'gap');
});
