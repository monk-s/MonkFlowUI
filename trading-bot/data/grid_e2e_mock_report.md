# v3 grid trader — live-mock E2E report

_Generated: 2026-05-26T17:39:23+00:00Z_

**Anchor price**: $77,000.00

## Summary: **6/6 scenarios PASSED**, 0 failed

| Scenario | Status | Asserts | Duration |
|---|---|---|---|
| happy_path_24h | PASS | 5/5 | 0.02s |
| cb_trip_45pct_drawdown | PASS | 5/5 | 0.00s |
| recenter_after_interval | PASS | 3/3 | 0.00s |
| capacity_30_levels | PASS | 2/2 | 0.00s |
| partial_prebuy_recovery | PASS | 2/2 | 0.00s |
| restart_idempotency | PASS | 3/3 | 0.00s |

## Details

### happy_path_24h
- Status: **PASS**
- Asserts passed: 5
- Asserts failed: 0
- Duration: 0.023s
- Metrics:
  - `n_buy_fills` = 60
  - `n_sell_fills` = 54
  - `final_inventory_qty` = 0.0425
  - `realized_pnl_total` = 62.762268297315025
  - `n_ticks` = 240

### cb_trip_45pct_drawdown
- Status: **PASS**
- Asserts passed: 5
- Asserts failed: 0
- Duration: 0.000s
- Metrics:
  - `drawdown_pct` = -45.0
  - `is_halted` = True
  - `halt_reason` = grid_dd_circuit_breaker: DD -45.00% (threshold -40.0%)
  - `closed_positions` = 1

### recenter_after_interval
- Status: **PASS**
- Asserts passed: 3
- Asserts failed: 0
- Duration: 0.002s
- Metrics:
  - `orders_before_recenter` = 3
  - `orders_after_recenter` = 3
  - `new_range_low` = 73150.0
  - `new_range_high` = 80850.0

### capacity_30_levels
- Status: **PASS**
- Asserts passed: 2
- Asserts failed: 0
- Duration: 0.002s
- Metrics:
  - `max_concurrent_orders` = 29
  - `total_unique_orders_placed` = 29

### partial_prebuy_recovery
- Status: **PASS**
- Asserts passed: 2
- Asserts failed: 0
- Duration: 0.000s
- Metrics:
  - `half_qty` = 0.025974025974025976
  - `topup_notional` = 1999.9999999999998
  - `final_status` = complete

### restart_idempotency
- Status: **PASS**
- Asserts passed: 3
- Asserts failed: 0
- Duration: 0.000s
- Metrics:
  - `first_qty` = 0.0259
  - `status_after_first` = complete
  - `should_retry_on_restart` = False

