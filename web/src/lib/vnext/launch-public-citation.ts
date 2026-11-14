import {types} from 'node:util';
import {publicCitation} from './citations.ts';

export const LAUNCH_PUBLIC_RIGHTS_SCHEMA='launch-public-rights-v1';
export const LAUNCH_PUBLIC_LICENSE='Taiwan Open Government Data License 1.0';
export const LAUNCH_PUBLIC_LICENSE_URL='https://data.gov.tw/license';
export const LAUNCH_PUBLIC_ATTRIBUTION='Securities and Futures Bureau, Financial Supervisory Commission';
const datasets=[11370,11371,11856,11391,11755] as const;
type Dataset=typeof datasets[number];
export type LaunchPublicCitation={id:string;url:string;contentHash:string;sourceRevision:string;publicRights:{
  schemaVersion:typeof LAUNCH_PUBLIC_RIGHTS_SCHEMA;datasetId:Dataset;license:typeof LAUNCH_PUBLIC_LICENSE;
  licenseUrl:typeof LAUNCH_PUBLIC_LICENSE_URL;attribution:typeof LAUNCH_PUBLIC_ATTRIBUTION;rightsRevision:string}};
type Row=Record<string,unknown>;
function closed(value:unknown,keys:string):value is Row{
  if(!value||typeof value!=='object'||Array.isArray(value)||types.isProxy(value)
    ||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
  const descriptors=Object.getOwnPropertyDescriptors(value),names=keys.split(' ');
  return Reflect.ownKeys(descriptors).length===names.length&&names.every(key=>descriptors[key]?.enumerable
    &&Object.hasOwn(descriptors[key],'value'));
}
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
/** Public-output DTO validation, never a grant/registration API. SQL must
 * independently join a genuine immutable capture/profile and CURRENT source
 * permission to derive these IDs/hashes. A caller-supplied hash is no authority.
 * This first closed public profile exposes only the five independently checked
 * licensed dataset landing pages. Other research/IR/member rights stay unknown;
 * their original links remain private instead of being silently rewritten. */
export function parseLaunchPublicCitation(value:unknown):LaunchPublicCitation|null{
  if(!closed(value,'id url contentHash sourceRevision publicRights')||!hash(value.contentHash)||!uuid(value.sourceRevision)
    ||!closed(value.publicRights,'schemaVersion datasetId license licenseUrl attribution rightsRevision'))return null;
  const rights=value.publicRights;
  if(rights.schemaVersion!==LAUNCH_PUBLIC_RIGHTS_SCHEMA||!datasets.includes(rights.datasetId as Dataset)
    ||rights.license!==LAUNCH_PUBLIC_LICENSE||rights.licenseUrl!==LAUNCH_PUBLIC_LICENSE_URL
    ||rights.attribution!==LAUNCH_PUBLIC_ATTRIBUTION||!hash(rights.rightsRevision))return null;
  const datasetId=rights.datasetId as Dataset,url=`https://data.gov.tw/dataset/${datasetId}`;
  if(value.id!==`licensed-dataset:${datasetId}:${value.sourceRevision}`||value.url!==url||publicCitation(value.url)!==url)return null;
  return {id:value.id,url,contentHash:value.contentHash,sourceRevision:value.sourceRevision,publicRights:{
    schemaVersion:LAUNCH_PUBLIC_RIGHTS_SCHEMA,datasetId,license:LAUNCH_PUBLIC_LICENSE,
    licenseUrl:LAUNCH_PUBLIC_LICENSE_URL,attribution:LAUNCH_PUBLIC_ATTRIBUTION,rightsRevision:rights.rightsRevision}};
}
