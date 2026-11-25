# Tiny Bot — dip-buying trend bot

[![competition](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/museshiro/tiny-bot-20261125/rank.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/museshiro/tiny-bot-20261125/reward.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

Entry for [Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1) — a paper-trading bot for hourly Solana prices.

## Strategy

Buy a symbol only on an oversold dip (CCI(14) at or under −48) inside an uptrend (MACD(12, 26, 9) above its signal line). Exit the whole position when the trend breaks, at +2% take profit, or at −5% stop loss. Sits in cash while the market falls, rides pullbacks while it rises — built to beat buy-and-hold on either kind of window.

`vendor/makefun-bars.ts` is the kit's bars-replay/v1 shim, copied byte-for-byte as the SDK instructs. `strategy.ts` holds the indicators and signals; `main.ts` wires them to the harness. Fully deterministic: float64 + bigint math only, no clock, no environment, no randomness — the two graded runs produce byte-identical action logs.
