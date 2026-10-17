import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        data = json.loads(self.rfile.read(length))
        Path("check.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"saved": "check.json"}')

HTTPServer(("127.0.0.1", 3000), Handler).serve_forever()