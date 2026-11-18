"""Cote & Potes data sync.

Builds one JSON document per match day (Paris date) for the artifact database:
  out/days/<YYYY-MM-DD>.json  -> collection "days", doc id = date
  out/meta/season.json        -> collection "meta", doc id "season"

Sources:
  --source api   API-Football v3 (key injected by the network proxy as x-apisports-key)
  --source of    openfootball JSON (fixtures + partial results), model odds only

Usage: python3 -I sync.py --source api|of --out DIR [--of-dir DIR] [--days-back 3 --days-ahead 10] [--full]
"""
import argparse, json, math, os, re, sys, time, unicodedata, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")
LEAGUES = {  # our id: (api league id, openfootball file, tz, strength offset, name)
    "L1": (61, "fr.1", "Europe/Paris", 0.00, "Ligue 1"),
    "PL": (39, "en.1", "Europe/London", 0.18, "Premier League"),
    "LL": (140, "es.1", "Europe/Madrid", 0.12, "LaLiga"),
    "BL": (78, "de.1", "Europe/Berlin", 0.08, "Bundesliga"),
    "SA": (135, "it.1", "Europe/Rome", 0.08, "Serie A"),
    "CL": (2, None, "Europe/Paris", 0.0, "Ligue des champions"),
}
SEASON = 2026
FOREIGN = {}
# Prior club strength (log-goal scale), used only by the fallback model when bookmaker odds are missing.
PRIOR = {
 "Paris Saint-Germain FC": .48, "Olympique de Marseille": .2, "AS Monaco FC": .17, "Lille OSC": .14, "Racing Club de Lens": .12,
 "Olympique Lyonnais": .12, "OGC Nice": .05, "Stade Rennais FC 1901": .05, "RC Strasbourg Alsace": .06, "Paris FC": -.05,
 "Le Mans FC": -.2, "ES Troyes AC": -.18, "Le Havre AC": -.15, "AJ Auxerre": -.12, "Angers SCO": -.15, "FC Lorient": -.12,
 "Liverpool FC": .42, "Arsenal FC": .44, "Manchester City FC": .42, "Chelsea FC": .3, "Newcastle United FC": .2, "Aston Villa FC": .18,
 "Tottenham Hotspur FC": .15, "Manchester United FC": .14, "Brighton & Hove Albion FC": .08, "Crystal Palace FC": .08, "Nottingham Forest FC": .05,
 "Brentford FC": .02, "AFC Bournemouth": .04, "Fulham FC": .02, "Everton FC": 0, "Sunderland AFC": -.12, "Leeds United FC": -.08,
 "Coventry City FC": -.18, "Ipswich Town FC": -.18, "Hull City AFC": -.22,
 "Real Madrid CF": .46, "FC Barcelona": .48, "Club Atlético de Madrid": .3, "Athletic Club": .14, "Villarreal CF": .15, "Real Betis Balompié": .1,
 "Real Sociedad de Fútbol": .06, "RC Celta de Vigo": .03, "Sevilla FC": 0, "Valencia CF": -.02, "CA Osasuna": -.03, "Getafe CF": -.08,
 "RCD Espanyol de Barcelona": -.05, "Rayo Vallecano de Madrid": -.03, "Deportivo Alavés": -.08, "Elche CF": -.1, "Levante UD": -.12,
 "Málaga CF": -.18, "RC Deportivo La Coruña": -.15, "Real Racing Club de Santander": -.18,
 "FC Bayern München": .52, "Borussia Dortmund": .25, "Bayer 04 Leverkusen": .24, "RB Leipzig": .2, "VfB Stuttgart": .14, "Eintracht Frankfurt": .12,
 "SC Freiburg": .04, "TSG 1899 Hoffenheim": .02, "SV Werder Bremen": -.02, "Borussia Mönchengladbach": -.02, "1. FSV Mainz 05": -.02,
 "FC Augsburg": -.08, "1. FC Union Berlin": -.08, "1. FC Köln": -.1, "Hamburger SV": -.08, "FC Schalke 04": -.12, "SC Paderborn 07": -.22, "SV 07 Elversberg": -.22,
 "FC Internazionale Milano": .36, "SSC Napoli": .26, "Juventus FC": .2, "AC Milan": .2, "Atalanta BC": .2, "AS Roma": .14, "Como 1907": .14,
 "SS Lazio": .1, "Bologna FC 1909": .1, "ACF Fiorentina": .05, "Torino FC": -.02, "Udinese Calcio": -.05, "Genoa CFC": -.06, "Cagliari Calcio": -.08,
 "US Lecce": -.12, "Parma Calcio 1913": -.08, "US Sassuolo Calcio": -.06, "AC Monza": -.15, "Frosinone Calcio": -.2, "Venezia FC": -.15,
}
MARGIN = 1.06
API = "https://v3.football.api-sports.io"
CALLS = 0


def api(path, **params):
    global CALLS
    q = "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(f"{API}/{path}?{q}", headers={"x-apisports-key": "proxy-injected"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                CALLS += 1
                d = json.load(r)
            errs = d.get("errors")
            if errs and (isinstance(errs, dict) and errs or isinstance(errs, list) and errs):
                if "rateLimit" in json.dumps(errs):
                    time.sleep(7)
                    continue
                raise RuntimeError(f"API error {path} {params}: {errs}")
            return d
        except urllib.error.URLError as e:
            if attempt == 2:
                raise
            time.sleep(3)
    raise RuntimeError("rate limited")


def api_all(path, **params):
    out, page = [], 1
    while True:
        d = api(path, page=page, **params) if page > 1 else api(path, **params)
        out += d.get("response", [])
        tot = (d.get("paging") or {}).get("total", 1)
        if page >= tot:
            return out
        page += 1


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def paris_day(ms):
    return datetime.fromtimestamp(ms / 1000, PARIS).strftime("%Y-%m-%d")


# ---------- Poisson model ----------
def pois(l, k):
    return math.exp(-l) * l ** k / math.factorial(k)


def grid(lh, la, n=9):
    return [[pois(lh, i) * pois(la, j) for j in range(n)] for i in range(n)]


def market_probs(lh, la):
    g = grid(lh, la)
    n = len(g)
    P = lambda f: sum(g[i][j] for i in range(n) for j in range(n) if f(i, j))
    p = {
        "1": P(lambda i, j: i > j), "X": P(lambda i, j: i == j), "2": P(lambda i, j: i < j),
        "1X": P(lambda i, j: i >= j), "12": P(lambda i, j: i != j), "X2": P(lambda i, j: i <= j),
        "BY": P(lambda i, j: i > 0 and j > 0), "BN": P(lambda i, j: i == 0 or j == 0),
    }
    for t in (1.5, 2.5, 3.5):
        k = str(t).replace(".", "")
        p["O" + k] = P(lambda i, j: i + j > t)
        p["U" + k] = 1 - p["O" + k]
    # extra markets
    p["HC1"] = P(lambda i, j: i - j >= 2)          # home wins by 2+
    p["HC2"] = P(lambda i, j: j - i >= 2)          # away wins by 2+
    p["HO05"] = P(lambda i, j: i >= 1); p["HO15"] = P(lambda i, j: i >= 2)
    p["AO05"] = P(lambda i, j: j >= 1); p["AO15"] = P(lambda i, j: j >= 2)
    p["W1N"] = P(lambda i, j: i > j and j == 0)    # home wins to nil
    p["W2N"] = P(lambda i, j: j > i and i == 0)
    p["1BY"] = P(lambda i, j: i > j and j > 0); p["XBY"] = P(lambda i, j: i == j and i > 0); p["2BY"] = P(lambda i, j: j > i and i > 0)
    for n in range(4):
        p["TG%d" % n] = P(lambda i, j, n=n: i + j == n)
    p["TG4"] = P(lambda i, j: i + j >= 4)
    p["ODD"] = P(lambda i, j: (i + j) % 2 == 1); p["EVEN"] = 1 - p["ODD"]
    cs = {}
    for i in range(5):
        for j in range(5):
            cs[f"{i}-{j}"] = g[i][j]
    return p, cs


def to_odd(p, margin=MARGIN, lo=1.02, hi=151):
    if p <= 0:
        return hi
    return round(min(hi, max(lo, 1 / (p * margin))), 2)


def fit_lambdas(o1, ox, o2, oover=None):
    """Find home/away Poisson means that reproduce bookmaker 1X2 (+ over 2.5) odds."""
    inv = [1 / o1, 1 / ox, 1 / o2]
    s = sum(inv)
    t1, tx, t2 = [x / s for x in inv]
    tov = None
    if oover:
        tov = min(0.9, max(0.1, (1 / oover) / 1.03))
    best, bl = 9, (1.4, 1.1)
    for a in range(15, 45):
        for b in range(10, 40):
            lh, la = a / 10 * 0.85 + 0.1, b / 10 * 0.85 + 0.1
            g = grid(lh, la, 8)
            p1 = sum(g[i][j] for i in range(8) for j in range(8) if i > j)
            px = sum(g[i][i] for i in range(8))
            err = (p1 - t1) ** 2 + (px - tx) ** 2 + ((1 - p1 - px) - t2) ** 2
            if tov is not None:
                po = sum(g[i][j] for i in range(8) for j in range(8) if i + j > 2.5)
                err += 0.5 * (po - tov) ** 2
            if err < best:
                best, bl = err, (lh, la)
    # refine
    lh, la = bl
    for step in (0.04, 0.01):
        improved = True
        while improved:
            improved = False
            for dh, da in ((step, 0), (-step, 0), (0, step), (0, -step)):
                h2, a2 = lh + dh, la + da
                if h2 < 0.15 or a2 < 0.15:
                    continue
                g = grid(h2, a2, 8)
                p1 = sum(g[i][j] for i in range(8) for j in range(8) if i > j)
                px = sum(g[i][i] for i in range(8))
                err = (p1 - t1) ** 2 + (px - tx) ** 2 + ((1 - p1 - px) - t2) ** 2
                if tov is not None:
                    po = sum(g[i][j] for i in range(8) for j in range(8) if i + j > 2.5)
                    err += 0.5 * (po - tov) ** 2
                if err < best:
                    best, lh, la, improved = err, h2, a2, True
    return lh, la


class Ratings:
    """Attack/defence Poisson ratings fitted on finished matches of the season."""

    def __init__(self, results):
        # results: list of (home, away, gh, ga, league)
        self.att, self.dfn, self.lg = {}, {}, {}
        teams = set()
        for h, a, gh, ga, l in results:
            teams |= {h, a}
            self.lg.setdefault(h, l)
            self.lg.setdefault(a, l)
        teams |= set(PRIOR)
        self.prior = {t: PRIOR.get(t, -0.05) * 0.55 for t in teams}
        for t in teams:
            self.att[t] = self.prior[t]
            self.dfn[t] = self.prior[t]
        avg = (sum(r[2] + r[3] for r in results) / max(1, len(results))) if results else 2.7
        self.home = 0.12
        self.mu = math.log(max(1.0, avg) / 2) - self.home / 2
        for _ in range(60):
            ga_, gd_ = {t: 0.0 for t in teams}, {t: 0.0 for t in teams}
            for h, a, gh, ga, l in results:
                lh = math.exp(self.mu + self.home + self.att[h] - self.dfn[a])
                la = math.exp(self.mu + self.att[a] - self.dfn[h])
                ga_[h] += gh - lh
                gd_[a] -= gh - lh
                ga_[a] += ga - la
                gd_[h] -= ga - la
            for t in teams:  # prior shrinkage toward 0
                self.att[t] += 0.03 * (ga_[t] - 20.0 * (self.att[t] - self.prior[t]))
                self.dfn[t] += 0.03 * (gd_[t] - 20.0 * (self.dfn[t] - self.prior[t]))

    def lambdas(self, h, a, lh_=None, la_=None, neutral=False, cross=None):
        ah, dh = self.att.get(h, 0), self.dfn.get(h, 0)
        aa, da = self.att.get(a, 0), self.dfn.get(a, 0)
        if cross:  # foreign clubs: their offset stands in for both ratings
            if h not in self.att: ah = dh = cross[0] * 0.55
            if a not in self.att: aa = da = cross[1] * 0.55
        oh = oa = 0.0
        if cross:  # league strength gap between clubs of different leagues
            oh = cross[0] if h in self.att else 0
            oa = cross[1] if a in self.att else 0
        lh = math.exp(self.mu + (0 if neutral else self.home) + ah - da + (oh - oa) * 0.5)
        la = math.exp(self.mu + aa - dh + (oa - oh) * 0.5)
        return lh, la


def odds_block(lh, la, real=None):
    """Odds for all markets. `real` holds bookmaker prices that override model ones."""
    p, cs = market_probs(lh, la)
    o = {k: to_odd(v) for k, v in p.items()}
    o["CS"] = {k: to_odd(v, 1.15) for k, v in cs.items() if v > 0.004}
    src = {}
    if real:
        for k, v in real.items():
            if k == "CS":
                o["CS"].update(v)
            elif v:
                o[k] = v
                src[k] = 1
    return o, src


# ---------- Goalscorer model ----------
POSW = {"G": 0.0, "D": 0.06, "M": 0.16, "F": 0.42}


def scorer_odds(lam, xi, goals_by_player, real=None):
    if not xi:
        return []
    ws = []
    for pl in xi:
        w = POSW.get(pl.get("p", "M"), 0.16) + 0.06 * goals_by_player.get(pl.get("id") or pl["n"], 0)
        ws.append(w)
    tot = sum(ws) or 1
    out = []
    for pl, w in zip(xi, ws):
        if w <= 0:
            continue
        pr = 1 - math.exp(-lam * 0.92 * w / tot)
        out.append({"n": pl["n"], "o": to_odd(pr, 1.14, 1.4, 81)})
    if real:
        m = {slug(k): v for k, v in real.items()}
        for s in out:
            r = m.get(slug(s["n"]))
            if r:
                s["o"], s["r"] = r, 1
    out.sort(key=lambda s: s["o"])
    return out


# ---------- openfootball source ----------
def load_openfootball(of_dir):
    matches = []
    for lid, (_, f, tz, off, _) in LEAGUES.items():
        if not f:
            continue
        p = os.path.join(of_dir, f"2026-27_{f}.json")
        if not os.path.exists(p):
            continue
        d = json.load(open(p))
        counters = {}
        for m in d["matches"]:
            rnd = int(m["round"].split()[-1])
            t = m.get("time")
            dt = datetime.fromisoformat(m["date"] + "T" + (t or "15:00")).replace(tzinfo=ZoneInfo(tz))
            ms = int(dt.timestamp() * 1000)
            idx = counters.get(rnd, 0)
            counters[rnd] = idx + 1
            mm = {"id": f"{lid}-{rnd}-{slug(m['team1'])[:14]}", "l": lid, "r": f"J{rnd}", "h": m["team1"], "a": m["team2"],
                  "k": ms, "tbc": 0 if t else 1, "st": "NS"}
            if not t:  # date is the round's weekend placeholder: close bets from the Friday-night slot before it
                lock = (datetime.fromisoformat(m["date"] + "T19:00").replace(tzinfo=ZoneInfo(tz)) - timedelta(days=1))
                mm["lock"] = int(lock.timestamp() * 1000)
            sc = m.get("score")
            sc = sc.get("ft") if isinstance(sc, dict) else sc
            if sc:
                mm["st"], mm["sc"] = "FT", sc
            matches.append(mm)
    p = os.path.join(of_dir, "ucl_2026-27.json")
    if os.path.exists(p):
        u = json.load(open(p))
        alias = u["alias"]
        FOREIGN.update(u["foreign"])
        for md in u["matchdays"]:
            for t, h, a in md["m"]:
                dt = datetime.fromisoformat(md["date"] + "T" + t).replace(tzinfo=PARIS)
                mm = {"id": f"CL-{md['md']}-{slug(h)[:14]}", "l": "CL", "r": f"J{md['md']}", "h": alias.get(h, h), "a": alias.get(a, a),
                      "k": int(dt.timestamp() * 1000), "tbc": md.get("tbc", 0), "st": "NS"}
                if md.get("tbc"):
                    mm["lock"] = int(datetime.fromisoformat(md["date"] + "T18:45").replace(tzinfo=PARIS).timestamp() * 1000)
                matches.append(mm)
    return matches


# ---------- API-Football source ----------
STATUS = {"TBD": "NS", "NS": "NS", "1H": "LIVE", "HT": "HT", "2H": "LIVE", "ET": "LIVE", "BT": "LIVE", "P": "LIVE",
          "SUSP": "LIVE", "INT": "LIVE", "FT": "FT", "AET": "FT", "PEN": "FT", "PST": "PST", "CANC": "CANC",
          "ABD": "CANC", "AWD": "FT", "WO": "FT", "LIVE": "LIVE"}
POS = {"G": "G", "D": "D", "M": "M", "F": "F", "Goalkeeper": "G", "Defender": "D", "Midfielder": "M", "Attacker": "F"}


def load_api_fixtures():
    matches = []
    for lid, (aid, *_rest) in LEAGUES.items():
        for f in api("fixtures", league=aid, season=SEASON)["response"]:
            fx, tm = f["fixture"], f["teams"]
            st = STATUS.get(fx["status"]["short"], "NS")
            m = {"id": f"af{fx['id']}", "fid": fx["id"], "l": lid, "r": short_round(f["league"]["round"]),
                 "h": tm["home"]["name"], "a": tm["away"]["name"], "hid": tm["home"]["id"], "aid": tm["away"]["id"],
                 "k": fx["timestamp"] * 1000,
                 "tbc": 1 if fx["status"]["short"] == "TBD" else 0, "st": st, "min": fx["status"].get("elapsed")}
            if st in ("FT", "LIVE", "HT") and f["goals"]["home"] is not None:
                m["sc"] = [f["goals"]["home"], f["goals"]["away"]]
            matches.append(m)
    return matches


def short_round(r):
    m = re.search(r"(\d+)$", r or "")
    if "Regular Season" in (r or "") and m:
        return "J" + m.group(1)
    if "League Stage" in (r or "") and m:
        return "J" + m.group(1)
    return (r or "").replace("Round of 16", "8es").replace("Quarter-finals", "Quarts").replace("Semi-finals", "Demies").replace("Final", "Finale")


def bet_map(bets):
    """Normalise one bookmaker's bets into our market keys."""
    real, scorers = {}, {}
    for b in bets:
        name = b["name"]
        vals = {str(v["value"]): float(v["odd"]) for v in b["values"]}
        if name == "Match Winner":
            real.update({"1": vals.get("Home"), "X": vals.get("Draw"), "2": vals.get("Away")})
        elif name == "Goals Over/Under":
            for t in ("1.5", "2.5", "3.5"):
                k = t.replace(".", "")
                real["O" + k], real["U" + k] = vals.get("Over " + t), vals.get("Under " + t)
        elif name == "Both Teams Score":
            real["BY"], real["BN"] = vals.get("Yes"), vals.get("No")
        elif name == "Double Chance":
            real["1X"], real["12"], real["X2"] = vals.get("Home/Draw"), vals.get("Home/Away"), vals.get("Draw/Away")
        elif name == "Exact Score":
            real["CS"] = {k.replace(":", "-"): v for k, v in vals.items() if re.match(r"^\d:\d$", k)}
        elif name in ("Anytime Goal Scorer", "Goalscorer - Anytime", "Anytime Goalscorer"):
            scorers.update(vals)
    return real, scorers


PREFERRED_BOOKS = ["Unibet", "Winamax", "Betclic", "Bet365", "Bwin", "Pinnacle", "1xBet", "William Hill", "Marathonbet"]


def load_api_odds():
    res = {}
    for lid, (aid, *_r) in LEAGUES.items():
        for o in api_all("odds", league=aid, season=SEASON):
            books = {b["name"]: b for b in o.get("bookmakers", [])}
            if not books:
                continue
            main = next((books[n] for n in PREFERRED_BOOKS if n in books), next(iter(books.values())))
            real, scorers = bet_map(main["bets"])
            if not scorers:  # take goalscorer prices from any bookmaker offering them
                for b in books.values():
                    _, s = bet_map(b["bets"])
                    if s:
                        scorers = s
                        break
            res[o["fixture"]["id"]] = {"book": main["name"], "real": {k: v for k, v in real.items() if v}, "scorers": scorers}
    return res


def load_api_details(fids):
    """Lineups + goal events, 20 fixtures per call."""
    out = {}
    fids = list(fids)
    for i in range(0, len(fids), 20):
        for f in api("fixtures", ids="-".join(str(x) for x in fids[i:i + 20]))["response"]:
            lu = {}
            for t in f.get("lineups") or []:
                side = "h" if t["team"]["id"] == f["teams"]["home"]["id"] else "a"
                lu[side] = {"f": t.get("formation"), "tid": t["team"]["id"],
                            "xi": [{"n": p["player"]["name"], "id": p["player"]["id"], "no": p["player"].get("number"),
                                    "p": POS.get(p["player"].get("pos") or "M", "M"), "g": p["player"].get("grid")}
                                   for p in t.get("startXI") or []]}
            ev = []
            for e in f.get("events") or []:
                if e.get("type") == "Goal" and e.get("detail") != "Missed Penalty":
                    side = "h" if e["team"]["id"] == f["teams"]["home"]["id"] else "a"
                    ev.append({"m": e["time"]["elapsed"], "t": side, "n": e["player"]["name"],
                               "og": 1 if e.get("detail") == "Own Goal" else 0})
            out[f["fixture"]["id"]] = {"lu": lu, "ev": ev}
    return out


def load_api_topscorers():
    goals = {}
    for lid, (aid, *_r) in LEAGUES.items():
        try:
            for p in api("players/topscorers", league=aid, season=SEASON)["response"]:
                g = sum((s["goals"]["total"] or 0) for s in p["statistics"])
                goals[p["player"]["id"]] = goals.get(p["player"]["id"], 0) + g
        except Exception as e:
            print("topscorers", lid, e, file=sys.stderr)
    return goals


# ---------- Build ----------
def build(matches, odds=None, details=None, goals=None, last_xi=None, now_ms=None):
    odds, details, goals, last_xi = odds or {}, details or {}, goals or {}, last_xi or {}
    results = [(m["h"], m["a"], m["sc"][0], m["sc"][1], m["l"]) for m in matches if m["st"] == "FT" and m.get("sc") and m["l"] != "CL"]
    R = Ratings(results)
    team_lg = {}
    for m in matches:
        if m["l"] != "CL":
            team_lg.setdefault(m["h"], m["l"])
            team_lg.setdefault(m["a"], m["l"])
    days = {}
    for m in matches:
        cross = None
        if m["l"] == "CL":
            off = lambda n: LEAGUES[team_lg[n]][3] if n in team_lg else FOREIGN.get(n, -0.2)
            cross = (off(m["h"]), off(m["a"]))
        o = odds.get(m.get("fid"))
        real = o["real"] if o else None
        if real and all(real.get(k) for k in ("1", "X", "2")):
            lh, la = fit_lambdas(real["1"], real["X"], real["2"], real.get("O25"))
        else:
            lh, la = R.lambdas(m["h"], m["a"], cross=cross)
        m["odds"], src = odds_block(lh, la, real)
        m["real"] = sorted(src.keys())
        if o:
            m["book"] = o["book"]
        m["lam"] = [round(lh, 3), round(la, 3)]
        d = details.get(m.get("fid"))
        lu = (d or {}).get("lu") or {}
        if d and d.get("ev"):
            m["ev"] = d["ev"]
        lineup = {}
        for side, tid in (("h", m.get("hid")), ("a", m.get("aid"))):
            if lu.get(side) and lu[side]["xi"]:
                lineup[side] = dict(lu[side], kind="official")
            elif tid in last_xi:
                lineup[side] = dict(last_xi[tid], kind="probable")
        if lineup:
            m["lu"] = lineup
            sc_real = (o or {}).get("scorers") or {}
            m["scorers"] = {side: scorer_odds(lh if side == "h" else la, lineup[side]["xi"], goals, sc_real)[:16]
                            for side in lineup}
        m.pop("fid", None)
        days.setdefault(paris_day(m["k"]), []).append(m)
    for d in days.values():
        d.sort(key=lambda x: (x["k"], x["l"]))
    return days


def light_update(base_dir, out_dir):
    """Cheap hourly pass (about 3 API calls): live scores, results, goal events and official line-ups
    for yesterday and today, merged into the day documents already stored in the artifact."""
    now = datetime.now(PARIS)
    targets = [(now - timedelta(days=1)).strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d")]
    ours = {v[0]: k for k, v in LEAGUES.items()}
    docs = {}
    for d in targets:
        p = os.path.join(base_dir, d + ".json")
        if os.path.exists(p):
            doc = json.load(open(p))
            if "matches" not in doc and isinstance(doc.get("data"), dict):
                doc = doc["data"]
            docs[d] = doc
    by_id = {m["id"]: (d, m) for d, doc in docs.items() for m in doc.get("matches", [])}
    if not any(i.startswith("af") for i in by_id):
        print(json.dumps({"mode": "light", "skipped": "stored days are not API-Football data yet; run a full sync"}))
        return
    now_ms = int(time.time() * 1000)
    need, touched = [], set()
    for d in targets:
        for f in api("fixtures", date=d, timezone="Europe/Paris")["response"]:
            if f["league"]["id"] not in ours or f["league"]["season"] != SEASON:
                continue
            hit = by_id.get(f"af{f['fixture']['id']}")
            if not hit:
                continue
            day, m = hit
            st = STATUS.get(f["fixture"]["status"]["short"], "NS")
            m["st"], m["min"], m["k"] = st, f["fixture"]["status"].get("elapsed"), f["fixture"]["timestamp"] * 1000
            m["tbc"] = 1 if f["fixture"]["status"]["short"] == "TBD" else 0
            m.pop("lock", None)
            if st in ("FT", "LIVE", "HT") and f["goals"]["home"] is not None:
                m["sc"] = [f["goals"]["home"], f["goals"]["away"]]
            touched.add(day)
            official = m.get("lu") and all((m["lu"].get(s) or {}).get("kind") == "official" for s in ("h", "a"))
            if st in ("LIVE", "HT") or (st == "FT" and not m.get("evDone")) or (st == "NS" and not official and 0 <= m["k"] - now_ms <= 75 * 60000):
                need.append(f["fixture"]["id"])
    det = load_api_details(need) if need else {}
    for fid, d in det.items():
        day, m = by_id[f"af{fid}"]
        m["ev"] = d["ev"]
        if m["st"] == "FT":
            m["evDone"] = 1
        if d["lu"].get("h") and d["lu"].get("a"):
            real = {s["n"]: s["o"] for side in ("h", "a") for s in (m.get("scorers") or {}).get(side, []) if s.get("r")}
            lam = m.get("lam") or [1.3, 1.1]
            m["lu"] = {side: dict({k: v for k, v in d["lu"][side].items() if k != "tid"}, kind="official") for side in ("h", "a")}
            m["scorers"] = {side: scorer_odds(lam[0] if side == "h" else lam[1], m["lu"][side]["xi"], {}, real)[:16] for side in ("h", "a")}
    os.makedirs(os.path.join(out_dir, "days"), exist_ok=True)
    stamp = int(time.time() * 1000)
    for day in sorted(touched):
        doc = docs[day]
        doc["updatedAt"] = stamp
        json.dump(doc, open(os.path.join(out_dir, "days", day + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
    print(json.dumps({"mode": "light", "days_written": sorted(touched), "details": len(det), "api_calls": CALLS}))



# ---------- Autonomous mode: openfootball calendar + stored data + web research ----------
POSA = {"G": 0.01, "D": 0.12, "M": 0.30, "F": 0.24}


def assist_odds(lam, xi):
    if not xi:
        return []
    ws = [POSA.get(p.get("p", "M"), 0.2) + 0.05 * p.get("a", 0) for p in xi]
    tot = sum(ws) or 1
    out = []
    for p, w in zip(xi, ws):
        pr = 1 - math.exp(-lam * 0.72 * w / tot)
        if pr > 0.01:
            out.append({"n": p["n"], "o": to_odd(pr, 1.15, 1.6, 81)})
    out.sort(key=lambda s: s["o"])
    return out


def load_base(base_dir):
    """Stored day documents (as saved by ArtifactData with out_dir) -> {match id: match}."""
    stored = {}
    if not base_dir or not os.path.isdir(base_dir):
        return stored
    for f in os.listdir(base_dir):
        if not f.endswith(".json"):
            continue
        doc = json.load(open(os.path.join(base_dir, f)))
        if "matches" not in doc and isinstance(doc.get("data"), dict):
            doc = doc["data"]
        for m in doc.get("matches", []):
            stored[m["id"]] = m
    return stored


KEEP = ("sc", "ev", "as", "lu", "min", "src")


def merge_stored(days, stored, now_ms):
    for ms in days.values():
        for m in ms:
            old = stored.get(m["id"])
            if not old:
                continue
            for k in KEEP:
                if k in old and k not in m:
                    m[k] = old[k]
            if old.get("st") in ("FT", "PST", "CANC") and m.get("st") != "FT":
                m["st"] = old["st"]
                if old.get("sc"):
                    m["sc"] = old["sc"]
            if old.get("k", now_ms + 1) <= now_ms and old.get("odds"):  # freeze prices once the match started
                m["odds"], m["real"], m["lam"] = old["odds"], old.get("real", []), old.get("lam", m.get("lam"))
                for k in ("scorers", "assists"):
                    if old.get(k):
                        m[k] = old[k]


def apply_research(days, research):
    idx = {m["id"]: m for ms in days.values() for m in ms}
    n = 0
    for r in research.get("results", []):
        m = idx.get(r.get("id"))
        if not m:
            continue
        st = r.get("st", "FT")
        m["st"] = st
        if st == "FT" and isinstance(r.get("sc"), list) and len(r["sc"]) == 2:
            m["sc"] = [int(r["sc"][0]), int(r["sc"][1])]
            m["ev"] = [{"m": e.get("m"), "t": e["t"], "n": e["n"], "og": 1 if e.get("og") else 0} for e in r.get("ev", []) if e.get("t") in ("h", "a") and e.get("n")]
            m["as"] = [{"t": e["t"], "n": e["n"]} for e in r.get("as", []) if e.get("t") in ("h", "a") and e.get("n")]
        m.pop("lock", None)
        n += 1
    for r in research.get("lineups", []):
        m = idx.get(r.get("id"))
        if not m or m.get("st") == "FT":
            continue
        lu = {}
        for side in ("h", "a"):
            t = r.get(side) or {}
            xi = []
            for p in t.get("xi", []):
                if not p.get("n"):
                    continue
                q = {"n": p["n"], "no": p.get("no"), "p": p.get("p") if p.get("p") in POSW else "M"}
                for k in ("g", "a"):  # season goals / assists, when the research found them
                    if isinstance(p.get(k), (int, float)) and 0 <= p[k] < 80:
                        q[k] = int(p[k])
                xi.append(q)
            if len(xi) >= 9:
                lu[side] = {"f": t.get("f"), "xi": xi[:11], "kind": "official" if r.get("kind") == "official" else "probable"}
        if lu:
            old = m.get("lu") or {}
            for side in ("h", "a"):  # never downgrade an official XI to a probable one
                if (old.get(side) or {}).get("kind") == "official" and (lu.get(side) or {}).get("kind") != "official":
                    lu[side] = old[side]
                elif side not in lu and old.get(side):
                    lu[side] = old[side]
            m["lu"] = lu
            n += 1
    for k, v in (research.get("kickoffs") or {}).items():  # confirmed kick-off times found during research
        m = idx.get(k)
        if m and isinstance(v, (int, float)) and v > 1.7e12:
            m["k"], m["tbc"] = int(v), 0
            m.pop("lock", None)
    return n


def player_markets(days, now_ms):
    for ms in days.values():
        for m in ms:
            if not m.get("lu") or m["k"] <= now_ms:
                continue
            lam = m.get("lam") or [1.3, 1.1]
            m["scorers"] = {s: scorer_odds(lam[0] if s == "h" else lam[1], m["lu"][s]["xi"], {p["n"]: p.get("g", 0) for p in m["lu"][s]["xi"]}, None)[:16] for s in m["lu"]}
            m["assists"] = {s: assist_odds(lam[0] if s == "h" else lam[1], m["lu"][s]["xi"])[:14] for s in m["lu"]}


def research_plan(days, now_ms, max_lineups=40):
    need_res, need_lu = [], []
    for d, ms in sorted(days.items()):
        for m in ms:
            if m.get("st") in ("FT", "PST", "CANC"):
                continue
            if m["k"] + 115 * 60000 < now_ms and now_ms - m["k"] < 5 * 86400000:
                need_res.append(m)
            elif 0 < m["k"] - now_ms < 36 * 3600000:
                lu = m.get("lu") or {}
                official = all((lu.get(s) or {}).get("kind") == "official" for s in ("h", "a"))
                if not lu or (not official and m["k"] - now_ms < 100 * 60000):
                    need_lu.append(m)
    need_lu = sorted(need_lu, key=lambda m: m["k"])[:max_lineups]
    fmt = lambda m: {"id": m["id"], "league": LEAGUES[m["l"]][4], "round": m.get("r"), "home": m["h"], "away": m["a"],
                     "kickoff_paris": datetime.fromtimestamp(m["k"] / 1000, PARIS).strftime("%a %d/%m %H:%M") + (" (horaire à confirmer)" if m.get("tbc") else ""),
                     "has_lineup": (m.get("lu") or {}).get("h", {}).get("kind")}
    return {"results_needed": [fmt(m) for m in need_res], "lineups_needed": [fmt(m) for m in need_lu]}


def autonomous(a):
    now = datetime.now(PARIS)
    now_ms = int(time.time() * 1000)
    a.of_dir = a.of_dir or os.path.join(a.out, "_of")
    os.makedirs(a.of_dir, exist_ok=True)
    for lid, (_, f, *_r) in LEAGUES.items():
        if f:
            urllib.request.urlretrieve(f"https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/{f}.json",
                                       os.path.join(a.of_dir, f"2026-27_{f}.json"))
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ucl_2026-27.json")
    if os.path.exists(here):
        import shutil
        shutil.copy(here, os.path.join(a.of_dir, "ucl_2026-27.json"))
    days = build(load_openfootball(a.of_dir))
    stored = load_base(a.base_dir)
    stored_counts = {}
    if a.base_dir and os.path.isdir(a.base_dir):
        for f in os.listdir(a.base_dir):
            if f.endswith(".json"):
                doc = json.load(open(os.path.join(a.base_dir, f)))
                doc = doc.get("data", doc) if "matches" not in doc else doc
                stored_counts[f[:-5]] = len(doc.get("matches", []))
    merge_stored(days, stored, now_ms)
    if a.cmd == "plan":
        print(json.dumps(research_plan(days, now_ms), ensure_ascii=False, indent=1))
        return
    changed_research = 0
    if a.research and os.path.exists(a.research):
        changed_research = apply_research(days, json.load(open(a.research)))
    player_markets(days, now_ms)
    regrouped = {}
    for ms in days.values():  # a confirmed kick-off can move a match to another day
        for m in ms:
            regrouped.setdefault(paris_day(m["k"]), []).append(m)
    days = regrouped
    for d in days.values():
        d.sort(key=lambda x: (x["k"], x["l"]))
    os.makedirs(os.path.join(a.out, "days"), exist_ok=True)
    os.makedirs(os.path.join(a.out, "meta"), exist_ok=True)
    lo = (now - timedelta(days=a.days_back)).strftime("%Y-%m-%d")
    hi = (now + timedelta(days=a.days_ahead)).strftime("%Y-%m-%d")
    stamp = int(time.time() * 1000)
    written = []
    for day, ms in sorted(days.items()):
        if day < lo or (not a.full and day > hi):
            continue
        same = all(json.dumps(m, sort_keys=True) == json.dumps(stored.get(m["id"]), sort_keys=True) for m in ms) and \
            len(ms) == stored_counts.get(day, -1)
        if same and not a.full:
            continue
        json.dump({"date": day, "src": "openfootball+web", "updatedAt": stamp, "matches": ms},
                  open(os.path.join(a.out, "days", day + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
        written.append(day)
    meta = {"src": "openfootball+web", "updatedAt": stamp, "season": "2026-27",
            "days": {d: [len(ms), sorted({m["l"] for m in ms})] for d, ms in sorted(days.items()) if d >= lo}}
    json.dump(meta, open(os.path.join(a.out, "meta", "season.json"), "w"), separators=(",", ":"))
    print(json.dumps({"mode": "auto", "days_written": written, "research_applied": changed_research}))



# ---------- Supabase storage (standalone Vprono) ----------
def sb_request(base, method, path, body=None, prefer=None):
    """Talk to Supabase's REST API. The secret key is added by the network proxy as the `apikey` header;
    when running elsewhere, set VPRONO_SUPABASE_KEY."""
    key = os.environ.get("VPRONO_SUPABASE_KEY", "proxy-injected")
    headers = {"apikey": key, "Content-Type": "application/json"}
    if key.startswith("eyJ"):  # legacy JWT service_role key also needs the Authorization header
        headers["Authorization"] = "Bearer " + key
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    req = urllib.request.Request(base.rstrip("/") + "/rest/v1/" + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def sb_fetch(base, base_dir, days_back):
    os.makedirs(base_dir, exist_ok=True)
    lo = (datetime.now(PARIS) - timedelta(days=days_back + 3)).strftime("%Y-%m-%d")
    rows = sb_request(base, "GET", f"days?select=date,doc&date=gte.{lo}&order=date")
    for r in rows:
        json.dump(r["doc"], open(os.path.join(base_dir, r["date"] + ".json"), "w"), ensure_ascii=False)
    print(json.dumps({"fetched_days": len(rows)}))


def sb_push(base, out_dir):
    days_dir, meta_p = os.path.join(out_dir, "days"), os.path.join(out_dir, "meta", "season.json")
    files = sorted(f for f in os.listdir(days_dir) if f.endswith(".json")) if os.path.isdir(days_dir) else []
    now = datetime.now(timezone.utc).isoformat()
    batch, size, pushed = [], 0, 0
    def flush():
        nonlocal batch, size, pushed
        if batch:
            sb_request(base, "POST", "days?on_conflict=date", batch, "resolution=merge-duplicates,return=minimal")
            pushed += len(batch)
        batch, size = [], 0
    for f in files:
        doc = json.load(open(os.path.join(days_dir, f)))
        batch.append({"date": f[:-5], "doc": doc, "updated_at": now})
        size += os.path.getsize(os.path.join(days_dir, f))
        if size > 800000 or len(batch) >= 40:
            flush()
    flush()
    if os.path.exists(meta_p):
        sb_request(base, "POST", "meta?on_conflict=id", [{"id": "season", "doc": json.load(open(meta_p)), "updated_at": now}],
                   "resolution=merge-duplicates,return=minimal")
    print(json.dumps({"pushed_days": pushed, "meta": os.path.exists(meta_p)}))



# ---------- Evening boosted odd + push notifications ----------
BOOST_MARKETS = [  # (market key, label template, boost factor); one is picked per day
    ("FAV", "{fav} gagne", 1.35),
    ("BY", "Les deux équipes marquent", 1.35),
    ("O25", "Plus de 2,5 buts dans le match", 1.35),
    ("SC", "{player} marque", 1.30),
]


def make_boost(base, out_dir):
    now = datetime.now(PARIS)
    today = now.strftime("%Y-%m-%d")
    rows = sb_request(base, "GET", f"days?select=doc&date=eq.{today}")
    if not rows:
        print(json.dumps({"boost": None, "why": "no matches today"}))
        return None
    now_ms = int(time.time() * 1000)
    evening = [m for m in rows[0]["doc"]["matches"]
               if m.get("st") == "NS" and not m.get("tbc") and m.get("odds") and m["k"] > now_ms + 30 * 60000
               and datetime.fromtimestamp(m["k"] / 1000, PARIS).hour >= 17]
    if not evening:
        print(json.dumps({"boost": None, "why": "no evening match"}))
        return None
    prio = {"CL": 0, "L1": 1, "PL": 2, "LL": 3, "SA": 4, "BL": 5}
    evening.sort(key=lambda m: (prio.get(m["l"], 9), abs(m["odds"]["1"] - m["odds"]["2"])))
    m = evening[0]
    kind, tpl, factor = BOOST_MARKETS[now.toordinal() % len(BOOST_MARKETS)]
    short = lambda n: re.sub(r"\b(FC|CF|AFC|SC|AC|AS|SSC|OGC|RC|1\.)\b", "", n).strip()
    mk, lbl = None, None
    if kind == "SC":
        cand = []
        for side in ("h", "a"):
            for p in (m.get("scorers") or {}).get(side, [])[:1]:
                cand.append((p["o"], side, p["n"]))
        if cand:
            o, side, name = min(cand)
            mk, lbl = f"SC:{side}:{name}", f"{name} marque"
        else:
            kind, tpl, factor = BOOST_MARKETS[0]
    if kind == "FAV":
        side = "1" if m["odds"]["1"] <= m["odds"]["2"] else "2"
        mk, lbl = side, f"{short(m['h'] if side == '1' else m['a'])} gagne"
    elif kind in ("BY", "O25"):
        mk, lbl = kind, tpl
    base_odd = (m["odds"].get(mk) if not mk.startswith("SC:") else
                next(p["o"] for p in m["scorers"][mk[3]] if p["n"] == mk[5:]))
    boosted = round(max(base_odd * factor, base_odd + 0.25), 2)
    kickoff = datetime.fromtimestamp(m["k"] / 1000, PARIS).strftime("%H:%M")
    mt = f"{short(m['h'])} – {short(m['a'])}"
    doc = {"date": today, "mid": m["id"], "d": today, "mk": mk, "lbl": lbl, "mt": mt, "l": m["l"], "k": m["k"],
           "base": base_odd, "odd": boosted, "max": 20,
           "title": f"🔥 Cote boostée : {base_odd:.2f} → {boosted:.2f}",
           "body": f"{lbl} ({mt}, {kickoff}). Mise max 20 pts, ce soir seulement !"}
    sb_request(base, "POST", "boosts?on_conflict=date", [{"date": today, "doc": doc}], "resolution=merge-duplicates,return=minimal")
    print(json.dumps({"boost": doc}, ensure_ascii=False))
    return doc


def _b64u(b):
    import base64
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _b64u_dec(s):
    import base64
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def webpush_send(sub, payload, pem, subject="mailto:noreply@vprono.app", ttl=6 * 3600):
    """Encrypt (RFC 8291, aes128gcm) and send one Web Push message signed with VAPID (RFC 8292). Returns the HTTP status."""
    import os as _os
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec, utils
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    ua_pub = _b64u_dec(sub["p256dh"]); auth = _b64u_dec(sub["auth"])
    eph = ec.generate_private_key(ec.SECP256R1())
    as_pub = eph.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    shared = eph.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_pub))
    ikm = HKDF(hashes.SHA256(), 32, auth, b"WebPush: info\x00" + ua_pub + as_pub).derive(shared)
    salt = _os.urandom(16)
    cek = HKDF(hashes.SHA256(), 16, salt, b"Content-Encoding: aes128gcm\x00").derive(ikm)
    nonce = HKDF(hashes.SHA256(), 12, salt, b"Content-Encoding: nonce\x00").derive(ikm)
    body = salt + (4096).to_bytes(4, "big") + bytes([len(as_pub)]) + as_pub + AESGCM(cek).encrypt(nonce, payload.encode() + b"\x02", None)

    key = serialization.load_pem_private_key(pem.encode(), None)
    pub = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    u = urllib.parse.urlparse(sub["endpoint"])
    hdr = _b64u(json.dumps({"typ": "JWT", "alg": "ES256"}).encode())
    claims = _b64u(json.dumps({"aud": f"{u.scheme}://{u.netloc}", "exp": int(time.time()) + 12 * 3600, "sub": subject}).encode())
    r, s_ = utils.decode_dss_signature(key.sign(f"{hdr}.{claims}".encode(), ec.ECDSA(hashes.SHA256())))
    jwt = f"{hdr}.{claims}.{_b64u(r.to_bytes(32, 'big') + s_.to_bytes(32, 'big'))}"
    req = urllib.request.Request(sub["endpoint"], data=body, method="POST", headers={
        "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", "TTL": str(ttl), "Urgency": "normal",
        "Authorization": f"vapid t={jwt}, k={_b64u(pub)}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code


def send_push(base, title, body, url="./"):
    """Send a notification to every registered device (only needs the `cryptography` package)."""
    key = sb_request(base, "GET", "app_secrets?select=value&key=eq.vapid_private_pem")
    if not key:
        raise SystemExit("VAPID key missing in app_secrets")
    pem = key[0]["value"]
    subs = sb_request(base, "GET", "push_subs?select=endpoint,p256dh,auth")
    sent, gone, failed = 0, [], 0
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": "boost"})
    for s in subs:
        try:
            code = webpush_send(s, payload, pem)
        except Exception as e:
            code = None
            print("push failed", str(e)[:160], file=sys.stderr)
        if code in (200, 201, 202):
            sent += 1
        elif code in (404, 410):
            gone.append(s["endpoint"])
        else:
            failed += 1
            print("push failed with status", code, s["endpoint"][:40], file=sys.stderr)
    for ep in gone:
        sb_request(base, "DELETE", "push_subs?endpoint=eq." + urllib.parse.quote(ep, safe=""))
    print(json.dumps({"devices": len(subs), "sent": sent, "removed": len(gone), "failed": failed}))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["api", "of", "auto"], default="auto")
    ap.add_argument("--no-topscorers", action="store_true")
    ap.add_argument("--out", required=True)
    ap.add_argument("--of-dir")
    ap.add_argument("--days-back", type=int, default=3)
    ap.add_argument("--days-ahead", type=int, default=10)
    ap.add_argument("--full", action="store_true", help="write every day of the season")
    ap.add_argument("--mode", choices=["full", "light"], default="full")
    ap.add_argument("--base-dir", help="light mode: folder with the stored day documents (<date>.json)")
    ap.add_argument("cmd", nargs="?", choices=["plan", "build", "fetch", "push", "boost", "notify"],
                    help="autonomous mode: 'fetch' stored days from Supabase, 'plan' what to research, 'build' the documents, 'push' them to Supabase")
    ap.add_argument("--supabase", default=os.environ.get("VPRONO_SUPABASE_URL"), help="https://<project>.supabase.co")
    ap.add_argument("--research", help="build: JSON file with web research results and line-ups")
    ap.add_argument("--no-notify", action="store_true", help="boost: do not send the notification")
    ap.add_argument("--title", default="Vprono")
    ap.add_argument("--body", default="")
    a = ap.parse_args()
    if a.cmd == "fetch":
        return sb_fetch(a.supabase, a.base_dir, a.days_back)
    if a.cmd == "push":
        return sb_push(a.supabase, a.out)
    if a.cmd == "boost":
        doc = make_boost(a.supabase, a.out)
        if doc and not a.no_notify:
            send_push(a.supabase, doc["title"], doc["body"])
        return
    if a.cmd == "notify":
        return send_push(a.supabase, a.title, a.body)
    if a.cmd:
        return autonomous(a)
    now = datetime.now(PARIS)
    if a.source == "auto":
        try:
            st = api("status")
            a.source = "api" if st.get("response") else "of"
        except Exception as e:
            print("API-Football unavailable, falling back to openfootball:", e, file=sys.stderr)
            a.source = "of"
    if a.mode == "light":
        if a.source != "api":
            print(json.dumps({"mode": "light", "skipped": "API-Football unavailable"}))
            return
        return light_update(a.base_dir, a.out)
    if a.source == "of":
        a.of_dir = a.of_dir or os.path.join(a.out, "_of")
        os.makedirs(a.of_dir, exist_ok=True)
        for lid, (_, f, *_r) in LEAGUES.items():
            if f:
                urllib.request.urlretrieve(f"https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/{f}.json",
                                           os.path.join(a.of_dir, f"2026-27_{f}.json"))
        here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ucl_2026-27.json")
        if os.path.exists(here):
            import shutil
            shutil.copy(here, os.path.join(a.of_dir, "ucl_2026-27.json"))
        matches = load_openfootball(a.of_dir)
        days = build(matches)
        src = "openfootball"
    else:
        matches = load_api_fixtures()
        now_ms = int(time.time() * 1000)
        lo, hi = now_ms - a.days_back * 86400000, now_ms + a.days_ahead * 86400000
        window = [m for m in matches if lo <= m["k"] <= hi]
        odds = load_api_odds()
        # details: matches in window that started (official XI + events) or start within 2h (official XI)
        det_ids = [m["fid"] for m in window if m["st"] in ("FT", "LIVE", "HT") or 0 <= m["k"] - now_ms <= 2 * 3600000]
        # probable XI: each team's last finished match in any competition we track
        last = {}
        for m in sorted((m for m in matches if m["st"] == "FT"), key=lambda m: m["k"]):
            last[m["hid"]] = m["fid"]
            last[m["aid"]] = m["fid"]
        need = set(det_ids) | set(last.values())
        details = load_api_details(sorted(need))
        last_xi = {}
        for tid, fid in last.items():
            for side in ("h", "a"):
                x = details.get(fid, {}).get("lu", {}).get(side)
                if x and x.get("tid") == tid:
                    last_xi[tid] = {k: v for k, v in x.items() if k != "tid"}
        for d in details.values():
            for x in d["lu"].values():
                x.pop("tid", None)
        goals = {} if a.no_topscorers else load_api_topscorers()
        days = build(matches, odds, {k: v for k, v in details.items() if k in set(det_ids)}, goals, last_xi)
        src = "api-football"
    os.makedirs(os.path.join(a.out, "days"), exist_ok=True)
    os.makedirs(os.path.join(a.out, "meta"), exist_ok=True)
    today = now.strftime("%Y-%m-%d")
    lo = (now - timedelta(days=a.days_back)).strftime("%Y-%m-%d")
    hi = (now + timedelta(days=a.days_ahead)).strftime("%Y-%m-%d")
    stamp = int(time.time() * 1000)
    written = []
    for day, ms in sorted(days.items()):
        if (not a.full and not (lo <= day <= hi)) or day < lo:
            continue
        doc = {"date": day, "src": src, "updatedAt": stamp, "matches": ms}
        p = os.path.join(a.out, "days", day + ".json")
        json.dump(doc, open(p, "w"), ensure_ascii=False, separators=(",", ":"))
        sz = os.path.getsize(p)
        if sz > 250000:
            print("WARNING day too big", day, sz, file=sys.stderr)
        written.append(day)
    first_day = (now - timedelta(days=a.days_back)).strftime("%Y-%m-%d")
    meta = {"src": src, "updatedAt": stamp, "season": "2026-27",
            "days": {d: [len(ms), sorted({m["l"] for m in ms})] for d, ms in sorted(days.items()) if d >= first_day}}
    json.dump(meta, open(os.path.join(a.out, "meta", "season.json"), "w"), separators=(",", ":"))
    print(json.dumps({"source": src, "matches": sum(len(v) for v in days.values()), "days_written": len(written),
                      "first": written[:1], "last": written[-1:], "api_calls": CALLS}))


if __name__ == "__main__":
    main()
