"""Summarise Daily Break ranked results from Workers Analytics Engine as a Markdown report.

Run by .github/workflows/results.yml. Needs CLOUDFLARE_API_TOKEN with Account Analytics: Read
(and Account Settings: Read, which the Workers template already has, to find the account id).
Usage: python3 tools/results.py [days]   (default 14) -> Markdown on stdout.
"""
import datetime as dt, json, os, sys, urllib.request
from collections import Counter, defaultdict

API = 'https://api.cloudflare.com/client/v4'
LAUNCH = dt.date(2026, 11, 11)   # Daily Break #1 (matches EPOCH in index.html)


def call(url, data=None):
    req = urllib.request.Request(url, data=data, headers={'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN']})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def fetch(days):
    acc = call(API + '/accounts')['result'][0]['id']
    sql = (f"SELECT blob1 AS day, double1 AS level, SUM(_sample_interval) AS n FROM daily_break_results "
           f"WHERE timestamp > NOW() - INTERVAL '{int(days) + 2}' DAY GROUP BY day, level FORMAT JSON")
    return call(f'{API}/accounts/{acc}/analytics_engine/sql', sql.encode())['data']


def report(rows, days=14):
    by_day = defaultdict(Counter)
    for r in rows:
        by_day[r['day']][int(float(r['level']))] += int(float(r['n']))
    out = ['# Daily Break results', '']
    if not by_day:
        return '\n'.join(out + ['No ranked runs recorded yet.', ''])
    out += ['| Day | Date | Players | Average level | Median | Most common | Best |', '|---|---|---|---|---|---|---|']
    for day in sorted(by_day, reverse=True)[:days]:
        c = by_day[day]; n = sum(c.values()); levels = sorted(c.elements())
        num = (dt.date.fromisoformat(day) - LAUNCH).days + 1
        out.append(f'| #{num} | {day} | {n} | {sum(levels) / n:.1f} | {levels[(n - 1) // 2]} | {c.most_common(1)[0][0]} | {max(c)} |')
    latest = max(by_day); c = by_day[latest]; n = sum(c.values())
    out += ['', f'## Where runs ended on {latest}', '', '| Level | Runs | |', '|---|---|---|']
    for lvl in range(1, max(c) + 1):
        out.append(f"| {lvl} | {c[lvl]} | {'█' * round(20 * c[lvl] / n)} |")
    return '\n'.join(out + [''])


if __name__ == '__main__':
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 14
    print(report(fetch(days), days))
