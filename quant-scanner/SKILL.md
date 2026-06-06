---
name: quant-scanner
description: Quantitative stock scanner with model-driven adaptive factor scoring. Scans ~100 US large/mid-cap stocks via Finnhub API, detects market regime (volatility, momentum, breadth), dynamically adjusts factor weights, and produces ranked selection/anomaly lists with HTML reports. Use for US stock screening, quantitative stock picking, factor analysis, market regime detection, stock scoring, building a model portfolio, or finding momentum/value/quality plays.
---

# Quant Scanner v1.0

Model-driven quantitative stock scanner for US equities. Scans ~100 large/mid-cap stocks, detects the current market regime, adaptively adjusts 5-factor scoring weights, and outputs ranked picks with an HTML report.

## Setup

**Required:** A free Finnhub API key.

1. Go to [https://finnhub.io](https://finnhub.io) and sign up (free)
2. Copy your API key from the dashboard
3. Set it as an environment variable:

```bash
export FINNHUB_API_KEY="your_key_here"
```

Or pass it directly via `--api-key`:

```bash
python3 {baseDir}/scripts/quant_scan.py --api-key YOUR_KEY
```

## Quick Commands

### Full Scan (HTML + JSON report)

```bash
python3 {baseDir}/scripts/quant_scan.py
```

This will:
1. Fetch quote, metrics, profile, and analyst recommendations for ~100 stocks
2. Detect market regime (volatility, momentum, breadth)
3. Score each stock on 5 adaptive factors
4. Output a ranked list + HTML report

### Quick Top 10

```bash
python3 {baseDir}/scripts/quant_scan.py --top 10
```

### Specific Tickers Only

```bash
python3 {baseDir}/scripts/quant_scan.py --tickers AAPL,NVDA,TSLA,GOOGL,META
```

### Custom Universe File

```bash
python3 {baseDir}/scripts/quant_scan.py --universe my_watchlist.txt
```

Where `my_watchlist.txt` has one ticker per line.

### JSON Output Only (for piping)

```bash
python3 {baseDir}/scripts/quant_scan.py --format json
```

## How It Works

### 5-Factor Adaptive Scoring

Each stock is scored on 5 factors. The weights **adapt** to the detected market regime:

| Factor | Base Weight | Bullish Adj | Bearish Adj | High-Vol Adj |
| --- | ---: | --- | --- | --- |
| **Momentum** (5D/13W/MTD return + relative strength vs S&P 500) | 30% | x1.3 boost | x0.7 dampen | — |
| **Value** (P/E, forward P/E, PEG, dividend yield) | 20% | x0.8 reduce | x1.3 boost | — |
| **Quality** (ROE, net margin, revenue growth, EPS growth) | 25% | — | — | x1.2 boost |
| **Analyst Sentiment** (buy/hold/sell consensus ratio) | 10% | — | — | — |
| **Risk-Adjusted** (beta, volatility, leverage, liquidity) | 15% | — | — | x1.4 penalty |

### Market Regime Detection

The scanner analyzes the full universe to determine:

- **Volatility Level** — HIGH / MEDIUM / LOW (3-month average annualized std dev)
- **Momentum Regime** — BULLISH / NEUTRAL / BEARISH (13-week return distribution)
- **Market Breadth** — BROAD RALLY / MIXED / BROAD DECLINE (5-day positive percentage)

### Data Sources (all free-tier Finnhub)

| Endpoint | Data |
| --- | --- |
| `quote` | Current price, daily change, high/low |
| `stock/metric` | 5D/13W/26W/52W/YTD returns, P/E, ROE, margins, beta, volatility, growth rates, relative to S&P 500 |
| `stock/profile2` | Company name, sector, market cap |
| `stock/recommendation` | Analyst buy/hold/sell consensus |

### Default Universe (~100 stocks)

**Mega Tech:** AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA
**Semiconductors:** AVGO, AMD, INTC, QCOM, MU, MRVL, AMAT, LRCX, KLAC, ON, ARM
**Software/Cloud:** CRM, ORCL, ADBE, NOW, SNOW, PLTR, PANW, CRWD, DDOG, NET, ZS, SHOP
**Financials:** JPM, V, MA, BAC, GS, MS, BLK, SCHW, AXP, C
**Healthcare:** UNH, LLY, JNJ, ABBV, PFE, MRK, TMO, ABT, BMY, GILD, AMGN, ISRG, VRTX
**Consumer:** WMT, COST, HD, MCD, NKE, SBUX, TGT, LOW, PG, KO, PEP
**Energy:** XOM, CVX, COP, SLB, EOG, OXY
**Industrials:** CAT, GE, HON, UNP, BA, RTX, LMT, DE
**Others:** NFLX, DIS, ABNB, UBER, COIN, SOFI, SMCI, MSTR
**China ADR:** BABA, PDD, JD, BIDU, NIO, LI, XPEV

## Output

### HTML Report (default)

A styled, responsive HTML file with:
- KPI dashboard (top pick, market regime, key metrics)
- Market regime detection panel
- Model portfolio (top 5 with factor decomposition)
- Full selection ranking (top 30)
- Anomaly ranking (top 20)
- Sector distribution
- Regime-adaptive weight explanation table

### JSON Report

Machine-readable output with all scored stocks, regime detection, and portfolio.

## Limitations

- Finnhub free tier: 60 API calls/minute — scanning 100 stocks takes ~2 minutes
- No intraday candle data on free tier — uses metric endpoint for returns
- Returns are point-in-time snapshots, not a real backtest
- **Not investment advice** — research and monitoring only

## Examples

```
User: scan the market and find me the best momentum plays
→ /quant_scan

User: what's the market regime right now?
→ /quant_regime

User: analyze NVDA AVGO AMD in detail
→ /quant_analyze NVDA AVGO AMD

User: give me a quick top 10 stock ranking
→ /quant_top
```
