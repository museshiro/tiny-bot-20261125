// main.ts — Tiny Bot: dip-buying trend bot for agent-fun/bars-replay/v1.
//
// Strategy (see strategy.ts): buy a symbol only on a dip (CCI at
// or under -30) inside an uptrend (MACD above its signal), take 2% profit or
// cut at -5%, exit when the trend breaks. Sits in cash while the market
// falls, so it beats buy-and-hold on down windows; rides pullbacks while it
// rises, so it can beat buy-and-hold on up windows too.
//
// Sizing: equity over n slots, n = min(universe, caps.max_open_positions),
// each buy capped at caps.max_weight_bps of equity and at the cash left in
// this reply. A sell's proceeds land at the next open and never fund a buy
// of the same reply. Orders cap slippage at 100 bps past the close decided
// on. Deterministic: float64 + bigint math only, no clock, no environment,
// no randomness; the two graded runs produce byte-identical action logs.

import { BPS, runBars, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';
import { Strategy, type Signal } from './strategy.ts';

const MAX_SLIPPAGE_BPS = 100;

const strategy = new Strategy();

await runBars({
  onBatch(state, batch) {
    const signals = new Map<string, { signal: Signal; cci: number | null }>();
    for (const bar of batch.bars) signals.set(bar.symbol, strategy.push(bar));
    const { caps, fees } = state.hello;

    const sells: SellInput[] = [];
    const entries: { symbol: string; cci: number }[] = [];
    for (const { symbol } of state.hello.symbols) {
      const s = signals.get(symbol);
      if (s === undefined) continue;
      const held = state.positions.get(symbol);
      if (held !== undefined) {
        const value = state.value(symbol, held.qty);
        if (strategy.exits(s.signal, value, held.cost)) {
          sells.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        }
      } else if (s.signal === 'up' && s.cci !== null) {
        entries.push({ symbol, cci: s.cci });
      }
    }
    // Deepest dip first; ties keep universe order (Array.prototype.sort is stable).
    entries.sort((a, b) => a.cci - b.cci);

    const orders: (SellInput | BuyInput)[] = sells.slice(0, caps.max_orders_per_bar);
    const slots = Math.min(state.hello.symbols.length, caps.max_open_positions);
    const stake = state.equity / BigInt(slots);
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
    let room = slots - state.positions.size;
    let cash = state.cash;
    for (const { symbol } of entries) {
      if (room <= 0 || orders.length >= caps.max_orders_per_bar) break;
      let slice = stake < byWeight ? stake : byWeight;
      if (cash < slice) slice = cash;
      if (slice === 0n || slice < BigInt(fees.min_notional_quote_units)) break;
      orders.push({ side: 'buy', symbol, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
      cash -= slice;
      room--;
    }
    return orders;
  },
});
