#!/usr/bin/env python3
"""
Lightweight dev server: static files + article extraction API.
Replaces `python3 -m http.server` and adds GET /api/extract?url=...
"""

import json
from http.server import SimpleHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/extract":
            self.handle_extract(parsed.query)
        else:
            super().do_GET()

    def handle_extract(self, query_string):
        params = parse_qs(query_string)
        url = params.get("url", [None])[0]

        if not url:
            self.send_json({"error": "Missing ?url= parameter"}, 400)
            return

        try:
            from newspaper import Article

            article = Article(url)
            article.download()
            article.parse()

            self.send_json({
                "title": article.title or "",
                "author": ", ".join(article.authors) if article.authors else "",
                "body": article.text or "",
            })
        except Exception as e:
            self.send_json({"error": f"Could not extract article: {e}"}, 500)

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # Quieter logging — skip static asset noise
        path = args[0].split()[1] if args else ""
        if path.startswith("/api/"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    server = HTTPServer(("", 8080), Handler)
    print("Serving on http://localhost:8080")
    server.serve_forever()
