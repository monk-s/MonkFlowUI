"""Static server for k1.monkflow.io: the family-office K-1 demo and nothing else.

Localhost only; the Cloudflare tunnel is the only way in, and Cloudflare Access (an email list, set in the
dashboard) is the only gate. There is no access code here on purpose. Serves a copy of the built portal from
~/monkflow-demos/k1-site/portal (see README.md for how to refresh it). Fictional data only.
"""

import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

ROOT = os.path.realpath(os.environ.get("K1_SITE", os.path.expanduser("~/monkflow-demos/k1-site")))
PORT = int(os.environ.get("PORT", "8508"))
HOME = "/demo/family-office/k1"
# The portal's own policy from vercel.json, so the demo behaves the same here as on monkflow.io.
HEADERS = {
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "Content-Security-Policy": ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                                "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-src 'self'; "
                                "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "monkflow-k1"
    sys_version = ""

    def _send(self, code, ctype, body, extra=None, head=False):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in {**HEADERS, **(extra or {})}.items():
            self.send_header(k, v)
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def _serve(self, head):
        path = unquote(urlsplit(self.path).path)
        if path.startswith("/portal/"):
            full = os.path.realpath(os.path.join(ROOT, path.lstrip("/")))
            if not full.startswith(ROOT + os.sep) or not os.path.isfile(full):
                return self._send(404, "text/plain; charset=utf-8", b"Not found\n", head=head)
            cache = "public, max-age=31536000, immutable" if "/assets/" in path else "no-cache"
        elif path == "/demo/family-office" or path.startswith("/demo/family-office/"):
            full, cache = os.path.join(ROOT, "portal", "index.html"), "no-cache"
        else:  # every other address, including the other demos and the sign-in pages, lands on the tracker
            return self._send(302, "text/plain; charset=utf-8", b"", {"Location": HOME}, head)
        with open(full, "rb") as f:
            body = f.read()
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        self._send(200, ctype + ("; charset=utf-8" if ctype.startswith("text/") or ctype.endswith("javascript") else ""), body, {"Cache-Control": cache}, head)

    def do_GET(self):
        self._serve(False)

    def do_HEAD(self):
        self._serve(True)

    def log_message(self, fmt, *args):  # path and status only
        print(f"{self.log_date_time_string()} {self.command} {urlsplit(self.path).path} {args[1] if len(args) > 1 else ''}", flush=True)


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def server_bind(self):
        # HTTPServer.server_bind looks up our own hostname, which hangs under launchd.
        import socketserver
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = "localhost", self.server_address[1]


if __name__ == "__main__":
    assert os.path.isfile(os.path.join(ROOT, "portal", "index.html")), f"no built portal in {ROOT}"
    print(f"serving {ROOT} on 127.0.0.1:{PORT}", flush=True)
    Server(("127.0.0.1", PORT), Handler).serve_forever()
