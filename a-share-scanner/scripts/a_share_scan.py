# /// script
# requires-python = ">=3.9"
# dependencies = ["tushare", "pandas"]
# ///
"""A-Share Quant Scanner — Tushare-powered, model-driven adaptive factor scoring.

Scans full A-share market (5000+ stocks), detects market regime,
scores on 6 adaptive factors, outputs HTML + JSON report.

Usage:
    python3 a_share_scan.py                           # Full scan
    python3 a_share_scan.py --top 10                   # Quick top 10
    python3 a_share_scan.py --codes 000001,600519      # Specific codes
    python3 a_share_scan.py --format json               # JSON only
    python3 a_share_scan.py --token YOUR_TUSHARE_TOKEN  # Pass token
"""

from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

try:
    import tushare as ts
    import pandas as pd
except ImportError:
    print("Error: 需要安装 tushare 和 pandas", file=sys.stderr)
    print("  pip install tushare pandas", file=sys.stderr)
    print("  或: uv run a_share_scan.py (自动安装)", file=sys.stderr)
    sys.exit(1)


# ── Helpers ──────────────────────────────────────────────────────

def sf(val, default=0.0) -> float:
    try:
        v = float(val) if val is not None else default
        return default if math.isnan(v) or math.isinf(v) else v
    except (TypeError, ValueError):
        return default


def pct(cur: float, prev: float) -> float:
    return (cur - prev) / prev * 100 if prev else 0.0


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def to_westock_code(ts_code: str) -> str:
    digits, market = ts_code.split(".")
    return f"{market.lower()}{digits}"


# ── Data ─────────────────────────────────────────────────────────

@dataclass
class StockRow:
    ts_code: str
    code: str
    name: str
    industry: str
    market: str
    close: float
    pct_chg: float
    return_5d: float
    return_20d: float
    volume_ratio: float
    turnover_rate: float
    amount: float
    total_mv: float
    pe_ttm: float
    pb: float
    selection_score: float
    anomaly_score: float
    f_momentum: float
    f_volume: float
    f_valuation: float
    f_growth: float
    f_analyst: float
    f_risk: float
    tags: List[str] = field(default_factory=list)
    risk_notes: List[str] = field(default_factory=list)


@dataclass
class Regime:
    volatility_level: str
    momentum_regime: str
    money_flow_bias: str
    avg_pct_chg: float
    std_pct_chg: float
    pct_positive: float
    limit_up_count: int
    limit_down_count: int
    up_down_ratio: float
    avg_turnover: float
    avg_volume_ratio: float


# ── Scanner ──────────────────────────────────────────────────────

class AShareScanner:
    def __init__(self, token: str):
        ts.set_token(token)
        self.pro = ts.pro_api(token)
        self.stocks: List[StockRow] = []
        self.regime: Optional[Regime] = None
        self.trade_date: str = ""
        self.universe_count: int = 0
        self.filtered_count: int = 0

    def scan(self, *, top_n: int = 100, min_amount: float = 100000.0,
             specific_codes: List[str] | None = None) -> None:
        print("获取交易日历...", file=sys.stderr)
        trade_dates = self._trade_dates(lookback=90)
        self.trade_date = trade_dates[-1]
        print(f"最新交易日: {self.trade_date}", file=sys.stderr)

        print("获取全A日线快照...", file=sys.stderr)
        latest = self.pro.daily(trade_date=self.trade_date)
        if latest is None or latest.empty:
            raise RuntimeError(f"未获取到 {self.trade_date} 的日线数据")
        self.universe_count = len(latest)

        # Reference dates
        idx = trade_dates.index(self.trade_date)
        date_5d = trade_dates[max(0, idx - 5)]
        date_20d = trade_dates[max(0, idx - 20)]

        print(f"获取参照日行情 (5D={date_5d}, 20D={date_20d})...", file=sys.stderr)
        daily_5d = self.pro.daily(trade_date=date_5d)
        daily_20d = self.pro.daily(trade_date=date_20d)

        print("获取股票基本信息...", file=sys.stderr)
        basics = self.pro.stock_basic(exchange="", list_status="L",
                                       fields="ts_code,name,industry,market,list_date")

        print("获取每日指标 (量比/PE/PB/市值)...", file=sys.stderr)
        daily_basic = self._safe_daily_basic(self.trade_date)

        # Merge
        df = latest.merge(daily_5d[["ts_code", "close"]].rename(columns={"close": "close_5d"}),
                          on="ts_code", how="left")
        df = df.merge(daily_20d[["ts_code", "close"]].rename(columns={"close": "close_20d"}),
                      on="ts_code", how="left")
        df = df.merge(basics, on="ts_code", how="left")
        if daily_basic is not None:
            df = df.merge(daily_basic, on="ts_code", how="left")

        print("评分中...", file=sys.stderr)
        rows = []
        for item in df.to_dict("records"):
            name = str(item.get("name") or "")
            if not name or "ST" in name.upper():
                continue
            close = sf(item.get("close"))
            amount = sf(item.get("amount"))
            if close <= 2 or amount < min_amount:
                continue

            ts_code = item["ts_code"]
            code = to_westock_code(ts_code)

            if specific_codes and code not in specific_codes and ts_code not in specific_codes:
                continue

            pct_chg = sf(item.get("pct_chg"))
            return_5d = pct(close, sf(item.get("close_5d")))
            return_20d = pct(close, sf(item.get("close_20d")))
            volume_ratio = sf(item.get("volume_ratio"))
            turnover = sf(item.get("turnover_rate"))
            total_mv = sf(item.get("total_mv"))
            pe = sf(item.get("pe_ttm"))
            pb = sf(item.get("pb"))

            rows.append({
                "ts_code": ts_code, "code": code, "name": name,
                "industry": str(item.get("industry") or ""),
                "market": str(item.get("market") or ""),
                "close": close, "pct_chg": pct_chg,
                "return_5d": return_5d, "return_20d": return_20d,
                "volume_ratio": volume_ratio, "turnover_rate": turnover,
                "amount": amount, "total_mv": total_mv,
                "pe_ttm": pe, "pb": pb,
            })

        self.filtered_count = len(rows)
        print(f"过滤后: {self.filtered_count} 只 (原始 {self.universe_count})", file=sys.stderr)

        # Detect regime
        self.regime = self._detect_regime(rows)

        # Score
        self.stocks = self._score_all(rows, top_n)

    def _trade_dates(self, lookback: int) -> List[str]:
        end = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=lookback * 2)).strftime("%Y%m%d")
        cal = self.pro.trade_cal(exchange="SSE", start_date=start, end_date=end,
                                  is_open="1", fields="cal_date")
        return sorted(str(v) for v in cal["cal_date"].tolist())

    def _safe_daily_basic(self, trade_date: str):
        try:
            fields = "ts_code,trade_date,turnover_rate,volume_ratio,total_mv,circ_mv,pe_ttm,pb"
            db = self.pro.daily_basic(trade_date=trade_date, fields=fields)
            if db is None or db.empty:
                return None
            return db.drop(columns=["trade_date"], errors="ignore")
        except Exception:
            return None

    def _detect_regime(self, rows: List[dict]) -> Regime:
        chgs = [r["pct_chg"] for r in rows]
        vrs = [r["volume_ratio"] for r in rows if r["volume_ratio"] > 0]
        tos = [r["turnover_rate"] for r in rows if r["turnover_rate"] > 0]

        avg_chg = statistics.mean(chgs) if chgs else 0
        std_chg = statistics.stdev(chgs) if len(chgs) > 1 else 2
        pct_pos = sum(1 for c in chgs if c > 0) / len(chgs) * 100 if chgs else 50
        limit_up = sum(1 for c in chgs if c >= 9.5)
        limit_down = sum(1 for c in chgs if c <= -9.5)
        ratio = sum(1 for c in chgs if c > 0) / max(sum(1 for c in chgs if c < 0), 1)
        avg_vr = statistics.mean(vrs) if vrs else 1
        avg_to = statistics.mean(tos) if tos else 3

        vol = "high" if std_chg > 3.5 else ("low" if std_chg < 1.5 else "medium")
        mom = "trending" if avg_chg > 1 and pct_pos > 60 else (
              "declining" if avg_chg < -1 and pct_pos < 40 else "neutral")
        mf = "bullish" if ratio > 1.5 and limit_up > limit_down * 2 else (
             "bearish" if ratio < 0.7 and limit_down > limit_up else "neutral")

        return Regime(
            volatility_level=vol, momentum_regime=mom, money_flow_bias=mf,
            avg_pct_chg=round(avg_chg, 3), std_pct_chg=round(std_chg, 3),
            pct_positive=round(pct_pos, 1),
            limit_up_count=limit_up, limit_down_count=limit_down,
            up_down_ratio=round(ratio, 2),
            avg_turnover=round(avg_to, 2), avg_volume_ratio=round(avg_vr, 2),
        )

    def _score_all(self, rows: List[dict], top_n: int) -> List[StockRow]:
        rg = self.regime
        trending = rg.momentum_regime == "trending"
        declining = rg.momentum_regime == "declining"
        hvol = rg.volatility_level == "high"

        mb = 1.3 if trending else (0.7 if declining else 1.0)
        vb = 1.3 if declining else (0.8 if trending else 1.0)
        vp = 1.4 if hvol else 1.0
        qb = 1.2 if hvol else 1.0

        # Normalize amount for liquidity score
        max_amt = max((r["amount"] for r in rows), default=1) or 1

        scored = []
        for r in rows:
            # F1: Momentum
            fm = (
                clamp(r["pct_chg"], -10, 10) * 1.5 * mb
                + clamp(r["return_5d"], -30, 60) * 0.8 * mb
                + clamp(r["return_20d"], -40, 120) * 0.25
            )

            # F2: Volume/Liquidity
            fv = (
                clamp(r["volume_ratio"], 0, 5) * 6
                + clamp(r["turnover_rate"], 0, 20) * 0.5
                + math.log1p(r["amount"]) / math.log1p(max_amt) * 10
            )

            # F3: Valuation
            pe = r["pe_ttm"]
            pe_score = max(10 - abs(pe - 30) / 5, 0) if 0 < pe < 100 else 0
            pb_score = max(8 - abs(r["pb"] - 3) / 1.5, 0) if 0 < r["pb"] < 20 else 0
            fval = (pe_score + pb_score) * vb

            # F4: Growth proxy (from price momentum as proxy, since we don't have financials in daily)
            fg = (
                clamp(r["return_5d"], 0, 50) * 0.4
                + clamp(r["return_20d"], 0, 100) * 0.2
            ) * qb

            # F5: Analyst proxy (volume + price confirmation)
            fa = 0.0
            if r["pct_chg"] > 0 and 1.2 <= r["volume_ratio"] <= 4.5:
                fa = 8  # 量价配合
            if r["pct_chg"] > 0 and r["return_5d"] > 0 and r["return_20d"] > 0:
                fa += 5  # 多周期共振

            # F6: Risk
            fr = (
                -max(r["pct_chg"] - 9.5, 0) * 4  # 涨停追高风险
                - max(r["return_20d"] - 80, 0) * 0.3  # 连续暴涨风险
                - max(r["volume_ratio"] - 5, 0) * 3 * vp  # 异常放量
                - max(r["turnover_rate"] - 20, 0) * 0.5 * vp  # 换手过高
            )

            score = fm * 0.25 + fv * 0.20 + fval * 0.15 + fg * 0.20 + fa * 0.10 + fr * 0.10
            anom = (
                abs(r["pct_chg"]) * 2.0
                + clamp(r["volume_ratio"], 0, 6) * 8
                + clamp(r["turnover_rate"], 0, 25) * 0.7
                + abs(clamp(r["return_5d"], -50, 80)) * 0.35
            )

            tags = self._tags(r)
            risks = self._risks(r)

            scored.append(StockRow(
                ts_code=r["ts_code"], code=r["code"], name=r["name"],
                industry=r["industry"], market=r["market"],
                close=round(r["close"], 2), pct_chg=round(r["pct_chg"], 2),
                return_5d=round(r["return_5d"], 2), return_20d=round(r["return_20d"], 2),
                volume_ratio=round(r["volume_ratio"], 2),
                turnover_rate=round(r["turnover_rate"], 2),
                amount=round(r["amount"], 0),
                total_mv=round(r["total_mv"], 0),
                pe_ttm=round(pe, 1), pb=round(r["pb"], 2),
                selection_score=round(score, 2), anomaly_score=round(anom, 2),
                f_momentum=round(fm, 2), f_volume=round(fv, 2),
                f_valuation=round(fval, 2), f_growth=round(fg, 2),
                f_analyst=round(fa, 2), f_risk=round(fr, 2),
                tags=tags, risk_notes=risks,
            ))

        return sorted(scored, key=lambda x: x.selection_score, reverse=True)

    @staticmethod
    def _tags(r: dict) -> List[str]:
        t = []
        if r["pct_chg"] >= 9.5: t.append("接近涨停")
        elif r["pct_chg"] <= -8: t.append("大跌异动")
        elif abs(r["pct_chg"]) >= 5: t.append("价格异动")
        if r["volume_ratio"] >= 2: t.append("显著放量")
        elif r["volume_ratio"] >= 1.3: t.append("温和放量")
        if r["turnover_rate"] >= 10: t.append("高换手")
        if r["return_5d"] >= 20: t.append("5日强势")
        if r["return_20d"] >= 40: t.append("20日强势")
        if r["amount"] >= 1000000: t.append("高成交额")
        if 0 < r["pe_ttm"] < 15: t.append("低估值")
        if r["pct_chg"] > 0 and 1.2 <= r["volume_ratio"] <= 4.5: t.append("量价配合")
        return t or ["普通波动"]

    @staticmethod
    def _risks(r: dict) -> List[str]:
        n = []
        if r["pct_chg"] >= 9.5: n.append("接近涨停追高风险")
        if r["return_20d"] > 60: n.append("短期涨幅过大")
        if r["volume_ratio"] > 5: n.append("异常放量")
        if r["turnover_rate"] > 20: n.append("换手过高")
        if r["pe_ttm"] > 100: n.append("估值偏高")
        return n or ["风险均衡"]


# ── HTML Report ──────────────────────────────────────────────────

def bdg(level: str, text: str) -> str:
    c = {"high": "#dc2626", "low": "#16a34a", "medium": "#d97706",
         "trending": "#dc2626", "declining": "#16a34a", "neutral": "#6b7280",
         "bullish": "#dc2626", "bearish": "#16a34a"}.get(level, "#6b7280")
    return f'<span style="display:inline-block;padding:2px 10px;border-radius:12px;background:{c}22;color:{c};font-weight:600;font-size:.85rem">{text}</span>'


def fmt_mv(v: float) -> str:
    if v >= 10000: return f"{v / 10000:.0f}亿"
    return f"{v:.0f}万"


def fmt_amt(v: float) -> str:
    if v >= 1000000: return f"{v / 1000000:.1f}百万"
    if v >= 10000: return f"{v / 10000:.1f}万"
    return f"{v:.0f}"


def html_report(sc: AShareScanner) -> str:
    rg = sc.regime
    scored = sc.stocks
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    sels = [s for s in scored if s.selection_score > 0][:30]
    anoms = sorted(scored, key=lambda x: x.anomaly_score, reverse=True)[:20]
    port = scored[:5]

    ic: Dict[str, int] = {}
    for s in scored[:50]:
        ic[s.industry] = ic.get(s.industry, 0) + 1
    ti = sorted(ic.items(), key=lambda x: x[1], reverse=True)[:15]

    def trs(items, fn):
        return "\n".join(f"<tr>{fn(i, s)}</tr>" for i, s in enumerate(items, 1))

    def sel_fn(i, s):
        tg = " ".join(f'<span class="tg">{t}</span>' for t in s.tags)
        cc = "up" if s.pct_chg > 0 else ("dn" if s.pct_chg < 0 else "")
        return (f"<td>{i}</td><td class='tk'>{s.code}</td><td>{s.name}</td><td>{s.industry}</td>"
                f"<td class='n'>{s.close:.2f}</td>"
                f"<td class='n {cc}'>{s.pct_chg:+.2f}%</td>"
                f"<td class='n {'up' if s.return_5d>0 else 'dn'}'>{s.return_5d:+.1f}%</td>"
                f"<td class='n {'up' if s.return_20d>0 else 'dn'}'>{s.return_20d:+.1f}%</td>"
                f"<td class='n'>{s.volume_ratio:.2f}</td>"
                f"<td class='n'>{s.turnover_rate:.1f}%</td>"
                f"<td class='n'>{s.pe_ttm:.1f}</td>"
                f"<td class='n sc'>{s.selection_score:.1f}</td>"
                f"<td>{tg}</td>")

    def an_fn(i, s):
        tg = " ".join(f'<span class="tg">{t}</span>' for t in s.tags)
        return (f"<td>{i}</td><td class='tk'>{s.code}</td><td>{s.name}</td><td>{s.industry}</td>"
                f"<td class='n {'up' if s.pct_chg>0 else 'dn'}'>{s.pct_chg:+.2f}%</td>"
                f"<td class='n'>{s.volume_ratio:.2f}</td>"
                f"<td class='n'>{s.turnover_rate:.1f}%</td>"
                f"<td class='n sc'>{s.anomaly_score:.1f}</td>"
                f"<td>{tg}</td>")

    ps = sum(max(s.selection_score, .01) for s in port) or 1
    def pt_fn(i, s):
        w = min(max(s.selection_score, .01) / ps * 100, 35)
        rn = "；".join(s.risk_notes[:2])
        return (f"<td class='tk'>{s.code}</td><td>{s.name}</td><td>{s.industry}</td>"
                f"<td class='n'>{w:.1f}%</td><td class='n'>{s.pe_ttm:.1f}</td>"
                f"<td class='n sc'>{s.selection_score:.1f}</td><td>{rn}</td>")

    def fc_fn(i, s):
        def c(v): return 'up' if v > 0 else 'dn'
        return (f"<td class='tk'>{s.code}</td><td>{s.name}</td>"
                f"<td class='n {c(s.f_momentum)}'>{s.f_momentum:.1f}</td>"
                f"<td class='n {c(s.f_volume)}'>{s.f_volume:.1f}</td>"
                f"<td class='n {c(s.f_valuation)}'>{s.f_valuation:.1f}</td>"
                f"<td class='n {c(s.f_growth)}'>{s.f_growth:.1f}</td>"
                f"<td class='n {c(s.f_analyst)}'>{s.f_analyst:.1f}</td>"
                f"<td class='n {c(s.f_risk)}'>{s.f_risk:.1f}</td>")

    best = port[0] if port else None

    return f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>A股量化选股报告</title>
<style>
:root{{--i:#0f172a;--m:#475569;--p:rgba(255,255,255,.92);--a:#0f766e;--a2:#7c3aed;--r:#dc2626;--g:#16a34a;--o:#d97706;--l:rgba(15,23,42,.08);--s:0 4px 24px rgba(15,23,42,.08)}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{color:var(--i);background:linear-gradient(135deg,#f0fdf4,#ecfeff 40%,#fef3c7);font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;line-height:1.6;padding:24px 16px 80px}}
.ct{{max-width:1440px;margin:0 auto}}
hd{{display:block;text-align:center;margin-bottom:36px;padding:48px 24px 36px;background:var(--p);border-radius:24px;border:1px solid var(--l);box-shadow:var(--s)}}
hd h1{{font-size:clamp(1.8rem,4vw,3rem);letter-spacing:-.04em;background:linear-gradient(135deg,var(--a),var(--a2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}}
hd .mt{{color:var(--m);font-size:.9rem}}hd .mt span{{margin:0 8px}}
.cd{{background:var(--p);border-radius:20px;border:1px solid var(--l);box-shadow:var(--s);padding:28px;margin-bottom:24px}}
.cd h2{{font-size:1.3rem;letter-spacing:-.02em;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid var(--a);display:flex;align-items:center;gap:8px}}
.cd h2 .nm{{color:var(--a);font-size:.85rem;font-weight:400}}
.g2{{display:grid;grid-template-columns:1fr 1fr;gap:24px}}.g3{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px}}
@media(max-width:900px){{.g2,.g3{{grid-template-columns:1fr}}}}
.kp{{text-align:center;padding:20px;border-radius:16px;background:linear-gradient(135deg,rgba(15,118,110,.06),rgba(124,58,237,.06));border:1px solid var(--l)}}
.kp .lb{{font-size:.8rem;color:var(--m);margin-bottom:4px}}.kp .vl{{font-size:1.8rem;font-weight:700;letter-spacing:-.02em}}
.kp .vl.up{{color:var(--r)}}.kp .vl.dn{{color:var(--g)}}.kp .vl.ac{{color:var(--a)}}
table{{width:100%;border-collapse:separate;border-spacing:0;font-size:.83rem;overflow:hidden;border-radius:14px;border:1px solid var(--l)}}
th{{background:#0f292a;color:#f0fdf4;text-align:left;font-weight:600;padding:10px 12px;white-space:nowrap;position:sticky;top:0;z-index:2}}
td{{padding:8px 12px;border-bottom:1px solid var(--l);vertical-align:top}}
tr:nth-child(even) td{{background:rgba(15,118,110,.03)}}tr:hover td{{background:rgba(124,58,237,.06)}}
.n{{text-align:right;font-variant-numeric:tabular-nums}}.up{{color:var(--r)}}.dn{{color:var(--g)}}.sc{{font-weight:700;color:var(--a)}}
.tk{{font-family:"SF Mono",Menlo,monospace;font-size:.82rem;color:var(--a2);font-weight:600}}
.tg{{display:inline-block;padding:1px 8px;border-radius:8px;background:rgba(15,118,110,.1);color:var(--a);font-size:.72rem;margin:1px 2px;white-space:nowrap}}
.rg{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px}}
.ri{{padding:14px;border-radius:12px;background:rgba(15,118,110,.04);border:1px solid var(--l)}}.ri .dm{{font-size:.78rem;color:var(--m)}}.ri .vl{{font-size:1.1rem;font-weight:600;margin-top:4px}}
.st{{overflow-x:auto}}.ds{{text-align:center;color:var(--m);font-size:.78rem;padding:24px;border-top:1px solid var(--l);margin-top:36px}}
</style></head><body><div class="ct">

<hd><h1>A股量化选股 — 模型驱动报告</h1>
<div class="mt"><span>{now}</span><span>|</span><span>交易日 {sc.trade_date}</span><span>|</span>
<span>全市场 {sc.universe_count} 只 / 过滤后 {sc.filtered_count} 只</span><span>|</span>
<span>自适应因子模型</span></div></hd>

<div class="g3" style="margin-bottom:24px">
<div class="kp"><div class="lb">Top1 选股</div><div class="vl ac">{best.name if best else '-'}</div><div class="lb">{best.code if best else ''} — 分数 {best.selection_score if best else 0}</div></div>
<div class="kp"><div class="lb">全市场涨跌</div><div class="vl {'up' if rg.avg_pct_chg>0 else 'dn'}">{rg.avg_pct_chg:+.2f}%</div><div class="lb">上涨 {rg.pct_positive}% | 涨停 {rg.limit_up_count} | 跌停 {rg.limit_down_count}</div></div>
<div class="kp"><div class="lb">涨跌比</div><div class="vl ac">{rg.up_down_ratio:.2f}</div><div class="lb">平均换手 {rg.avg_turnover}% | 平均量比 {rg.avg_volume_ratio:.2f}</div></div>
</div>

<div class="cd"><h2>市场环境诊断 <span class="nm">模型驱动核心</span></h2>
<div class="rg">
<div class="ri"><div class="dm">波动率</div><div class="vl">{bdg(rg.volatility_level, rg.volatility_level.upper())} std={rg.std_pct_chg}%</div></div>
<div class="ri"><div class="dm">动量环境</div><div class="vl">{bdg(rg.momentum_regime, rg.momentum_regime.upper())} avg={rg.avg_pct_chg:+.2f}%</div></div>
<div class="ri"><div class="dm">资金面</div><div class="vl">{bdg(rg.money_flow_bias, rg.money_flow_bias.upper())} 涨跌比={rg.up_down_ratio}</div></div>
<div class="ri"><div class="dm">市场温度</div><div class="vl">{rg.pct_positive:.1f}% 上涨</div></div>
</div></div>

<div class="g2">
<div class="cd"><h2>模型组合 <span class="nm">Top 5</span></h2>
<table><tr><th>代码</th><th>名称</th><th>行业</th><th>权重</th><th>PE</th><th>分数</th><th>风险</th></tr>
{trs(port, pt_fn)}</table></div>
<div class="cd"><h2>因子分解</h2>
<table><tr><th>代码</th><th>名称</th><th>动量</th><th>量能</th><th>估值</th><th>成长</th><th>确认</th><th>风险</th></tr>
{trs(port, fc_fn)}</table></div>
</div>

<div class="cd"><h2>全A选股榜 <span class="nm">Top {len(sels)} / {sc.filtered_count} 只</span></h2>
<div class="st"><table>
<tr><th>#</th><th>代码</th><th>名称</th><th>行业</th><th>收盘</th><th>涨跌</th><th>5日</th><th>20日</th><th>量比</th><th>换手</th><th>PE</th><th>分数</th><th>标签</th></tr>
{trs(sels, sel_fn)}</table></div></div>

<div class="cd"><h2>异动榜 <span class="nm">Top {len(anoms)}</span></h2>
<div class="st"><table>
<tr><th>#</th><th>代码</th><th>名称</th><th>行业</th><th>涨跌</th><th>量比</th><th>换手</th><th>异动分</th><th>标签</th></tr>
{trs(anoms, an_fn)}</table></div></div>

<div class="cd"><h2>行业分布 <span class="nm">Top 50 选股</span></h2>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px">
{"".join(f'<div style="padding:8px 12px;background:rgba(15,118,110,.06);border-radius:10px;display:flex;justify-content:space-between"><span>{ind}</span><span style="font-weight:700;color:var(--a)">{cnt}只</span></div>' for ind,cnt in ti)}
</div></div>

<div class="cd"><h2>自适应权重调整</h2>
<table><tr><th>因子</th><th>基础</th><th>当前调整</th><th>原因</th></tr>
<tr><td>动量</td><td>25%</td><td>{'x1.3 加强' if rg.momentum_regime=='trending' else 'x0.7 减弱' if rg.momentum_regime=='declining' else 'x1.0'}</td><td>{'趋势市顺势' if rg.momentum_regime=='trending' else '下跌市减少追涨' if rg.momentum_regime=='declining' else '中性'}</td></tr>
<tr><td>量能</td><td>20%</td><td>x1.0</td><td>量能信号跨环境稳定</td></tr>
<tr><td>估值</td><td>15%</td><td>{'x1.3 加重' if rg.momentum_regime=='declining' else 'x0.8 降低' if rg.momentum_regime=='trending' else 'x1.0'}</td><td>{'弱市偏防御找低估' if rg.momentum_regime=='declining' else '强市增长优先' if rg.momentum_regime=='trending' else '均衡'}</td></tr>
<tr><td>成长</td><td>20%</td><td>{'x1.2 加重' if rg.volatility_level=='high' else 'x1.0'}</td><td>{'高波动偏好确定性成长' if rg.volatility_level=='high' else '正常'}</td></tr>
<tr><td>量价确认</td><td>10%</td><td>x1.0</td><td>量价配合信号</td></tr>
<tr><td>风险</td><td>10%</td><td>{'x1.4 加重惩罚' if rg.volatility_level=='high' else 'x1.0'}</td><td>{'高波动加重涨停/异常放量惩罚' if rg.volatility_level=='high' else '正常'}</td></tr>
</table></div>

<div class="ds">仅用于研究与监控，不构成投资建议。数据来源：Tushare Pro。引擎：自适应因子模型。{now}</div>
</div></body></html>"""


# ── Text output ──────────────────────────────────────────────────

def text_report(sc: AShareScanner, top: int) -> str:
    rg = sc.regime
    lines = [
        f"交易日: {sc.trade_date}  全市场: {sc.universe_count}  过滤后: {sc.filtered_count}",
        f"市场环境: 波动={rg.volatility_level} 动量={rg.momentum_regime} 资金={rg.money_flow_bias}",
        f"  平均涨跌={rg.avg_pct_chg:+.2f}%  上涨占比={rg.pct_positive}%  涨停={rg.limit_up_count}  跌停={rg.limit_down_count}  涨跌比={rg.up_down_ratio}",
        "",
        f"选股 Top {top}:",
    ]
    for i, s in enumerate(sc.stocks[:top], 1):
        lines.append(
            f"  {i:2d}. {s.code} {s.name:8s} {s.industry:6s} "
            f"收盘={s.close:7.2f} 涨跌={s.pct_chg:+6.2f}% 5日={s.return_5d:+6.1f}% "
            f"量比={s.volume_ratio:4.2f} 分数={s.selection_score:6.1f} 标签={s.tags}"
        )
    lines.append(f"\n异动 Top 10:")
    for i, s in enumerate(sorted(sc.stocks, key=lambda x: x.anomaly_score, reverse=True)[:10], 1):
        lines.append(
            f"  {i:2d}. {s.code} {s.name:8s} 涨跌={s.pct_chg:+6.2f}% "
            f"量比={s.volume_ratio:4.2f} 异动分={s.anomaly_score:.1f}"
        )
    return "\n".join(lines)


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="A股量化选股扫描器")
    parser.add_argument("--token", default=os.environ.get("TUSHARE_TOKEN", ""),
                        help="Tushare Pro token (或设置 TUSHARE_TOKEN 环境变量)")
    parser.add_argument("--codes", default="", help="指定股票代码，逗号分隔 (如 000001,600519)")
    parser.add_argument("--top", type=int, default=30, help="显示 Top N")
    parser.add_argument("--format", choices=["text", "json", "html", "all"], default="all")
    parser.add_argument("--output-dir", default=".", help="报告输出目录")
    parser.add_argument("--min-amount", type=float, default=100000, help="最小成交额阈值")
    args = parser.parse_args()

    token = args.token
    if not token:
        print("错误：未提供 Tushare token", file=sys.stderr)
        print("  设置环境变量: export TUSHARE_TOKEN=your_token", file=sys.stderr)
        print("  或传参: --token your_token", file=sys.stderr)
        print("  免费注册: https://tushare.pro", file=sys.stderr)
        sys.exit(1)

    specific = [c.strip() for c in args.codes.split(",") if c.strip()] if args.codes else None

    sc = AShareScanner(token)
    sc.scan(top_n=args.top, min_amount=args.min_amount, specific_codes=specific)

    if not sc.stocks:
        print(json.dumps({"ok": False, "error": "未获取到股票数据"}, ensure_ascii=False))
        sys.exit(2)

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)

    if args.format in ("text", "all"):
        print(text_report(sc, args.top))

    if args.format in ("json", "all"):
        payload = {
            "ok": True,
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "trade_date": sc.trade_date,
            "universe": sc.universe_count,
            "filtered": sc.filtered_count,
            "regime": asdict(sc.regime),
            "selections": [asdict(s) for s in sc.stocks[:args.top]],
            "anomalies": [asdict(s) for s in sorted(sc.stocks, key=lambda x: x.anomaly_score, reverse=True)[:20]],
            "portfolio": [asdict(s) for s in sc.stocks[:5]],
        }
        jp = out / "a_share_scan_result.json"
        jp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.format == "json":
            print(json.dumps(payload, ensure_ascii=False, indent=2))

    if args.format in ("html", "all"):
        hp = out / "a_share_scan_report.html"
        hp.write_text(html_report(sc), encoding="utf-8")
        print(f"\nHTML 报告: {hp}", file=sys.stderr)

    print(f"\n完成。{sc.filtered_count} 只股票已评分。", file=sys.stderr)


if __name__ == "__main__":
    main()
