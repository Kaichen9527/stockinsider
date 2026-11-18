import {openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
import {checkFugleOpeningCapture,FUGLE_CAPTURE_MAX_BYTES} from '../src/lib/vnext/launch-opening-fugle.ts';

function readBounded(path,cap){
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const info=fstatSync(fd);
    if(!info.isFile()||info.size<1||info.size>cap)throw Error('fugle_capture_file_size');
    const bytes=Buffer.alloc(info.size+1);
    let offset=0;
    while(offset<bytes.length){
      const count=readSync(fd,bytes,offset,bytes.length-offset,null);
      if(count===0)break;
      offset+=count;
    }
    if(offset!==info.size)throw Error('fugle_capture_file_size');
    return bytes.subarray(0,offset);
  }finally{closeSync(fd);}
}

const args=process.argv.slice(2);
if(args.length!==3){
  process.stderr.write('Usage: node web/scripts/check-fugle-opening-capture.mjs <receipt.json> <stream.json> <ticker.json>\n');
  process.exitCode=2;
}else{
  try{
    const [receiptPath,streamPath,tickerPath]=args;
    const {input,receipts}=JSON.parse(readBounded(receiptPath,256*1024).toString('utf8'));
    const report=checkFugleOpeningCapture(input,receipts,{
      stream:readBounded(streamPath,FUGLE_CAPTURE_MAX_BYTES),
      ticker:readBounded(tickerPath,FUGLE_CAPTURE_MAX_BYTES),
    });
    process.stdout.write(JSON.stringify(report)+'\n');
  }catch(error){
    const reason=error instanceof Error&&/^fugle_capture_[a-z_]{1,50}$/u.test(error.message)
      ?error.message:'fugle_capture_invalid';
    process.stderr.write(reason+'\n');
    process.exitCode=2;
  }
}
