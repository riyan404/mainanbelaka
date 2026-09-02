"""Lightweight HTTP health server pada port 9100."""

import json
import logging
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

logger = logging.getLogger(__name__)


class HealthState:
    """Shared state untuk health check."""

    def __init__(self) -> None:
        self.model_loaded: bool = False
        self.active_cameras: int = 0
        self.last_error: str | None = None


class _HealthHandler(BaseHTTPRequestHandler):
    state: HealthState  # injected by factory

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            body = json.dumps(
                {
                    "status": "ok" if self.state.model_loaded else "starting",
                    "model_loaded": self.state.model_loaded,
                    "active_cameras": self.state.active_cameras,
                    "last_error": self.state.last_error,
                }
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        # Suppress default access log
        pass


def start_health_server(state: HealthState, port: int = 9100) -> threading.Thread:
    """Start health server di background thread. Return thread handle."""

    handler_class = type(
        "_BoundHealthHandler",
        (_HealthHandler,),
        {"state": state},
    )

    server = HTTPServer(("0.0.0.0", port), handler_class)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info("Health server listening pada :%d", port)
    return thread
