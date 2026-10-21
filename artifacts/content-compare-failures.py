import re,json,sys
from pathlib import Path
pattern=re.compile(r'^\s*x\s+\d+\s+\[([^]]+)\]\s+›\s+(?:\.content-baseline-runtime\\)?tests\\([^:]+):\d+:\d+\s+›\s+(.*?)\s+\([^)]*\)\s*$',re.M)
def failures(path):
 text=Path(path).read_text(encoding='utf-8-sig')
 return {(browser,file,title) for browser,file,title in pattern.findall(text)}
b=failures('artifacts/content-baseline-full-tests.txt');a=failures(sys.argv[1] if len(sys.argv)>1 else 'artifacts/content-full-tests.txt')
result={'baselineFailed':len(b),'currentFailedSoFar':len(a),'common':sorted(b&a),'additionalToInvestigate':sorted(a-b),'baselineNotFailedSoFar':sorted(b-a)}
Path('artifacts/content-failure-comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print('baseline',len(b),'current',len(a),'common',len(a&b),'additional',len(a-b))
for browser,file,title in sorted(a-b): print(browser,file,title)
