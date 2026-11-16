import {readMopsSimpleForecast} from '../src/lib/vnext/mops-simple-forecast-source.ts';

const [symbol,year,period='annual',...rest]=process.argv.slice(2);
if(rest.length||!/^\d{4}$/u.test(symbol||'')||!/^\d{4}$/u.test(year||'')||!(/^(annual|Q[1-4])$/u.test(period)))throw Error('usage: replay-mops-simple-forecast.mjs SYMBOL GREGORIAN_YEAR [annual|Q1|Q2|Q3|Q4]');
const quarter=period==='annual'?undefined:Number(period.slice(1));
const result=await readMopsSimpleForecast({symbol,year:Number(year),quarter});
if(result===null){
 process.stdout.write(JSON.stringify({status:'no_simple_forecast',symbol,year:Number(year),period})+'\n');
}else{
 const {original, ...publicReceipt}=result;
 if(!original.listing||!original.detail)throw Error('missing_mops_original');
 process.stdout.write(JSON.stringify({status:'archive_observed',...publicReceipt},null,2)+'\n');
}
