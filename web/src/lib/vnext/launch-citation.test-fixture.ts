import type {LaunchPublicCitation} from './launch-public-citation.ts';
/** Inert test-only addresses and permissions; no source, capture or rights authority. */
export const unsafeCitationUrls=[
  'https://www.investanchors.com/user/vip_contents/SYNTHETIC_ONLY',
  'https://www.investanchors.com/%75ser/%76ip_contents/SYNTHETIC_ONLY',
  'https://www.investanchors.com/%2575ser/%2576ip_contents/SYNTHETIC_ONLY',
  'https://www.investanchors.com/user%2Fvip_contents/SYNTHETIC_ONLY',
  'https://www.investanchors.com/member/SYNTHETIC_ONLY',
  'https://www.investanchors.com/membership/SYNTHETIC_ONLY',
  'https://www.investanchors.com/paidcontent/SYNTHETIC_ONLY',
  'https://www.investanchors.com/%256dembership/SYNTHETIC_ONLY',
  'https://www.investanchors.com/public?section=membership',
  'https://click.example.org/track/click?u=SYNTHETIC_ONLY',
  'https://example.org/redirect?to=SYNTHETIC_ONLY',
  'https://example.org/read?redirect_uri=https%3A%2F%2Fexample.net%2F',
  'https://example.org/read?url=https%3A%2F%2Fexample.net%2F',
  'https://example.org/read?utm_campaign=SYNTHETIC_ONLY',
  'https://example.org/read?access_token=SYNTHETIC_ONLY',
  'https://example.org/read?ACCESS-TOKEN=SYNTHETIC_ONLY',
  'https://example.org/read?%61ccess%5ftoken=SYNTHETIC_ONLY',
  'https://example.org/read?%2561ccess%255ftoken=SYNTHETIC_ONLY',
  'https://example.org/read?%EF%BD%81ccess_token=SYNTHETIC_ONLY',
  'https://example.org/read?api_key=SYNTHETIC_ONLY',
  'https://example.org/read?my_auth=SYNTHETIC_ONLY',
  'https://example.org/read?x_sig=SYNTHETIC_ONLY',
  'https://example.org/read?my%255fauth=SYNTHETIC_ONLY',
  'https://example.org/read?x%255fsig=SYNTHETIC_ONLY',
  'https://example.org/read?foo=access_token%253DSYNTHETIC_ONLY',
  'https://example.org/read#access_token=SYNTHETIC_ONLY',
  'https://example.org/read#',
  'https://example.org/read%2523access_token=SYNTHETIC_ONLY',
  'https://example.org/read?foo=%2523access_token=SYNTHETIC_ONLY',
  'https://example.org/read?foo=%250d%250aSYNTHETIC_ONLY',
  'https://example.org/read?%2525252561ccess_token=SYNTHETIC_ONLY',
];
export const unknownRightsCitationUrls=['https://example.org/public-reference','https://www.investanchors.com/public-reference','https://www.tpex.org.tw/','https://data.gov.tw/dataset/99999','https://data.gov.tw/dataset/11370?ref=mail'];
export function launchPublicCitationFixture(datasetId:11370|11371|11856|11391|11755=11370):LaunchPublicCitation{
 const sourceRevision='00000000-0000-4000-8000-000000000777';
 return {id:`licensed-dataset:${datasetId}:${sourceRevision}`,url:`https://data.gov.tw/dataset/${datasetId}`,contentHash:'b'.repeat(64),sourceRevision,publicRights:{schemaVersion:'launch-public-rights-v1',datasetId,license:'Taiwan Open Government Data License 1.0',licenseUrl:'https://data.gov.tw/license',attribution:'Securities and Futures Bureau, Financial Supervisory Commission',rightsRevision:'d'.repeat(64)}};
}
