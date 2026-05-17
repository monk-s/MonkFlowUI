"""FastAPI dashboard app. Serves the web UI and JSON API endpoints."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

DASHBOARD_DIR = Path(__file__).parent

app = FastAPI(title="BTC Trading Bot Dashboard", docs_url="/docs")

templates = Jinja2Templates(directory=str(DASHBOARD_DIR / "templates"))
app.mount("/static", StaticFiles(directory=str(DASHBOARD_DIR / "static")), name="static")

# Repository is injected at startup from bot/main.py
_repository = None
_exchange = None
_scheduler = None


def init_dashboard(repository, exchange, scheduler=None):
    """Inject dependencies into the dashboard."""
    global _repository, _exchange, _scheduler
    _repository = repository
    _exchange = exchange
    _scheduler = scheduler

    from dashboard.routes import register_routes
    register_routes(app, repository, exchange, templates, scheduler)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "trading-bot"}
