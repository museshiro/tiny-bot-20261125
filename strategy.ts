// strategy.ts — dip-buying trend strategy for agent-fun/bars-replay/v1.
//
// Idea: in a falling market, buy-and-hold bleeds; in a rising one it wins by
// holding everything. This bot only buys a dip inside an uptrend and banks
// small, fast profits, so it sits in cash while the market falls and rides
// pullbacks while it rises.
//
// Per symbol, over its own hourly bars:
//   - MACD(12, 26, 9) with TA-Lib seeding: EMA(26) starts as the mean of the
//     first 26 closes, EMA(12) as the mean of the 12 closes up to that bar,
//     the signal line as the mean of the first 9 MACD values.
//   - CCI(14) on the typical price (h + l + c) / 3.
// Entry (on a bar's close, filled at the next open):
//   MACD above its signal line (uptrend) AND CCI at or under -30 (dip).
//   A bar with zero volume signals nothing. -30 (not -48) was chosen after
//   grading both on the dev window: -30 enters shallower pullbacks, trades
//   more often (38 vs 32 trades) and scores slightly better (+$131 vs
//   +$121), which also helps clear the 8-trade guardrail on the shorter
//   72-bar final window.
// Exit (the whole position):
//   MACD under its signal line (trend broken), OR the position worth 2% over
//   its cost (take profit), OR 5% under it (stop loss).
// When more symbols signal entry than there are free slots, the deepest dip
// (lowest CCI) goes first; ties keep universe order.
//
// All math is float64 on + - * / alone and exact bigint comparisons, so the
// same bars give the same orders on every run. No clock, no environment,
// no randomness.

import type { Bar } from './vendor/makefun-bars.ts';

export const FAST_BARS = 12;
export const SLOW_BARS = 26;
export const SIGNAL_BARS = 9;
export const CCI_BARS = 14;
const CCI_SCALE = 0.015;
/** Enter when the dip is at least this oversold. */
export const CCI_ENTRY_AT_MOST = -30;
/** Take profit at 2% over cost: value * 100 >= cost * 102. */
export const TAKE_PROFIT_NUM = 102n;
export const TAKE_PROFIT_DEN = 100n;
/** Stop loss at 5% under cost: value * 100 <= cost * 95. */
export const STOP_NUM = 95n;
export const STOP_DEN = 100n;

export type Signal = 'up' | 'down' | null;

interface Series {
  /** The first SLOW_BARS closes, until the EMAs start. */
  warm: number[];
  fast: number | null;
  slow: number | null;
  /** The first SIGNAL_BARS MACD values, until the signal line starts. */
  macds: number[];
  signal: number | null;
  /** The last CCI_BARS typical prices, oldest first. */
  typical: number[];
  /** The CCI of the latest bar, null before the first 14 typical prices. */
  cci: number | null;
}

const mean = (xs: readonly number[]): number => xs.reduce((a, x) => a + x, 0) / xs.length;
const ema = (last: number, x: number, bars: number): number => (x - last) * (2 / (bars + 1)) + last;

export class Strategy {
  private readonly series = new Map<string, Series>();

  /** Fold one bar into its symbol's indicators; the signal and CCI on its close. */
  push(bar: Bar): { signal: Signal; cci: number | null } {
    let s = this.series.get(bar.symbol);
    if (s === undefined) {
      s = { warm: [], fast: null, slow: null, macds: [], signal: null, typical: [], cci: null };
      this.series.set(bar.symbol, s);
    }
    const c = Number(bar.c);
    if (s.slow === null || s.fast === null) {
      s.warm.push(c);
      if (s.warm.length === SLOW_BARS) {
        s.slow = mean(s.warm);
        s.fast = mean(s.warm.slice(SLOW_BARS - FAST_BARS));
      }
    } else {
      s.fast = ema(s.fast, c, FAST_BARS);
      s.slow = ema(s.slow, c, SLOW_BARS);
    }
    let macd: number | null = null;
    if (s.slow !== null && s.fast !== null) {
      macd = s.fast - s.slow;
      if (s.signal !== null) s.signal = ema(s.signal, macd, SIGNAL_BARS);
      else {
        s.macds.push(macd);
        if (s.macds.length === SIGNAL_BARS) s.signal = mean(s.macds);
      }
    }
    const typical = (Number(bar.h) + Number(bar.l) + c) / 3;
    s.typical.push(typical);
    if (s.typical.length > CCI_BARS) s.typical.shift();
    s.cci = null;
    if (s.typical.length === CCI_BARS) {
      const m = mean(s.typical);
      const spread = s.typical.reduce((a, x) => a + (x < m ? m - x : x - m), 0);
      const dev = typical - m;
      s.cci = dev === 0 || spread === 0 ? 0 : dev / (CCI_SCALE * (spread / CCI_BARS));
    }

    if (macd === null || s.signal === null || s.cci === null || bar.v === '0') return { signal: null, cci: s.cci };
    if (macd > s.signal && s.cci <= CCI_ENTRY_AT_MOST) return { signal: 'up', cci: s.cci };
    if (macd < s.signal) return { signal: 'down', cci: s.cci };
    return { signal: null, cci: s.cci };
  }

  /** Whether a held position exits on this close: trend broken, take profit, or stop loss. */
  exits(signal: Signal, value: bigint, cost: bigint): boolean {
    if (signal === 'down') return true;
    if (value * TAKE_PROFIT_DEN >= cost * TAKE_PROFIT_NUM) return true;
    if (value * STOP_DEN <= cost * STOP_NUM) return true;
    return false;
  }
}
