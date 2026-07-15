import hashlib, html, json, re, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

OFFICIAL_PROMOTION_PAGES = {
    "Yamaha": "https://www.yamaha-motor.com.au/buying/offers",
    "Kawasaki": "https://www.kawasaki.com.au/en-au/promotions",
    "Polaris": "https://www.polaris.com.au/offers/",
    "Honda": "https://www.honda.com.au/marine/offers",
}

BRAND_TERMS = {
    "Yamaha": ["yamaha", "waverunner", "watercraft"],
    "Kawasaki": ["kawasaki", "jet ski", "jetski"],
    "Polaris": ["polaris"],
    "Honda": ["honda", "marine"],
}

PROMO_TERMS = {
    "cashback", "cash back", "finance", "comparison rate", "discount", "save $",
    "sale", "offer", "promotion", "bonus", "rebate", "free trailer",
    "free registration", "free accessories", "warranty", "drive away",
    "ride away", "trade-in", "trade in", "% p.a."
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


def fetch_url(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 BRP-Official-Promotion-Monitor/3.0"})
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read().decode("utf-8", errors="ignore"), response.geturl()


def official_promotions(brand, url):
    checked_at = datetime.now(timezone.utc).isoformat()
    try:
        raw, final_url = fetch_url(url)
        page_text = clean(raw)
        lower = page_text.lower()
        candidates = []
        for match in re.finditer(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', raw, re.I | re.S):
            href, label_html = match.group(1), match.group(2)
            label = clean(label_html)
            context = clean(raw[max(0, match.start()-500):min(len(raw), match.end()+700)])
            text = f"{label} {context}".lower()
            if not label or len(label) < 4:
                continue
            if not any(term in text for term in PROMO_TERMS):
                continue
            if brand == "Yamaha" and not any(term in text for term in ["watercraft", "waverunner"]):
                continue
            absolute = urllib.parse.urljoin(final_url, href)
            if urllib.parse.urlparse(absolute).netloc != urllib.parse.urlparse(final_url).netloc:
                continue
            title = label[:180]
            description = context[:300]
            candidates.append({
                "id": hashlib.sha1((brand + title + absolute).encode()).hexdigest()[:12],
                "brand": brand,
                "title": title,
                "description": description,
                "link": absolute,
                "source": f"{brand} official website",
                "promotionType": next((term.title() for term in PROMO_TERMS if term in text), "Official offer"),
                "verified": True,
                "checkedAt": checked_at,
            })
        seen, output = set(), []
        for row in candidates:
            key = re.sub(r"[^a-z0-9]", "", row["title"].lower())[:100]
            if key and key not in seen:
                seen.add(key)
                output.append(row)
        return output[:15], {
            "brand": brand, "url": final_url, "status": "checked",
            "activeOffers": len(output), "checkedAt": checked_at,
            "note": "Official website checked. Only explicit offers are shown."
        }
    except Exception as error:
        return [], {
            "brand": brand, "url": url, "status": "unavailable",
            "activeOffers": 0, "checkedAt": checked_at,
            "note": f"Official page could not be verified automatically: {type(error).__name__}"
        }


def fetch_news(query, limit=15):
    url = "https://news.google.com/rss/search?q=" + urllib.parse.quote(query) + "&hl=en-AU&gl=AU&ceid=AU:en"
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 BRP-Industry-News/3.0"})
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
            "text": text,
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


promotions, official_checks = [], []
for brand, url in OFFICIAL_PROMOTION_PAGES.items():
    rows, check = official_promotions(brand, url)
    promotions.extend(rows)
    official_checks.append(check)

industry_news = []
for query in INDUSTRY_QUERIES:
    try:
        for row in fetch_news(query, 12):
            if any(term in row["text"] for term in INDUSTRY_TERMS) and not any(term in row["text"] for term in EXCLUDE_TERMS):
                industry_news.append(row)
    except Exception as error:
        print("industry", query, error)

promotions = dedupe(promotions)[:30]
industry_news = dedupe(industry_news)[:30]

out = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "promotionMethod": "Official Australian brand websites only",
    "promotionCount": len(promotions),
    "industryNewsCount": len(industry_news),
    "promotions": promotions,
    "officialChecks": official_checks,
    "industryNews": industry_news,
}

Path("brp-intelligence-hub/data.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
)
