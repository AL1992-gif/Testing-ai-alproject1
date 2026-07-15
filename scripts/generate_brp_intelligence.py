import hashlib, html, json, re, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

BRANDS = {
    "Yamaha": "Yamaha WaveRunner Australia",
    "Kawasaki": "Kawasaki Jet Ski Australia",
    "Polaris": "Polaris Australia powersports",
    "Honda": "Honda marine Australia",
    "Can-Am": "Can-Am Australia"
}

PROMO_TERMS = {
    "cashback", "cash back", "finance", "interest rate", "comparison rate",
    "discount", "sale", "offer", "promotion", "bonus", "rebate",
    "free trailer", "free registration", "free accessories", "warranty",
    "drive away", "ride away", "trade-in", "trade in"
}

INDUSTRY_QUERIES = [
    "Australia personal watercraft industry sales registrations",
    "Australia marine industry dealer powersports news",
    "Australia recreational vehicle powersports industry",
    "personal watercraft new model launch Australia",
    "marine dealer inventory Australia"
]

INDUSTRY_TERMS = {
    "personal watercraft", "pwc", "jet ski", "waverunner", "marine",
    "powersports", "dealer", "dealership", "registration", "registrations",
    "sales", "market", "inventory", "new model", "launch", "industry",
    "recreational vehicle", "watercraft"
}

EXCLUDE_TERMS = {"accident", "crash", "rescue", "missing", "death", "court", "police"}


def clean(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub("<[^>]+>", " ", value or ""))).strip()


def fetch(query, limit=15):
    url = "https://news.google.com/rss/search?q=" + urllib.parse.quote(query) + "&hl=en-AU&gl=AU&ceid=AU:en"
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 BRP-Market-Monitor/2.0"})
    with urllib.request.urlopen(request, timeout=20) as response:
        root = ET.fromstring(response.read())
    rows = []
    for item in root.findall(".//item")[:limit]:
        title = clean(item.findtext("title"))
        description = clean(item.findtext("description"))
        text = f"{title} {description}".lower()
        rows.append({
            "id": hashlib.sha1((title + clean(item.findtext("link"))).encode()).hexdigest()[:12],
            "title": title,
            "description": description,
            "link": clean(item.findtext("link")),
            "publishedAt": clean(item.findtext("pubDate")),
            "source": clean(item.findtext("source")) or "Google News",
            "text": text
        })
    return rows


def dedupe(rows):
    seen, result = set(), []
    for row in rows:
        key = re.sub(r"[^a-z0-9]", "", row["title"].lower())[:100]
        if key and key not in seen:
            seen.add(key)
            row.pop("text", None)
            result.append(row)
    return result


promotions = []
for brand, base_query in BRANDS.items():
    query = f'{base_query} (promotion OR finance OR cashback OR discount OR bonus OR warranty OR "free trailer")'
    try:
        for row in fetch(query, 12):
            if any(term in row["text"] for term in PROMO_TERMS) and not any(term in row["text"] for term in EXCLUDE_TERMS):
                row["brand"] = brand
                matched = [term for term in PROMO_TERMS if term in row["text"]]
                row["promotionType"] = matched[0].title() if matched else "Offer"
                promotions.append(row)
    except Exception as error:
        print("promotion", brand, error)

industry_news = []
for query in INDUSTRY_QUERIES:
    try:
        for row in fetch(query, 12):
            if any(term in row["text"] for term in INDUSTRY_TERMS) and not any(term in row["text"] for term in EXCLUDE_TERMS):
                industry_news.append(row)
    except Exception as error:
        print("industry", query, error)

promotions = dedupe(promotions)[:30]
industry_news = dedupe(industry_news)[:30]

out = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "brands": list(BRANDS.keys()),
    "promotionCount": len(promotions),
    "industryNewsCount": len(industry_news),
    "promotions": promotions,
    "industryNews": industry_news
}

Path("brp-intelligence-hub/data.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
)
