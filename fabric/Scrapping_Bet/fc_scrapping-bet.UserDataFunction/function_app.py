import datetime
import json
import logging
import urllib.error
import urllib.parse
import urllib.request

import fabric.functions as fn

udf = fn.UserDataFunctions()

SLOTT_API_URL = "https://slott-france.com/api-2/betline/events/all"
SLOTT_QUERY = {
    "ctag": "fr-FR",
    "hideClosed": "true",
    "flags": "reg,urlv2,orn2,mm2,rrc,nodup,cmg",
}


def _fetch_slott_events(sportId):
    params = dict(SLOTT_QUERY)
    params["sport_id"] = sportId
    url = SLOTT_API_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; ScrappingBet/1.0)",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _runner_price(runner):
    price = runner.get("price")
    if price is not None:
        return float(price)
    price_str = runner.get("priceStr")
    if price_str:
        try:
            return float(str(price_str).replace(",", "."))
        except ValueError:
            return None
    return None


def _scrape_slott_sport(sportId, extraction, paris_tz):
    data = _fetch_slott_events(sportId)
    rows = []
    league_cache = {}

    for event in data.get("events") or []:
        league = event.get("league") or {}
        league_id = league.get("id")
        if league.get("name") and league_id is not None:
            league_cache[league_id] = league
        full_league = league_cache.get(league_id, league)
        competition = full_league.get("name") or ""

        if len(event.get("competitors") or []) != 2:
            continue

        market = None
        for m in event.get("markets") or []:
            if m.get("primary"):
                market = m
                break
        if market is None:
            for m in event.get("markets") or []:
                if len(m.get("runners") or []) == 2:
                    market = m
                    break
        if market is None:
            continue

        runners = market.get("runners") or []
        if len(runners) != 2:
            continue

        competitors = {}
        for c in event.get("competitors") or []:
            if c.get("homeAway"):
                competitors[c.get("homeAway")] = c.get("name")

        kickoff_raw = event.get("kickoff")
        cutoff = None
        if kickoff_raw:
            cutoff = datetime.datetime.fromtimestamp(
                kickoff_raw / 1000,
                tz=datetime.timezone.utc,
            ).astimezone(paris_tz).isoformat()

        for runner in runners:
            tags = runner.get("tags") or []
            tag = tags[0] if tags else None
            competiteur = competitors.get(tag, runner.get("name"))
            cote = _runner_price(runner)
            if cote is None:
                continue
            if (competiteur or "").lower() in ("oui", "non"):
                continue
            rows.append({
                "api_id": sportId,
                "competition": competition,
                "evenement": event.get("name") or "",
                "competiteur": competiteur or "",
                "cote": cote,
                "cutoff": cutoff,
                "extraction": extraction.isoformat(),
            })

    return rows


@udf.function()
def fetchSlottBetline(sportId: str) -> str:
    logging.info("fetchSlottBetline sportId=%s", sportId)
    return json.dumps(_fetch_slott_events(str(sportId)))


@udf.function()
def scrapeSlott(sportIds: str) -> str:
    logging.info("scrapeSlott sportIds=%s", sportIds)
    try:
        ids = json.loads(sportIds) if sportIds else []
    except (json.JSONDecodeError, TypeError):
        ids = [sportIds] if sportIds else []
    ids = [str(x) for x in ids] if isinstance(ids, list) else [str(ids)]
    paris_tz = datetime.timezone(datetime.timedelta(hours=1))
    extraction = datetime.datetime.now(paris_tz)
    all_rows = []
    for sportId in ids:
        try:
            all_rows.extend(_scrape_slott_sport(sportId, extraction, paris_tz))
        except urllib.error.HTTPError as exc:
            logging.warning("scrapeSlott sport %s HTTP %s", sportId, exc.code)
        except urllib.error.URLError as exc:
            logging.warning("scrapeSlott sport %s network %s", sportId, exc.reason)
    logging.info("scrapeSlott rows=%s", len(all_rows))
    return json.dumps(all_rows)


@udf.connection(argName="sqlDB", alias="scrappingbet")
@udf.function()
def scrapeAndStoreSlott(sqlDB: fn.FabricSqlConnection) -> str:
    paris_tz = datetime.timezone(datetime.timedelta(hours=1))
    extraction = datetime.datetime.now(paris_tz)

    connection = sqlDB.connect()
    cursor = connection.cursor()
    try:
        cursor.execute(
            "SELECT api_id FROM dbo.dim_sport_ids_API WHERE bookmaker = 'slott' AND actif = 1"
        )
        sport_ids = [str(row[0]) for row in cursor.fetchall()]

    finally:
        cursor.close()
        connection.close()

    logging.info("scrapeAndStoreSlott sport_ids=%s", sport_ids)

    all_rows = []
    for sportId in sport_ids:
        try:
            all_rows.extend(_scrape_slott_sport(sportId, extraction, paris_tz))
        except urllib.error.HTTPError as exc:
            logging.warning("scrapeAndStoreSlott sport %s HTTP %s", sportId, exc.code)
        except urllib.error.URLError as exc:
            logging.warning("scrapeAndStoreSlott sport %s network %s", sportId, exc.reason)

    logging.info("scrapeAndStoreSlott scraped %d rows", len(all_rows))

    connection = sqlDB.connect()
    cursor = connection.cursor()
    try:
        cursor.execute("DELETE FROM dbo.slott_cotes")

        insert_sql = (
            "INSERT INTO dbo.slott_cotes (api_id, competition, evenement, competiteur, cote, cutoff, extraction) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        for row in all_rows:
            cursor.execute(
                insert_sql,
                (
                    row["api_id"],
                    row["competition"],
                    row["evenement"],
                    row["competiteur"],
                    row["cote"],
                    row["cutoff"],
                    row["extraction"],
                ),
            )

        cursor.execute(
            "UPDATE dbo.slott_jobs SET status='done', completed_at=GETUTCDATE(), row_count=? WHERE id=1",
            (len(all_rows),),
        )

        connection.commit()
        logging.info("scrapeAndStoreSlott stored %d rows", len(all_rows))
        return json.dumps({"status": "done", "count": len(all_rows)})

    except Exception as exc:
        connection.rollback()
        logging.error("scrapeAndStoreSlott DB error: %s", exc)
        try:
            cursor.execute(
                "UPDATE dbo.slott_jobs SET status='error', error_msg=?, completed_at=GETUTCDATE() WHERE id=1",
                (str(exc)[:500],),
            )
            connection.commit()
        except Exception:
            pass
        raise
    finally:
        cursor.close()
        connection.close()


@udf.connection(argName="sqlDB", alias="scrappingbet")
@udf.function()
def getSlottJobStatus(sqlDB: fn.FabricSqlConnection) -> str:
    connection = sqlDB.connect()
    cursor = connection.cursor()
    try:
        cursor.execute(
            "SELECT status, requested_at, completed_at, row_count, error_msg "
            "FROM dbo.slott_jobs WHERE id=1"
        )
        row = cursor.fetchone()
        if row is None:
            return json.dumps({"status": "idle"})
        return json.dumps({
            "status": row[0],
            "requestedAt": row[1].isoformat() if row[1] else None,
            "completedAt": row[2].isoformat() if row[2] else None,
            "rowCount": row[3],
            "errorMsg": row[4],
        })
    finally:
        cursor.close()
        connection.close()
