/** Shared public projection data for unit and loopback browser tests. */
const ref={rankingRunId:'00000000-0000-4000-8000-000000000003',symbol:'1234',signalSession:'2026-10-05'};
const firstRankingRunId='00000000-0000-4000-8000-000000000001';
const base={...ref,schemaVersion:'vnext-launch-outcome-public-v1',policyVersion:'launch-outcomes-v1',firstRankingRunId,
  state:'ready',asOf:'2026-11-05T13:30:00+00:00',outcomeRevision:'a'.repeat(64)};
const unavailableBenchmark={benchmarkReturnPct:null,marketExcessPct:null,netMarketExcessPct:null};
const period={...unavailableBenchmark,horizon:20,state:'ready',terminalSession:'2026-11-02',grossReturnPct:0,netReturnPct:null};
const waiting={...unavailableBenchmark,horizon:60,state:'pending',terminalSession:null,grossReturnPct:null,netReturnPct:null};
const gap={...unavailableBenchmark,horizon:120,state:'calendar_gap',terminalSession:null,grossReturnPct:null,netReturnPct:null};
const threshold={state:'order_unknown',session:'2026-10-12'};
const completed={...base,research:{barrier20:threshold,horizons:[period,waiting,gap]},
  execution:{status:'modeled_fill',nextSession:'2026-10-06',reason:null,grossBarrier20:threshold,
    netBarrier20:{state:'down_first',session:'2026-10-09'},horizons:[{...period,grossReturnPct:20,netReturnPct:19.25,benchmarkReturnPct:10,marketExcessPct:10,netMarketExcessPct:9.25},waiting,gap]}};

const barrier={upFirst:0,downFirst:0,orderUnknown:0,notHit:0,pending:0,waitingObservation:0,dataGap:0};
const opening={filled:0,unfillable:0,pending:0,evidenceGap:0,waitingObservation:0};
const horizons=[20,60,120].map(days=>({days,ready:0,pending:0,waitingObservation:0,dataGap:0,withBenchmark:0,meanReturnPct:null,meanExcessPct:null}));
const emptyTrack={barrier20:barrier,horizons};
const first={cohort:'first',signals:2,observed:1,opening:{...opening,unfillable:1,waitingObservation:1},
 research:{barrier20:{...barrier,waitingObservation:1,dataGap:1},horizons:horizons.map(row=>({...row,waitingObservation:1,dataGap:1}))},
 execution:emptyTrack};
const mature=(meanReturnPct:number,meanExcessPct:number)=>horizons.map(row=>row.days===20?{...row,ready:1,withBenchmark:1,meanReturnPct,meanExcessPct}:{...row,pending:1});
const repeat={cohort:'repeat',signals:1,observed:1,opening:{...opening,filled:1},
 research:{barrier20:{...barrier,upFirst:1},horizons:mature(20,10)},
 execution:{barrier20:{...barrier,orderUnknown:1},horizons:mature(0,-3)}};
const document={schemaVersion:'vnext-launch-outcome-cohorts-v1',fromSession:'2025-11-14',throughSession:'2026-11-13',
  observedThrough:'2026-11-13T13:30:00Z',cohorts:[first,repeat]};

export const outcomeFixture={ref,base,completed,period,waiting,gap};
export const outcomeCohortFixture={document,first,repeat,emptyTrack,barrier,opening};
