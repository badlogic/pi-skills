---
name: a-share-scanner
description: A股量化选股扫描器，模型驱动自适应因子评分。通过 Tushare 扫描全 A 股 5000+ 只股票，检测市场环境（波动率、动量、资金面、板块轮动），动态调整因子权重，输出选股榜/异动榜/行业分布的 HTML 报告。适用于 A 股选股、量化筛选、因子分析、市场环境诊断、板块轮动、动量策略、价值投资筛选。Use for Chinese A-share stock screening, quantitative stock picking, sector rotation, market regime detection.
---

# A股量化选股扫描器 v1.0

模型驱动的全 A 股量化选股工具。扫描 5000+ 只 A 股，检测市场环境，自适应调整 6 因子权重，输出选股/异动排名 + HTML 报告。

## 配置

**必需：** 一个免费的 Tushare Pro token。

1. 访问 [https://tushare.pro](https://tushare.pro) 注册（免费）
2. 在个人主页获取 API Token
3. 设置环境变量：

```bash
export TUSHARE_TOKEN="your_token_here"
```

或直接传参：

```bash
python3 {baseDir}/scripts/a_share_scan.py --token YOUR_TOKEN
```

**依赖安装：**

```bash
pip install tushare pandas
```

## 快速命令

```bash
# 全A扫描
python3 {baseDir}/scripts/a_share_scan.py

# 快速 Top 10
python3 {baseDir}/scripts/a_share_scan.py --top 10

# 指定股票
python3 {baseDir}/scripts/a_share_scan.py --codes 000001,600519,300750

# JSON 输出
python3 {baseDir}/scripts/a_share_scan.py --format json
```

## 6 因子自适应评分

| 因子 | 基础权重 | 趋势市 | 震荡市 | 高波动 |
| --- | ---: | --- | --- | --- |
| **动量** | 25% | x1.3 | x0.7 | — |
| **量能** | 20% | — | — | — |
| **估值** | 15% | x0.8 | x1.3 | — |
| **成长** | 20% | — | — | x1.2 |
| **量价确认** | 10% | — | — | — |
| **风险调整** | 10% | — | — | x1.4 |

## 市场环境检测

- **波动率** — 全市场涨跌幅标准差
- **动量** — 上涨比例 + 平均涨幅
- **资金面** — 涨停/跌停数 + 涨跌比

## 数据

全 A 股（上交所 + 深交所 + 北交所），Tushare Pro 免费接口。

## 限制

- 全A扫描约 10-30 秒
- 不构成投资建议
