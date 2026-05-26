"""Paper-mode grid trader runner.

Boots the full v3 grid stack in paper mode against live Coinbase price
feed, then prints a snapshot of `tb3_grid_state` every 60 seconds so
you can manually observe the grid behavior outside of CI.

Usage:
    # Set env vars (or use a .env file)
    export TRADING_MODE=paper
    export BOT_ENGINE=grid
    # Optional: override defaults
    export GRID_TICK_INTERVAL_SEC=30   # default
    export GRID_PREBUY_PCT=50          # default

    python -m scripts.grid_paper_run

What it does:
    - Calls bot.main.boot() which spins up the full stack (DB, exchange,
      grid components, scheduler, dashboard) — same path as production.
    - In a separate task, polls the grid state once a minute and prints
      a compact one-line summary to stdout.
    - Listens for SIGINT/SIGTERM and shuts down cleanly.

What it doesn't do:
    - Place real orders (TRADING_MODE=paper is enforced).
    - Modify any persistent state beyond what the bot itself writes.

Stop with Ctrl-C.
"""

from __future__ import annotations

import asyncio
import os
import signal
import sys
from datetime import datetime, timezone


async def _state_printer(repo) -> None:
    """Print a compact grid-state snapshot every 60 seconds."""
    while True:
        try:
            await asyncio.sleep(60)
            gs = await repo.get_grid_state()
            if gs is None:
                print(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] "
                      "grid_state not initialized yet")
                continue

            opens = await repo.get_open_active_orders()
            buy_count = sum(1 for o in opens if o.side == "buy")
            sell_count = sum(1 for o in opens if o.side == "sell")

            print(
                f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] "
                f"prebuy={getattr(gs, 'prebuy_status', None)} "
                f"qty={float(gs.inventory_qty or 0):.4f} BTC "
                f"avg=${float(gs.inventory_avg_cost or 0):.0f} "
                f"realized=${float(gs.realized_pnl_total or 0):.2f} "
                f"open={len(opens)} (buys={buy_count}, sells={sell_count}) "
                f"buys_filled={gs.n_buy_fills} sells_filled={gs.n_sell_fills} "
                f"range=${float(gs.current_range_low or 0):.0f}-${float(gs.current_range_high or 0):.0f}",
                flush=True,
            )
        except asyncio.CancelledError:
            return
        except Exception as exc:
            print(f"state_printer error: {exc}", flush=True)


async def main() -> None:
    # Enforce paper mode + grid engine even if env vars are unset
    os.environ.setdefault("TRADING_MODE", "paper")
    os.environ.setdefault("BOT_ENGINE", "grid")

    print("=" * 70)
    print("v3 grid trader — paper mode runner")
    print(f"  TRADING_MODE={os.environ.get('TRADING_MODE')}")
    print(f"  BOT_ENGINE={os.environ.get('BOT_ENGINE')}")
    print(f"  GRID_TICK_INTERVAL_SEC={os.environ.get('GRID_TICK_INTERVAL_SEC', '30 (default)')}")
    print(f"  GRID_PREBUY_PCT={os.environ.get('GRID_PREBUY_PCT', '50 (default)')}")
    print("Snapshots every 60s. Stop with Ctrl-C.")
    print("=" * 70, flush=True)

    # We need a handle on the repo to print state. The cleanest way is to
    # construct it the same way bot.main does, then run bot.main.boot()
    # concurrently with our state-printer.
    from bot.persistence.database import init_db, async_session_factory
    await init_db()
    from bot.persistence.repository import Repository
    repo = Repository(async_session_factory)

    # Start the printer in the background — it'll start emitting once
    # boot() has populated grid_state.
    printer_task = asyncio.create_task(_state_printer(repo))

    try:
        # Reuse bot.main.boot() as-is. It handles signals + shutdown internally.
        from bot.main import boot
        await boot()
    except KeyboardInterrupt:
        pass
    finally:
        printer_task.cancel()
        try:
            await printer_task
        except (asyncio.CancelledError, Exception):
            pass


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
