"""Summarise Daily Break ranked results from Workers Analytics Engine as a Markdown report.

Run by .github/workflows/results.yml. Needs CLOUDFLARE_API_TOKEN with Account Analytics: Read
(and Account Settings: Read, which the Workers template already has, to find the account id).
Usage: python3 tools/results.py [days]   (default 14) -> Markdown on stdout.
"""
import datetime as dt, json, os, sys, urllib.request
from collections import Counter, defaultdict

API = 'https://api.cloudflare.com/client/v4'


def call(url, data=None):
    req = urllib.request.Request(url, data=data, headers={'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN']})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def account():
    return call(API + '/accounts')['result'][0]['id']


STEPS = [('open', 'Opened'), ('shot', 'Took a shot'), ('clear1', 'Cleared level/hole 1'), ('level3', 'Reached level/hole 3'), ('finish', 'Finished')]


def fetch_funnel(acc, days):
    sql = (f"SELECT blob1 AS day, blob2 AS step, SUM(_sample_interval) AS n FROM daily_break_events "
           f"WHERE timestamp > NOW() - INTERVAL '{int(days) + 2}' DAY GROUP BY day, step FORMAT JSON")
    return call(f'{API}/accounts/{acc}/analytics_engine/sql', sql.encode())['data']


def funnel_report(rows, days=14):
    by_day = defaultdict(dict)
    for r in rows:
        by_day[r['day']][r['step']] = int(float(r['n']))
    out = ['## Where people drop off (ranked game, one count per phone)', '']
    if not by_day:
        return '\n'.join(out + ['No funnel data yet (it starts from 11 Nov 2026).', ''])
    out += ['| Day | ' + ' | '.join(n for _, n in STEPS) + ' |', '|---' * (len(STEPS) + 1) + '|']
    for day in sorted(by_day, reverse=True)[:days]:
        c = by_day[day]; top = c.get('open') or max(c.values())
        cells = [f"{c.get(k, 0)} ({round(100 * c.get(k, 0) / top)}%)" if top else '0' for k, _ in STEPS]
        out.append(f"| {dt.date.fromisoformat(day).strftime('%a %-d %b')} | " + ' | '.join(cells) + ' |')
    return '\n'.join(out + [''])


VISITS_Q = """query($acc: string!, $since: Date!) { viewer { accounts(filter: {accountTag: $acc}) {
  days: rumPageloadEventsAdaptiveGroups(limit: 100, filter: {date_geq: $since, requestHost: "dailybreak.app"}, orderBy: [date_DESC]) { count sum { visits } dimensions { date } }
  refs: rumPageloadEventsAdaptiveGroups(limit: 8, filter: {date_geq: $since, requestHost: "dailybreak.app"}, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { refererHost } }
  devices: rumPageloadEventsAdaptiveGroups(limit: 5, filter: {date_geq: $since, requestHost: "dailybreak.app"}, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { deviceType } }
} } }"""


def fetch_visits(acc, days):
    since = (dt.date.today() - dt.timedelta(days=int(days))).isoformat()
    body = json.dumps({'query': VISITS_Q, 'variables': {'acc': acc, 'since': since}}).encode()
    req = urllib.request.Request(API + '/graphql', data=body, headers={'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.load(r)
    if res.get('errors'):
        raise RuntimeError('; '.join(e.get('message', '?') for e in res['errors']))
    return res['data']['viewer']['accounts'][0]


def visits_report(v):
    out = ['## Visits (Cloudflare Web Analytics)', '']
    if not v['days']:
        return '\n'.join(out + ['No visits recorded yet.', ''])
    out += ['| Day | Visits | Page views |', '|---|---|---|']
    for g in v['days']:
        d = dt.date.fromisoformat(g['dimensions']['date']).strftime('%a %-d %b')
        out.append(f"| {d} | {g['sum']['visits']} | {g['count']} |")
    if v['refs']:
        out += ['', 'Where visits came from: ' + ', '.join(f"{g['dimensions']['refererHost'] or 'direct / app'} {g['sum']['visits']}" for g in v['refs'])]
    if v['devices']:
        out += ['', 'Devices: ' + ', '.join(f"{g['dimensions']['deviceType'] or 'unknown'} {g['sum']['visits']}" for g in v['devices'])]
    return '\n'.join(out + [''])


def fetch(days, acc=None):
    acc = acc or account()
    sql = (f"SELECT blob1 AS day, double1 AS level, SUM(_sample_interval) AS n FROM daily_break_results "
           f"WHERE timestamp > NOW() - INTERVAL '{int(days) + 2}' DAY AND blob2 != 'par' GROUP BY day, level FORMAT JSON")
    return call(f'{API}/accounts/{acc}/analytics_engine/sql', sql.encode())['data']


def fetch_par(days, acc):
    sql = (f"SELECT blob1 AS day, double1 AS score, SUM(_sample_interval) AS n FROM daily_break_results "
           f"WHERE timestamp > NOW() - INTERVAL '{int(days) + 2}' DAY AND blob2 = 'par' GROUP BY day, score FORMAT JSON")
    return call(f'{API}/accounts/{acc}/analytics_engine/sql', sql.encode())['data']


def par_label(n):
    return 'E' if n == 0 else f'+{n}' if n > 0 else f'−{-n}'


def par_report(rows, days=14):
    by_day = defaultdict(Counter)
    for r in rows:
        by_day[r['day']][int(float(r['score']))] += int(float(r['n']))
    out = ['## Par rounds (from 12 Nov 2026; score to par, lower is better)', '']
    if not by_day:
        return '\n'.join(out + ['No par rounds recorded yet.', ''])
    out += ['| Day | Players | Average | Median | Best |', '|---|---|---|---|---|']
    for day in sorted(by_day, reverse=True)[:days]:
        c = by_day[day]; n = sum(c.values()); scores = sorted(c.elements())
        label = dt.date.fromisoformat(day).strftime('%a %-d %b')
        out.append(f'| {label} | {n} | {par_label(round(sum(scores) / n))} | {par_label(scores[(n - 1) // 2])} | {par_label(min(c))} |')
    latest = max(by_day); c = by_day[latest]; n = sum(c.values())
    out += ['', f'## Scores on {latest}', '', '| Score | Rounds | |', '|---|---|---|']
    for sc in range(min(c), max(c) + 1):
        out.append(f"| {par_label(sc)} | {c[sc]} | {'█' * round(20 * c[sc] / n)} |")
    return '\n'.join(out + [''])


def report(rows, days=14):
    by_day = defaultdict(Counter)
    for r in rows:
        by_day[r['day']][int(float(r['level']))] += int(float(r['n']))
    out = ['# Daily Break results', '']
    if not by_day:
        return '\n'.join(out + ['No ranked runs recorded yet.', ''])
    out += ['| Day | Players | Average level | Median | Most common | Best |', '|---|---|---|---|---|---|']
    for day in sorted(by_day, reverse=True)[:days]:
        c = by_day[day]; n = sum(c.values()); levels = sorted(c.elements())
        label = dt.date.fromisoformat(day).strftime('%a %-d %b')
        out.append(f'| {label} | {n} | {sum(levels) / n:.1f} | {levels[(n - 1) // 2]} | {c.most_common(1)[0][0]} | {max(c)} |')
    latest = max(by_day); c = by_day[latest]; n = sum(c.values())
    out += ['', f'## Where runs ended on {latest}', '', '| Level | Runs | |', '|---|---|---|']
    for lvl in range(1, max(c) + 1):
        out.append(f"| {lvl} | {c[lvl]} | {'█' * round(20 * c[lvl] / n)} |")
    return '\n'.join(out + [''])


if __name__ == '__main__':
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 14
    acc = account()
    print(report(fetch(days, acc), days))
    try:
        print(par_report(fetch_par(days, acc), days))
    except Exception as e:   # never fail the results report over the par table
        print(f'## Par rounds\n\nCould not read them: {e}\n')
    try:
        print(funnel_report(fetch_funnel(acc, days), days))
    except Exception as e:   # the events dataset only exists once the first event arrives
        print(f'## Where people drop off\n\nNo funnel data yet ({e}).\n')
    try:
        print(visits_report(fetch_visits(acc, days)))
    except Exception as e:   # visits are a bonus: never fail the results report over them
        print(f'## Visits\n\nCould not read Web Analytics: {e}\n')
