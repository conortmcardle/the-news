#!/usr/bin/env python3
"""
Author Article Scraper
Fetches articles from configured authors across RSS, Guardian API, NYT API,
and arbitrary websites. Outputs to data/articles.json.
"""

import hashlib
import json
import time
from datetime import datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

import feedparser
import requests
from bs4 import BeautifulSoup

# ── Paths ────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
CONFIG_FILE = SCRIPT_DIR / "authors.json"
DATA_FILE = PROJECT_ROOT / "data" / "articles.json"

# ── API Keys ─────────────────────────────────────────────────
GUARDIAN_API_KEY = "9b7bdb55-08b6-4fff-a63a-e9ce90d413ca"
NYT_API_KEY = "bGQSx4VVAWAFVRs4FtSDspWvZwezjaiKFBPvh7TEOmffslPu"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


# ── Utilities ────────────────────────────────────────────────

class _HTMLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []

    def handle_data(self, data):
        self.text.append(data)


def strip_html(html):
    """Remove HTML tags, return plain text."""
    if not html:
        return ""
    s = _HTMLStripper()
    s.feed(html)
    return " ".join(s.text).strip()


def truncate(text, max_len=300):
    text = (text or "").strip()
    if len(text) <= max_len:
        return text
    trimmed = text[:max_len]
    last_space = trimmed.rfind(" ")
    return (trimmed[:last_space] if last_space > 0 else trimmed) + "..."


def make_article_id(url):
    """Deterministic ID from URL (first 16 hex chars of SHA-256)."""
    return hashlib.sha256(url.encode()).hexdigest()[:16]


def extract_domain(url):
    parsed = urlparse(url)
    return parsed.netloc.replace("www.", "")


def now_iso():
    return datetime.utcnow().isoformat() + "Z"


# ── File I/O ─────────────────────────────────────────────────

def load_config():
    with open(CONFIG_FILE, "r") as f:
        return json.load(f)


def load_existing():
    if not DATA_FILE.exists():
        return {"last_updated": None, "articles": []}
    with open(DATA_FILE, "r") as f:
        return json.load(f)


def save_articles(articles):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "last_updated": now_iso(),
        "articles": articles,
    }
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ── Source Handlers ──────────────────────────────────────────

def fetch_guardian(source, author_name):
    """Fetch articles from the Guardian Content API by author tag."""
    params = {
        "tag": source["tag"],
        "show-fields": "headline,trailText,body,byline,thumbnail",
        "order-by": "newest",
        "page-size": 10,
        "api-key": GUARDIAN_API_KEY,
    }
    if source.get("content_type"):
        params["type"] = source["content_type"]
    resp = requests.get(
        "https://content.guardianapis.com/search",
        params=params,
        timeout=15,
    )
    resp.raise_for_status()
    results = resp.json()["response"]["results"]

    articles = []
    for r in results:
        fields = r.get("fields", {})
        url = r["webUrl"]
        body_html = fields.get("body", "")
        body_text = strip_html(body_html)

        articles.append({
            "id": make_article_id(url),
            "title": fields.get("headline", r.get("webTitle", "")),
            "author": author_name,
            "date": r.get("webPublicationDate", ""),
            "url": url,
            "source": "The Guardian",
            "excerpt": truncate(strip_html(fields.get("trailText", "")) or body_text),
            "body": body_html,
            "image": fields.get("thumbnail", ""),
            "fetched_at": now_iso(),
        })
    return articles


def fetch_nyt(source, author_name):
    """Fetch articles from the NYT Article Search API by author."""
    query = source.get("query", author_name)
    params = {
        "q": f'"{query}"',
        "sort": "newest",
        "api-key": NYT_API_KEY,
    }
    resp = requests.get(
        "https://api.nytimes.com/svc/search/v2/articlesearch.json",
        params=params,
        timeout=15,
    )
    resp.raise_for_status()
    docs = resp.json()["response"].get("docs") or []

    # Filter client-side: only keep articles where the byline contains the author name
    query_lower = query.lower()
    articles = []
    for doc in docs:
        byline = (doc.get("byline") or {}).get("original") or ""
        if query_lower not in byline.lower():
            continue
        url = doc.get("web_url", "")
        headline = doc.get("headline", {}).get("main", "")
        abstract = doc.get("abstract", "")
        lead = doc.get("lead_paragraph", "")
        pub_date = doc.get("pub_date", "")

        # Image — multimedia can be a list (legacy) or dict (current API)
        image = ""
        multimedia = doc.get("multimedia")
        if isinstance(multimedia, dict):
            img_url = (multimedia.get("default") or {}).get("url", "")
            if not img_url:
                img_url = (multimedia.get("thumbnail") or {}).get("url", "")
            if img_url:
                image = img_url
        elif isinstance(multimedia, list) and multimedia:
            for m in multimedia:
                if m.get("subtype") == "xlarge" or m.get("type") == "image":
                    image = "https://static01.nyt.com/" + m.get("url", "")
                    break

        articles.append({
            "id": make_article_id(url),
            "title": headline,
            "author": author_name,
            "date": pub_date,
            "url": url,
            "source": "The New York Times",
            "excerpt": truncate(abstract or lead),
            "body": "",  # NYT API does not provide full body
            "image": image,
            "fetched_at": now_iso(),
        })

    time.sleep(1)  # Rate limiting
    return articles


def fetch_rss(source, author_name):
    """Fetch articles from an RSS/Atom feed."""
    feed = feedparser.parse(source["url"])

    articles = []
    for entry in feed.entries[:10]:
        url = entry.get("link", "")
        if not url:
            continue

        # RSS content quality varies
        content = ""
        if hasattr(entry, "content") and entry.content:
            content = entry.content[0].get("value", "")

        summary = entry.get("summary", "")
        body = content or summary
        body_text = strip_html(body)

        # Parse date
        date_str = ""
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            try:
                date_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", entry.published_parsed)
            except (TypeError, ValueError):
                pass
        elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
            try:
                date_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", entry.updated_parsed)
            except (TypeError, ValueError):
                pass

        # Image
        image = ""
        if hasattr(entry, "media_thumbnail") and entry.media_thumbnail:
            image = entry.media_thumbnail[0].get("url", "")
        elif hasattr(entry, "media_content") and entry.media_content:
            for m in entry.media_content:
                if "image" in m.get("type", "") or m.get("medium") == "image":
                    image = m.get("url", "")
                    break

        articles.append({
            "id": make_article_id(url),
            "title": entry.get("title", ""),
            "author": author_name,
            "date": date_str,
            "url": url,
            "source": extract_domain(url),
            "excerpt": truncate(strip_html(summary) or body_text),
            "body": body if "<" in body else "",
            "image": image,
            "fetched_at": now_iso(),
        })
    return articles


def fetch_web(source, author_name):
    """Scrape an author's listing page and extract articles with newspaper4k."""
    from newspaper import Article as NewspaperArticle

    resp = requests.get(
        source["url"],
        headers={"User-Agent": USER_AGENT},
        timeout=15,
    )
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")

    # Find article links
    container = soup
    if source.get("container_selector"):
        container_el = soup.select_one(source["container_selector"])
        if container_el:
            container = container_el

    link_elements = container.select(source["link_selector"])
    urls = []
    for el in link_elements[:10]:
        href = el.get("href", "")
        if href and not href.startswith("#"):
            urls.append(urljoin(source["url"], href))

    # Extract each article
    articles = []
    for url in urls:
        try:
            article = NewspaperArticle(url)
            article.download()
            article.parse()

            date_str = ""
            if article.publish_date:
                date_str = article.publish_date.isoformat()

            articles.append({
                "id": make_article_id(url),
                "title": article.title or "",
                "author": author_name,
                "date": date_str,
                "url": url,
                "source": extract_domain(url),
                "excerpt": truncate(article.text),
                "body": article.text,
                "image": article.top_image or "",
                "fetched_at": now_iso(),
            })
        except Exception as e:
            print(f"  [WARN] Failed to extract {url}: {e}")

        time.sleep(0.5)  # Be polite

    return articles


# ── Dispatcher ───────────────────────────────────────────────

HANDLERS = {
    "guardian": fetch_guardian,
    "nyt": fetch_nyt,
    "rss": fetch_rss,
    "web": fetch_web,
}


def fetch_source(source, author_name):
    handler = HANDLERS.get(source["type"])
    if not handler:
        raise ValueError(f"Unknown source type: {source['type']}")
    return handler(source, author_name)


# ── Pruning ──────────────────────────────────────────────────

def prune(articles, settings):
    max_articles = settings.get("max_articles", 500)
    max_age_days = settings.get("max_age_days", 90)

    cutoff = (datetime.utcnow() - timedelta(days=max_age_days)).isoformat() + "Z"

    # Filter by age (keep articles with no date too)
    articles = [a for a in articles if not a["date"] or a["date"] >= cutoff]

    # Cap total count
    return articles[:max_articles]


# ── Main ─────────────────────────────────────────────────────

def main():
    print("Loading config...")
    config = load_config()

    print("Loading existing articles...")
    existing = load_existing()
    existing_ids = {a["id"] for a in existing["articles"]}

    new_articles = []
    for author in config["authors"]:
        print(f"\n[{author['name']}]")
        for source in author["sources"]:
            try:
                print(f"  Fetching {source['type']}...", end=" ")
                articles = fetch_source(source, author["name"])
                added = 0
                for article in articles:
                    if article["id"] not in existing_ids:
                        new_articles.append(article)
                        existing_ids.add(article["id"])
                        added += 1
                print(f"{len(articles)} found, {added} new")
            except Exception as e:
                print(f"ERROR: {e}")

    # Merge, sort, prune
    all_articles = new_articles + existing["articles"]
    all_articles.sort(key=lambda a: a["date"] or "", reverse=True)
    all_articles = prune(all_articles, config.get("settings", {}))

    # Save
    save_articles(all_articles)
    print(f"\nDone. {len(new_articles)} new articles. {len(all_articles)} total.")


if __name__ == "__main__":
    main()
