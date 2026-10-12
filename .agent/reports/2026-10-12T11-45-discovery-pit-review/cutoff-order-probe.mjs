import assert from 'node:assert/strict';
import { adaptLegacyDiscoveryEvidence as adapt } from './web/src/lib/live-discovery-evidence-adapter.ts';
import { buildPttMentionProvenance } from './web/src/lib/ptt-mention-provenance.ts';
const cutoff='2026-10-12T00:00:00.123456Z', since='2026-10-05T00:00:00Z';
const parent='https://www.ptt.cc/bbs/Stock/M.1791737000.A.123.html', stockId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function row(author='alice', index=1, future=false){
 const source_url=`${parent}#push-${index}`;
 return {id:'bbbbbbbb-bbbb-bbbb-bbbb-000000000001',stock_id:stockId,platform:'ptt',source_url,as_of:since,mentioned_at:since,available_at:since,created_at:future?'2026-10-12T00:00:00.123457Z':since,
 provenance:{ptt:buildPttMentionProvenance({platform:'ptt',documentUrl:source_url,symbol:'2409',metadata:{parent_document_url:parent,author_name:author,comment_index:index,comment_tag:'推',evidence_excerpt:'2409',matched_symbols:['2409'],matched_symbol_reason:'comment_local_tw_symbol_or_name_proximity',retention_mode:'metadata_local_excerpt',body_read_status:'body_read_bounded'}})}};
}
const count=rows=>adapt({symbol:'2409',stockId,rows,since,asOf:cutoff,rowsComplete:false}).summary.explicitPttAuthorsMax;
const known=row(), future=row('bob',1,true), futureOther=row('bob',2,true);
const values={baseline:count([known]),futureSameKeyLast:count([known,future]),futureSameKeyFirst:count([future,known]),futureDifferentKeyLast:count([known,futureOther]),knownUuidDifferentKey:count([known,row('bob',2)])};
assert.deepEqual(values,{baseline:1,futureSameKeyLast:0,futureSameKeyFirst:1,futureDifferentKeyLast:2,knownUuidDifferentKey:2});
console.log(JSON.stringify({subject:'d3ce3c65ecdf37e892d144cb99ee1b9fad7feaac',result:'REQUEST_CHANGES_REPRODUCED',values,notClosurePass:true},null,2));
