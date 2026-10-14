import os,select,sys,time
expected=27574426
end=time.monotonic()+120
fd=os.open(sys.argv[1],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
total=0
try:
 while True:
  remaining=end-time.monotonic()
  if remaining<=0 or not select.select([0],[],[],remaining)[0]: raise SystemExit('artifact_stream_deadline')
  b=os.read(0,min(65536,expected-total+1))
  if not b: break
  total+=len(b)
  if total>expected: raise SystemExit('artifact_stream_oversize')
  with memoryview(b) as v:
   while v:
    n=os.write(fd,v);v=v[n:]
 if total!=expected: raise SystemExit('artifact_stream_truncated')
 os.fsync(fd)
finally: os.close(fd)
print('artifact_stream_exact_bytes='+str(total))