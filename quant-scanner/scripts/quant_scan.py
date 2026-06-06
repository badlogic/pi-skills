# /// script
# requires-python = ">=3.9"
# ///
"""Quant Scanner — Model-driven adaptive US stock factor scoring.

Zero external dependencies (stdlib only). Fetches data from Finnhub free-tier API,
detects market regime, scores stocks on 5 adaptive factors, outputs HTML + JSON.

Usage:
    python3 quant_scan.py                          # Full scan, HTML report
    python3 quant_scan.py --top 10                  # Quick top-10
    python3 quant_scan.py --tickers AAPL,NVDA,TSLA  # Specific tickers
    python3 quant_scan.py --format json              # JSON only
    python3 quant_scan.py --api-key YOUR_KEY         # Pass key directly
"""

from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional


# ── Config ───────────────────────────────────────────────────────

DEFAULT_UNIVERSE = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
    "AVGO", "AMD", "INTC", "QCOM", "MU", "MRVL", "AMAT", "LRCX", "KLAC", "ON", "ARM",
    "CRM", "ORCL", "ADBE", "NOW", "SNOW", "PLTR", "PANW", "CRWD", "DDOG", "NET", "ZS", "SHOP",
    "JPM", "V", "MA", "BAC", "GS", "MS", "BLK", "SCHW", "AXP", "C",
    "UNH", "LLY", "JNJ", "ABBV", "PFE", "MRK", "TMO", "ABT", "BMY", "GILD", "AMGN", "ISRG", "VRTX",
    "WMT", "COST", "HD", "MCD", "NKE", "SBUX", "TGT", "LOW", "PG", "KO", "PEP",
    "XOM", "CVX", "COP", "SLB", "EOG", "OXY",
    "CAT", "GE", "HON", "UNP", "BA", "RTX", "LMT", "DE",
    "NFLX", "DIS", "ABNB", "UBER", "COIN", "SOFI",
    "SMCI", "MSTR",
    "BABA", "PDD", "JD", "BIDU", "NIO", "LI", "XPEV",
]


# ── Helpers ──────────────────────────────────────────────────────

def sf(val, default=0.0) -> float:
    try:
        v = float(val) if val is not None else default
        return default if math.isnan(v) or math.isinf(v) else v
    except (TypeError, ValueError):
        return default


def finnhub(api_key: str, endpoint: str, params: dict | None = None) -> dict | list:
    params = params or {}
    params["token"] = api_key
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"https://finnhub.io/api/v1/{endpoint}?{qs}"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 2:
                time.sleep(2)
                continue
            raise
        except Exception:
            if attempt < 2:
                time.sleep(1)
                continue
            raise


def fmt_cap(v: float) -> str:
    if v >= 1e6:
        return f"${v / 1e6:.1f}T"
    if v >= 1e3:
        return f"${v / 1e3:.0f}B"
    return f"${v:.0f}M"


# ── Data structures ──────────────────────────────────────────────

@dataclass
class StockData:
    symbol: str
    name: str
    industry: str
    market_cap: float
    price: float
    change_pct: float
    w52_high: float
    w52_low: float
    return_5d: float
    return_13w: float
    return_26w: float
    return_52w: float
    return_ytd: float
    return_mtd: float
    rel_sp500_13w: float
    rel_sp500_52w: float
    rel_sp500_ytd: float
    volatility_3m: float
    beta: float
    pe: float
    forward_pe: float
    ps: float
    pb: float
    peg: float
    ev_ebitda: float
    roe: float
    roa: float
    gross_margin: float
    net_margin: float
    revenue_growth_yoy: float
    revenue_growth_qoq: float
    eps_growth_yoy: float
    eps_growth_qoq: float
    dividend_yield: float
    payout_ratio: float
    current_ratio: float
    debt_equity: float
    analyst_buy: int
    analyst_hold: int
    analyst_sell: int


@dataclass
class Regime:
    volatility_level: str
    momentum_regime: str
    breadth_bias: str
    avg_return_5d: float
    avg_return_13w: float
    avg_volatility: float
    pct_positive_5d: float
    pct_positive_13w: float
    pct_beating_sp500: float


@dataclass
class ScoredStock:
    symbol: str
    name: str
    industry: str
    market_cap: float
    price: float
    change_pct: float
    return_5d: float
    return_13w: float
    return_52w: float
    return_ytd: float
    rel_sp500_ytd: float
    pe: float
    forward_pe: float
    roe: float
    revenue_growth_yoy: float
    eps_growth_yoy: float
    beta: float
    volatility_3m: float
    dividend_yield: float
    analyst_buy: int
    analyst_hold: int
    analyst_sell: int
    selection_score: float
    anomaly_score: float
    f_momentum: float
    f_value: float
    f_quality: float
    f_analyst: float
    f_risk: float
    tags: List[str] = field(default_factory=list)
    risk_notes: List[str] = field(default_factory=list)


# ── Scanner ──────────────────────────────────────────────────────

class Scanner:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.stocks: List[StockData] = []
        self.scored: List[ScoredStock] = []
        self.regime: Optional[Regime] = None
        self.errors: List[dict] = []

    def fetch_all(self, universe: List[str], delay: float = 0.4) -> None:
        total = len(universe)
        for i, sym in enumerate(universe):
            try:
                s = self._fetch(sym)
                if s:
                    self.stocks.append(s)
            except Exception as e:
                self.errors.append({"symbol": sym, "error": str(e)[:80]})
            if (i + 1) % 10 == 0:
                print(f"  [{i + 1}/{total}] {len(self.stocks)} ok / {len(self.errors)} err", file=sys.stderr)
            time.sleep(delay)
        print(f"Fetched {len(self.stocks)} stocks ({len(self.errors)} errors)", file=sys.stderr)

    def _fetch(self, sym: str) -> Optional[StockData]:
        q = finnhub(self.api_key, "quote", {"symbol": sym})
        if not q or sf(q.get("c")) == 0:
            return None
        p = finnhub(self.api_key, "stock/profile2", {"symbol": sym})
        mx = finnhub(self.api_key, "stock/metric", {"symbol": sym, "metric": "all"}).get("metric", {})
        recs = finnhub(self.api_key, "stock/recommendation", {"symbol": sym})
        lr = recs[0] if recs else {}
        return StockData(
            symbol=sym,
            name=(p.get("name") or sym)[:35],
            industry=p.get("finnhubIndustry", ""),
            market_cap=sf(p.get("marketCapitalization")),
            price=sf(q["c"]),
            change_pct=sf(q.get("dp")),
            w52_high=sf(mx.get("52WeekHigh"), sf(q["c"]) * 1.1),
            w52_low=sf(mx.get("52WeekLow"), sf(q["c"]) * 0.9),
            return_5d=sf(mx.get("5DayPriceReturnDaily")),
            return_13w=sf(mx.get("13WeekPriceReturnDaily")),
            return_26w=sf(mx.get("26WeekPriceReturnDaily")),
            return_52w=sf(mx.get("52WeekPriceReturnDaily")),
            return_ytd=sf(mx.get("yearToDatePriceReturnDaily")),
            return_mtd=sf(mx.get("monthToDatePriceReturnDaily")),
            rel_sp500_13w=sf(mx.get("priceRelativeToS&P50013Week")),
            rel_sp500_52w=sf(mx.get("priceRelativeToS&P50052Week")),
            rel_sp500_ytd=sf(mx.get("priceRelativeToS&P500Ytd")),
            volatility_3m=sf(mx.get("3MonthADReturnStd")),
            beta=sf(mx.get("beta"), 1.0),
            pe=sf(mx.get("peNormalizedAnnual")),
            forward_pe=sf(mx.get("forwardPE")),
            ps=sf(mx.get("psTTM")),
            pb=sf(mx.get("pbQuarterly")),
            peg=sf(mx.get("pegTTM")),
            ev_ebitda=sf(mx.get("evEbitdaTTM")),
            roe=sf(mx.get("roeTTM")),
            roa=sf(mx.get("roaTTM")),
            gross_margin=sf(mx.get("grossMarginTTM")),
            net_margin=sf(mx.get("netProfitMarginTTM")),
            revenue_growth_yoy=sf(mx.get("revenueGrowthTTMYoy")),
            revenue_growth_qoq=sf(mx.get("revenueGrowthQuarterlyYoy")),
            eps_growth_yoy=sf(mx.get("epsGrowthTTMYoy")),
            eps_growth_qoq=sf(mx.get("epsGrowthQuarterlyYoy")),
            dividend_yield=sf(mx.get("dividendYieldIndicatedAnnual")),
            payout_ratio=sf(mx.get("payoutRatioTTM")),
            current_ratio=sf(mx.get("currentRatioQuarterly")),
            debt_equity=sf(mx.get("totalDebt/totalEquityQuarterly")),
            analyst_buy=int(sf(lr.get("buy")) + sf(lr.get("strongBuy"))),
            analyst_hold=int(sf(lr.get("hold"))),
            analyst_sell=int(sf(lr.get("sell")) + sf(lr.get("strongSell"))),
        )

    def detect_regime(self) -> Regime:
        r5 = [s.return_5d for s in self.stocks]
        r13 = [s.return_13w for s in self.stocks]
        vols = [s.volatility_3m for s in self.stocks if s.volatility_3m > 0]
        rel = [s.rel_sp500_ytd for s in self.stocks]

        avg5 = statistics.mean(r5) if r5 else 0
        avg13 = statistics.mean(r13) if r13 else 0
        avgv = statistics.mean(vols) if vols else 20
        p5 = sum(1 for r in r5 if r > 0) / len(r5) * 100 if r5 else 50
        p13 = sum(1 for r in r13 if r > 0) / len(r13) * 100 if r13 else 50
        beat = sum(1 for r in rel if r > 0) / len(rel) * 100 if rel else 50

        self.regime = Regime(
            volatility_level="high" if avgv > 35 else ("low" if avgv < 15 else "medium"),
            momentum_regime="bullish" if avg13 > 5 and p13 > 60 else ("bearish" if avg13 < -5 and p13 < 40 else "neutral"),
            breadth_bias="broad_rally" if p5 > 65 else ("broad_decline" if p5 < 35 else "mixed"),
            avg_return_5d=round(avg5, 2), avg_return_13w=round(avg13, 2),
            avg_volatility=round(avgv, 2),
            pct_positive_5d=round(p5, 1), pct_positive_13w=round(p13, 1),
            pct_beating_sp500=round(beat, 1),
        )
        return self.regime

    def score_all(self) -> List[ScoredStock]:
        rg = self.regime or self.detect_regime()
        bull = rg.momentum_regime == "bullish"
        bear = rg.momentum_regime == "bearish"
        hvol = rg.volatility_level == "high"

        mb = 1.3 if bull else (0.7 if bear else 1.0)
        vb = 1.3 if bear else (0.8 if bull else 1.0)
        vp = 1.4 if hvol else 1.0
        qb = 1.2 if hvol else 1.0

        out = []
        for s in self.stocks:
            fm = s.return_5d * 0.8 * mb + s.return_13w * 0.15 * mb + s.return_mtd * 0.3 + s.rel_sp500_13w * 0.2 + s.rel_sp500_ytd * 0.1
            pes = max(12 - abs(s.pe - 22) / 4, 0) if 0 < s.pe < 80 else 0
            fps = max(10 - abs(s.forward_pe - 20) / 3, 0) if 0 < s.forward_pe < 60 else 0
            pegs = max(8 - abs(s.peg - 1.2) * 3, 0) if 0 < s.peg < 5 else 0
            fv = (pes + fps + pegs) * vb + min(s.dividend_yield * 3, 5)
            fq = (min(s.roe / 8, 6) if s.roe > 0 else -3) + (min(s.net_margin / 5, 5) if s.net_margin > 0 else -1) + min(s.revenue_growth_yoy / 5, 8) + min(s.eps_growth_yoy / 8, 6)
            fq *= qb
            tot = s.analyst_buy + s.analyst_hold + s.analyst_sell
            fa = ((s.analyst_buy / tot if tot else 0.5) - 0.5) * 25
            fr = -abs(s.beta - 1) * 4 * vp - s.volatility_3m * 0.08 * vp - min(max(s.debt_equity - 1, 0), 3) * 2 + min(s.current_ratio, 3) * 1.5

            score = fm * 0.30 + fv * 0.20 + fq * 0.25 + fa * 0.10 + fr * 0.15
            anom = abs(s.change_pct) * 2.5 + abs(s.return_5d) * 1.2 + s.volatility_3m * 0.2 + abs(s.rel_sp500_ytd) * 0.3

            tags = []
            if s.return_5d > 8: tags.append("5D Surge")
            elif s.return_5d > 3: tags.append("5D Strong")
            if s.return_13w > 15: tags.append("13W Strong")
            if s.rel_sp500_ytd > 10: tags.append("Beating S&P")
            elif s.rel_sp500_ytd < -10: tags.append("Lagging S&P")
            if s.revenue_growth_yoy > 20: tags.append("High Growth")
            if s.roe > 25: tags.append("High ROE")
            if 0 < s.pe < 15: tags.append("Value")
            if s.analyst_buy > s.analyst_hold + s.analyst_sell: tags.append("Buy Consensus")
            if abs(s.change_pct) > 3: tags.append("Big Mover")
            if s.dividend_yield > 2: tags.append("Dividend")
            if s.eps_growth_yoy > 30: tags.append("EPS Boom")
            if not tags: tags.append("Neutral")

            risks = []
            if s.pe > 60: risks.append("Expensive")
            if s.beta > 1.8: risks.append(f"High beta {s.beta:.1f}")
            if s.volatility_3m > 40: risks.append("High vol")
            if s.debt_equity > 2: risks.append("Leveraged")
            if not risks: risks.append("Balanced")

            out.append(ScoredStock(
                symbol=s.symbol, name=s.name, industry=s.industry,
                market_cap=s.market_cap, price=s.price, change_pct=s.change_pct,
                return_5d=s.return_5d, return_13w=s.return_13w, return_52w=s.return_52w,
                return_ytd=s.return_ytd, rel_sp500_ytd=s.rel_sp500_ytd,
                pe=s.pe, forward_pe=s.forward_pe, roe=s.roe,
                revenue_growth_yoy=s.revenue_growth_yoy, eps_growth_yoy=s.eps_growth_yoy,
                beta=s.beta, volatility_3m=s.volatility_3m, dividend_yield=s.dividend_yield,
                analyst_buy=s.analyst_buy, analyst_hold=s.analyst_hold, analyst_sell=s.analyst_sell,
                selection_score=round(score, 2), anomaly_score=round(anom, 2),
                f_momentum=round(fm, 2), f_value=round(fv, 2), f_quality=round(fq, 2),
                f_analyst=round(fa, 2), f_risk=round(fr, 2),
                tags=tags, risk_notes=risks,
            ))

        self.scored = sorted(out, key=lambda x: x.selection_score, reverse=True)
        return self.scored


# ── HTML ─────────────────────────────────────────────────────────

def bdg(level: str, text: str) -> str:
    c = {"high": "#dc2626", "low": "#16a34a", "medium": "#d97706",
         "bullish": "#16a34a", "bearish": "#dc2626", "neutral": "#6b7280",
         "broad_rally": "#16a34a", "broad_decline": "#dc2626", "mixed": "#6b7280"}.get(level, "#6b7280")
    return f'<span style="display:inline-block;padding:2px 10px;border-radius:12px;background:{c}22;color:{c};font-weight:600;font-size:.85rem">{text}</span>'


def html_report(sc: Scanner) -> str:
    rg = sc.regime
    scored = sc.scored
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    sels = [s for s in scored if s.selection_score > 0][:30]
    anoms = sorted(scored, key=lambda x: x.anomaly_score, reverse=True)[:20]
    port = scored[:5]

    ic: Dict[str, int] = {}
    for s in scored[:50]:
        ic[s.industry] = ic.get(s.industry, 0) + 1
    ti = sorted(ic.items(), key=lambda x: x[1], reverse=True)[:12]

    def trs(items, cols_fn):
        return "\n".join(f"<tr>{cols_fn(i, s)}</tr>" for i, s in enumerate(items, 1))

    def sel_cols(i, s):
        tg = " ".join(f'<span class="tg">{t}</span>' for t in s.tags)
        return (f"<td>{i}</td><td class='tk'>{s.symbol}</td><td>{s.name}</td><td>{s.industry}</td>"
                f"<td class='n'>${s.price:.2f}</td>"
                f"<td class='n {'u' if s.change_pct>0 else 'd'}'>{s.change_pct:+.2f}%</td>"
                f"<td class='n {'u' if s.return_5d>0 else 'd'}'>{s.return_5d:+.1f}%</td>"
                f"<td class='n {'u' if s.return_13w>0 else 'd'}'>{s.return_13w:+.1f}%</td>"
                f"<td class='n {'u' if s.return_ytd>0 else 'd'}'>{s.return_ytd:+.1f}%</td>"
                f"<td class='n'>{s.pe:.1f}</td><td class='n'>{s.roe:.1f}%</td>"
                f"<td class='n'>{s.revenue_growth_yoy:+.1f}%</td>"
                f"<td class='n'>{s.eps_growth_yoy:+.1f}%</td>"
                f"<td class='n sc'>{s.selection_score:.1f}</td><td>{tg}</td>")

    def an_cols(i, s):
        tg = " ".join(f'<span class="tg">{t}</span>' for t in s.tags)
        return (f"<td>{i}</td><td class='tk'>{s.symbol}</td><td>{s.name}</td>"
                f"<td class='n {'u' if s.change_pct>0 else 'd'}'>{s.change_pct:+.2f}%</td>"
                f"<td class='n'>{s.return_5d:+.1f}%</td><td class='n'>{s.volatility_3m:.1f}%</td>"
                f"<td class='n'>{s.beta:.2f}</td><td class='n sc'>{s.anomaly_score:.1f}</td><td>{tg}</td>")

    ps = sum(max(s.selection_score, .01) for s in port) or 1
    def pt_cols(i, s):
        w = min(max(s.selection_score, .01) / ps * 100, 35)
        rn = "; ".join(s.risk_notes[:2])
        return (f"<td class='tk'>{s.symbol}</td><td>{s.name}</td><td class='n'>{w:.1f}%</td>"
                f"<td class='n'>{fmt_cap(s.market_cap)}</td><td class='n'>{s.pe:.1f}</td>"
                f"<td class='n'>{s.roe:.1f}%</td><td class='n sc'>{s.selection_score:.1f}</td><td>{rn}</td>")

    def fc_cols(i, s):
        def c(v): return 'u' if v > 0 else 'd'
        return (f"<td class='tk'>{s.symbol}</td><td>{s.name}</td>"
                f"<td class='n {c(s.f_momentum)}'>{s.f_momentum:.1f}</td>"
                f"<td class='n {c(s.f_value)}'>{s.f_value:.1f}</td>"
                f"<td class='n {c(s.f_quality)}'>{s.f_quality:.1f}</td>"
                f"<td class='n {c(s.f_analyst)}'>{s.f_analyst:.1f}</td>"
                f"<td class='n {c(s.f_risk)}'>{s.f_risk:.1f}</td>")

    best = port[0] if port else None

    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>US Quant Scanner</title>
<style>
:root{{--i:#0f172a;--m:#475569;--p:rgba(255,255,255,.92);--a:#1d4ed8;--a2:#7c3aed;--r:#dc2626;--g:#16a34a;--o:#d97706;--l:rgba(15,23,42,.08);--s:0 4px 24px rgba(15,23,42,.08)}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{color:var(--i);background:linear-gradient(135deg,#eff6ff,#f5f3ff 40%,#fefce8);font-family:-apple-system,"SF Pro","Segoe UI",sans-serif;line-height:1.6;padding:24px 16px 80px}}
.ct{{max-width:1440px;margin:0 auto}}
hd{{display:block;text-align:center;margin-bottom:36px;padding:48px 24px 36px;background:var(--p);border-radius:24px;border:1px solid var(--l);box-shadow:var(--s)}}
hd h1{{font-size:clamp(1.8rem,4vw,3rem);letter-spacing:-.04em;background:linear-gradient(135deg,var(--a),var(--a2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}}
hd .mt{{color:var(--m);font-size:.9rem}}hd .mt span{{margin:0 8px}}
.cd{{background:var(--p);border-radius:20px;border:1px solid var(--l);box-shadow:var(--s);padding:28px;margin-bottom:24px}}
.cd h2{{font-size:1.3rem;letter-spacing:-.02em;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid var(--a);display:flex;align-items:center;gap:8px}}
.cd h2 .nm{{color:var(--a);font-size:.85rem;font-weight:400}}
.g2{{display:grid;grid-template-columns:1fr 1fr;gap:24px}}.g3{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px}}
@media(max-width:900px){{.g2,.g3{{grid-template-columns:1fr}}}}
.kp{{text-align:center;padding:20px;border-radius:16px;background:linear-gradient(135deg,rgba(29,78,216,.06),rgba(124,58,237,.06));border:1px solid var(--l)}}
.kp .lb{{font-size:.8rem;color:var(--m);margin-bottom:4px}}.kp .vl{{font-size:1.8rem;font-weight:700;letter-spacing:-.02em}}
.kp .vl.u{{color:var(--g)}}.kp .vl.d{{color:var(--r)}}.kp .vl.ac{{color:var(--a)}}
table{{width:100%;border-collapse:separate;border-spacing:0;font-size:.83rem;overflow:hidden;border-radius:14px;border:1px solid var(--l)}}
th{{background:#1e293b;color:#f8fafc;text-align:left;font-weight:600;padding:10px 12px;white-space:nowrap;position:sticky;top:0;z-index:2}}
td{{padding:8px 12px;border-bottom:1px solid var(--l);vertical-align:top}}
tr:nth-child(even) td{{background:rgba(29,78,216,.03)}}tr:hover td{{background:rgba(124,58,237,.06)}}
.n{{text-align:right;font-variant-numeric:tabular-nums}}.u{{color:var(--g)}}.d{{color:var(--r)}}.sc{{font-weight:700;color:var(--a)}}
.tk{{font-family:"SF Mono",Menlo,monospace;font-size:.82rem;color:var(--a2);font-weight:600}}
.tg{{display:inline-block;padding:1px 8px;border-radius:8px;background:rgba(29,78,216,.1);color:var(--a);font-size:.72rem;margin:1px 2px;white-space:nowrap}}
.rg{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px}}
.ri{{padding:14px;border-radius:12px;background:rgba(29,78,216,.04);border:1px solid var(--l)}}.ri .dm{{font-size:.78rem;color:var(--m)}}.ri .vl{{font-size:1.1rem;font-weight:600;margin-top:4px}}
.st{{overflow-x:auto}}.ds{{text-align:center;color:var(--m);font-size:.78rem;padding:24px;border-top:1px solid var(--l);margin-top:36px}}
</style></head><body><div class="ct">

<hd><h1>US Stock Quant Scanner</h1>
<div class="mt"><span>{now}</span><span>|</span><span>{len(sc.stocks)} stocks scanned</span><span>|</span><span>Finnhub API</span><span>|</span><span>Adaptive Factor Model</span></div></hd>

<div class="g3" style="margin-bottom:24px">
<div class="kp"><div class="lb">Top Pick</div><div class="vl ac">{best.symbol if best else '-'}</div><div class="lb">{best.name if best else ''} &mdash; Score {best.selection_score if best else 0}</div></div>
<div class="kp"><div class="lb">13W Avg Return</div><div class="vl {'u' if rg.avg_return_13w>0 else 'd'}">{rg.avg_return_13w:+.1f}%</div><div class="lb">{rg.pct_positive_13w}% positive</div></div>
<div class="kp"><div class="lb">Beating S&P YTD</div><div class="vl ac">{rg.pct_beating_sp500}%</div><div class="lb">of universe</div></div>
</div>

<div class="cd"><h2>Market Regime <span class="nm">Adaptive Core</span></h2>
<div class="rg">
<div class="ri"><div class="dm">Volatility</div><div class="vl">{bdg(rg.volatility_level, rg.volatility_level.upper())} {rg.avg_volatility:.1f}%</div></div>
<div class="ri"><div class="dm">Momentum (13W)</div><div class="vl">{bdg(rg.momentum_regime, rg.momentum_regime.upper())} {rg.avg_return_13w:+.1f}%</div></div>
<div class="ri"><div class="dm">Breadth (5D)</div><div class="vl">{bdg(rg.breadth_bias, rg.breadth_bias.replace('_',' ').upper())} {rg.pct_positive_5d}%+</div></div>
<div class="ri"><div class="dm">5D Avg Return</div><div class="vl">{rg.avg_return_5d:+.2f}%</div></div>
</div></div>

<div class="g2">
<div class="cd"><h2>Model Portfolio <span class="nm">Top 5</span></h2>
<table><tr><th>Ticker</th><th>Name</th><th>Wt</th><th>MCap</th><th>P/E</th><th>ROE</th><th>Score</th><th>Risk</th></tr>
{trs(port, pt_cols)}</table></div>
<div class="cd"><h2>Factor Decomposition</h2>
<table><tr><th>Ticker</th><th>Name</th><th>Mom</th><th>Val</th><th>Qual</th><th>Anlst</th><th>Risk</th></tr>
{trs(port, fc_cols)}</table></div>
</div>

<div class="cd"><h2>Selection Ranking <span class="nm">Top {len(sels)}</span></h2>
<div class="st"><table><tr><th>#</th><th>Ticker</th><th>Name</th><th>Sector</th><th>Price</th><th>Chg</th><th>5D</th><th>13W</th><th>YTD</th><th>P/E</th><th>ROE</th><th>RevGr</th><th>EPSGr</th><th>Score</th><th>Tags</th></tr>
{trs(sels, sel_cols)}</table></div></div>

<div class="cd"><h2>Anomaly Ranking <span class="nm">Top {len(anoms)}</span></h2>
<div class="st"><table><tr><th>#</th><th>Ticker</th><th>Name</th><th>Chg</th><th>5D</th><th>Vol3M</th><th>Beta</th><th>Anom</th><th>Tags</th></tr>
{trs(anoms, an_cols)}</table></div></div>

<div class="cd"><h2>Sector Distribution <span class="nm">Top 50</span></h2>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">
{"".join(f'<div style="padding:8px 14px;background:rgba(29,78,216,.06);border-radius:10px;display:flex;justify-content:space-between"><span>{ind}</span><span style="font-weight:700;color:var(--a)">{cnt}</span></div>' for ind,cnt in ti)}
</div></div>

<div class="cd"><h2>Adaptive Weight Table</h2>
<table><tr><th>Factor</th><th>Base</th><th>Current Adj</th><th>Rationale</th></tr>
<tr><td>Momentum</td><td>30%</td><td>{'x1.3' if rg.momentum_regime=='bullish' else 'x0.7' if rg.momentum_regime=='bearish' else 'x1.0'}</td><td>{'Bullish — ride trend' if rg.momentum_regime=='bullish' else 'Bearish — dampen chase' if rg.momentum_regime=='bearish' else 'Neutral'}</td></tr>
<tr><td>Value</td><td>20%</td><td>{'x1.3' if rg.momentum_regime=='bearish' else 'x0.8' if rg.momentum_regime=='bullish' else 'x1.0'}</td><td>{'Bearish — flight to value' if rg.momentum_regime=='bearish' else 'Bullish — growth favored' if rg.momentum_regime=='bullish' else 'Balanced'}</td></tr>
<tr><td>Quality</td><td>25%</td><td>{'x1.2' if rg.volatility_level=='high' else 'x1.0'}</td><td>{'High vol — quality premium' if rg.volatility_level=='high' else 'Normal'}</td></tr>
<tr><td>Analyst</td><td>10%</td><td>x1.0</td><td>Stable across regimes</td></tr>
<tr><td>Risk</td><td>15%</td><td>{'x1.4' if rg.volatility_level=='high' else 'x1.0'}</td><td>{'High vol — heavier penalty' if rg.volatility_level=='high' else 'Normal'}</td></tr>
</table></div>

<div class="ds">For research only — not investment advice. Data: Finnhub (free tier). Engine: Adaptive Factor Model. {now}</div>
</div></body></html>"""


# ── Text output ──────────────────────────────────────────────────

def text_report(sc: Scanner, top: int) -> str:
    rg = sc.regime
    scored = sc.scored
    lines = [
        f"Market Regime: vol={rg.volatility_level} mom={rg.momentum_regime} breadth={rg.breadth_bias}",
        f"  5D avg={rg.avg_return_5d:+.2f}%  13W avg={rg.avg_return_13w:+.2f}%  vol={rg.avg_volatility:.1f}%",
        f"  {rg.pct_positive_5d}% positive 5D | {rg.pct_positive_13w}% positive 13W | {rg.pct_beating_sp500}% beating S&P",
        "",
        f"Top {top} Selections:",
    ]
    for i, s in enumerate(scored[:top], 1):
        lines.append(
            f"  {i:2d}. {s.symbol:6s} {s.name:28s} score={s.selection_score:6.1f} "
            f"5D={s.return_5d:+6.1f}% YTD={s.return_ytd:+7.1f}% PE={s.pe:5.1f} "
            f"ROE={s.roe:6.1f}% tags={s.tags}"
        )
    lines.append(f"\nTop 10 Anomalies:")
    for i, s in enumerate(sorted(scored, key=lambda x: x.anomaly_score, reverse=True)[:10], 1):
        lines.append(
            f"  {i:2d}. {s.symbol:6s} chg={s.change_pct:+5.2f}% 5D={s.return_5d:+6.1f}% "
            f"vol={s.volatility_3m:5.1f}% anom={s.anomaly_score:.1f}"
        )
    return "\n".join(lines)


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="US Stock Quant Scanner")
    parser.add_argument("--api-key", default=os.environ.get("FINNHUB_API_KEY", ""),
                        help="Finnhub API key (or set FINNHUB_API_KEY env var)")
    parser.add_argument("--tickers", default="", help="Comma-separated tickers (default: full universe)")
    parser.add_argument("--universe", default="", help="File with one ticker per line")
    parser.add_argument("--top", type=int, default=30, help="Top N to display")
    parser.add_argument("--format", choices=["text", "json", "html", "all"], default="all",
                        help="Output format (default: all)")
    parser.add_argument("--output-dir", default=".", help="Output directory for reports")
    parser.add_argument("--delay", type=float, default=0.4, help="Delay between API calls (seconds)")
    args = parser.parse_args()

    api_key = args.api_key
    if not api_key:
        print("Error: No Finnhub API key. Set FINNHUB_API_KEY or use --api-key.", file=sys.stderr)
        print("Get a free key at https://finnhub.io", file=sys.stderr)
        sys.exit(1)

    # Determine universe
    if args.tickers:
        universe = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
    elif args.universe:
        universe = [l.strip().upper() for l in Path(args.universe).read_text().splitlines() if l.strip() and not l.startswith("#")]
    else:
        universe = DEFAULT_UNIVERSE

    print(f"Quant Scanner: {len(universe)} tickers, format={args.format}", file=sys.stderr)

    sc = Scanner(api_key)
    sc.fetch_all(universe, delay=args.delay)

    if not sc.stocks:
        print(json.dumps({"ok": False, "error": "No stocks fetched", "errors": sc.errors}))
        sys.exit(2)

    sc.detect_regime()
    sc.score_all()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.format in ("text", "all"):
        txt = text_report(sc, args.top)
        print(txt)

    if args.format in ("json", "all"):
        payload = {
            "ok": True,
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "universe": len(sc.stocks),
            "errors": sc.errors,
            "regime": asdict(sc.regime),
            "top_selections": [asdict(s) for s in sc.scored[:args.top]],
            "top_anomalies": [asdict(s) for s in sorted(sc.scored, key=lambda x: x.anomaly_score, reverse=True)[:20]],
            "portfolio": [asdict(s) for s in sc.scored[:5]],
        }
        jp = out_dir / "quant_scan_result.json"
        jp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.format == "json":
            print(json.dumps(payload, ensure_ascii=False, indent=2))

    if args.format in ("html", "all"):
        html = html_report(sc)
        hp = out_dir / "quant_scan_report.html"
        hp.write_text(html, encoding="utf-8")
        print(f"\nHTML report: {hp}", file=sys.stderr)

    print(f"\nDone. {len(sc.stocks)} stocks scored.", file=sys.stderr)


if __name__ == "__main__":
    main()
