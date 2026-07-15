import hashlib, html, json, re, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

QUERIES={
 'Yamaha':'Yamaha WaveRunner Australia promotion OR finance OR cashback',
 'Kawasaki':'Kawasaki Jet Ski Australia promotion OR finance OR cashback',
 'Polaris':'Polaris Australia promotion OR finance OR cashback',
 'Honda':'Honda marine Australia promotion OR finance OR cashback',
 'Can-Am':'Can-Am Australia promotion OR finance OR cashback'
}
PROMO_WORDS={'cashback':3,'finance':2,'offer':1,'promotion':2,'discount':3,'bonus':2,'free':1,'warranty':1,'sale':2}

def clean(v):
 return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',v or ''))).strip()

def fetch_brand(brand,query):
 url='https://news.google.com/rss/search?q='+urllib.parse.quote(query)+'&hl=en-AU&gl=AU&ceid=AU:en'
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 BRP-Commercial-Intelligence/1.0'})
 with urllib.request.urlopen(req,timeout=20) as r: root=ET.fromstring(r.read())
 rows=[]
 for item in root.findall('.//item')[:8]:
  title=clean(item.findtext('title'))
  link=clean(item.findtext('link'))
  pub=clean(item.findtext('pubDate'))
  source=clean(item.findtext('source')) or 'Google News'
  text=title.lower(); score=sum(weight for word,weight in PROMO_WORDS.items() if word in text)
  priority='High' if score>=5 else 'Medium' if score>=2 else 'Low'
  assess='Strong promotional signal; review offer mechanics and dealer coverage' if priority=='High' else 'Monitor for repeated discounting or wider dealer adoption' if priority=='Medium' else 'General market signal; no immediate response indicated'
  rows.append({'id':hashlib.sha1((brand+title).encode()).hexdigest()[:12],'brand':brand,'title':title,'priority':priority,'assessment':assess,'publishedAt':pub,'link':link,'source':source,'score':score})
 return rows

signals=[]
for brand,q in QUERIES.items():
 try: signals.extend(fetch_brand(brand,q))
 except Exception as e: print(brand,e)
signals.sort(key=lambda x:x['score'],reverse=True)
high=sum(x['priority']=='High' for x in signals)
medium=sum(x['priority']=='Medium' for x in signals)
pressure='High' if high>=3 else 'Medium' if high or medium>=4 else 'Low'
assessment={'pressure':pressure,'sales':'↓' if pressure=='High' else '↔','margin':'↓' if pressure in {'High','Medium'} else '↔','inventory':'↑' if pressure=='High' else '↔','priority':pressure}
lead=signals[:3]
brief=('Competitive pressure is assessed as '+pressure.lower()+'. ' + ('; '.join(x['brand']+': '+x['title'] for x in lead) if lead else 'No strong competitor promotion signal was retrieved.') + '\n\nRecommended action: validate whether signals are national campaigns or isolated dealer activity before changing BRP pricing or sales-program support.')
out={'generatedAt':datetime.now(timezone.utc).isoformat(),'assessment':assessment,'brief':brief,'scope':[f'{b}: {q}' for b,q in QUERIES.items()],'signals':signals[:30],'stories':[{'title':x['title'],'source':x['source'],'publishedAt':x['publishedAt'],'link':x['link']} for x in signals[:15]]}
Path('brp-intelligence-hub/data.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
