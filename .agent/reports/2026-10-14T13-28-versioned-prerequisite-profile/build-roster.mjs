import fs from 'node:fs';import{gzipSync}from'node:zlib';
import {prepareObservedRosterAdmission}from'./original-builder/web/src/lib/research-observed-roster.ts';
const d='./original-builder/docs/research/2026-10-08-discovery-live/';
const r=prepareObservedRosterAdmission({legacyClassification:JSON.parse(fs.readFileSync(new URL(d+'observed-security-classification.json',import.meta.url))),securityScope:JSON.parse(fs.readFileSync(new URL(d+'official-security-scope-reconciliation.json',import.meta.url)))});
fs.writeFileSync(new URL('./prepared-roster.json.gz',import.meta.url),gzipSync(JSON.stringify(r)));console.log(JSON.stringify({snapshotHash:r.snapshotHash,bytes:Buffer.byteLength(r.canonicalPacket),members:r.payload.members.length,excluded:r.payload.excluded.length}));
