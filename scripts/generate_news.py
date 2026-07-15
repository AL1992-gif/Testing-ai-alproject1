#!/usr/bin/env python3
"""Fetch public Australian finance RSS feeds and build docs/news.json."""
from __future__ import annotations

import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

GOOGLE_BASE = "https://news.google.com/rss/search"
QUERIES = [
    ("markets", '(ASX OR "Australian shares" OR "Australian dollar" OR commodities) when:3d'),
    ("economy", '(RBA OR inflation OR "interest rates" OR unemployment OR GDP) Australia when:7d'),
    ("companies", '(ASX company OR earnings OR profit OR takeover) Australia when:3d'),
    ("housing", '(housing OR property prices OR mortgage rates) Australia when:7d'),
    ("super", '(superannuation OR SMSF OR retirement) Australia when:14d'),
]
FEEDS = [
    *[(category, f"{GOOGLE_BASE}?q={urllib.parse.quote(query)}&hl=en-AU&gl=AU&ceid=AU:en", False) for category, query in QUERIES],
    ("official", "https://www.rba.gov.au/rss/rss-cb-media-releases.xml", True),
    ("official", "https://www.rba.gov.au/rss/rss-cb-bulletin.xml", True),
]
OUT = Path(__file__).resolve().parents[1] / "docs" / "news.json"
TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")


def clean(value: str | None) -> str:
    text = html.unescape(value or "")
    text = TAG_RE.sub(" ", text)
    return SPACE_RE.sub(" ", text).strip()


def child_text(node: ET.Element, names: tuple[str, ...]) -> str:
    for child in list(node):
        local = child.tag.rsplit("}", 1)[-1].lower()
        if local in names:
            return "".join(child.itertext()).strip()
    return ""


def date_iso(value: str) -> str:
    if not value:
        return datetime.now(timezone.utc).isoformat()
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except (TypeError, ValueError, OverflowError):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            return datetime.now(timezone.utc).isoformat()


def fetch(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "AU-Finance-Pulse/1.0 (GitHub Actions RSS aggregator)",
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as response:
        return response.read()


def parse_feed(raw: bytes, category: str, official: bool) -> list[dict]:
    root = ET.fromstring(raw)
    entries = [node for node in root.iter() if node.tag.rsplit("}", 1)[-1].lower() in {"item", "entry"}]
    articles: list[dict] = []
    for node in entries[:24]:
        raw_title = clean(child_text(node, ("title",)))
        link = child_text(node, ("link",))
        if not link:
            for child in list(node):
                if child.tag.rsplit("}", 1)[-1].lower() == "link" and child.attrib.get("href"):
                    link = child.attrib["href"]
                    break
        source = clean(child_text(node, ("source",)))
        published = child_text(node, ("pubdate", "published", "updated", "date"))
        description = clean(child_text(node, ("description", "summary", "content", "encoded")))
        title = raw_title
        if not source and " - " in raw_title and not official:
            title, source = raw_title.rsplit(" - ", 1)
        source = source or ("Reserve Bank of Australia" if official else "Australian finance news")
        title = clean(title)
        link = html.unescape(link).strip()
        if not title or not link.startswith(("http://", "https://")):
            continue
        summary = description or "Open the original publisher for the full article and context."
        if len(summary) > 220:
            summary = summary[:217].rstrip() + "…"
        article_id = hashlib.sha256(f"{title}|{link}".encode()).hexdigest()[:16]
        articles.append(
            {
                "id": article_id,
                "title": title,
                "link": link,
                "source": source,
                "publishedAt": date_iso(published),
                "category": category,
                "official": official,
                "description": summary,
            }
        )
    return articles


def main() -> int:
    articles: list[dict] = []
    source_count = 0
    failures: list[str] = []
    for category, url, official in FEEDS:
        try:
            articles.extend(parse_feed(fetch(url), category, official))
            source_count += 1
        except Exception as exc:
            failures.append(f"{category}: {exc}")

    deduped: list[dict] = []
    seen: set[str] = set()
    for article in sorted(articles, key=lambda item: item["publishedAt"], reverse=True):
        key = re.sub(r"[^a-z0-9]+", " ", article["title"].lower()).strip()[:110]
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(article)

    if not deduped:
        print("All RSS feeds failed; retaining the existing news.json", file=sys.stderr)
        for failure in failures:
            print(failure, file=sys.stderr)
        return 0

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCount": source_count,
        "articles": deduped[:90],
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(payload['articles'])} articles from {source_count}/{len(FEEDS)} sources")
    for failure in failures:
        print(f"Warning: {failure}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
