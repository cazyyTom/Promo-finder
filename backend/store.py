"""SQLite persistence. Short transactions, WAL, and idempotent upserts only."""

from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import uuid
from .schemas import Episode, Candidate, PromoError


def dump(value):
    if hasattr(value, "model_dump"):
        value = value.model_dump(mode="json", by_alias=True)
    return json.dumps(value, ensure_ascii=False)


class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS analyses(
              id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT, params TEXT,
              zip_path TEXT, parse_report TEXT, results TEXT, stage TEXT, error TEXT);
            CREATE TABLE IF NOT EXISTS episodes(
              analysis_id TEXT, number INTEGER, status TEXT, error TEXT, event_count INTEGER,
              payload TEXT, discovery TEXT, PRIMARY KEY(analysis_id,number));
            CREATE TABLE IF NOT EXISTS episode_context(
              analysis_id TEXT, number INTEGER, logline TEXT, continuity TEXT,
              PRIMARY KEY(analysis_id,number));
            CREATE TABLE IF NOT EXISTS events(
              analysis_id TEXT, id TEXT, episode INTEGER, payload TEXT,
              PRIMARY KEY(analysis_id,id));
            CREATE TABLE IF NOT EXISTS candidates(
              analysis_id TEXT, id TEXT, episode INTEGER, status TEXT, reject_reason TEXT,
              payload TEXT, PRIMARY KEY(analysis_id,id));
            CREATE TABLE IF NOT EXISTS promos(
              analysis_id TEXT, rank INTEGER, payload TEXT, PRIMARY KEY(analysis_id,rank));
            CREATE TABLE IF NOT EXISTS model_calls(
              id TEXT PRIMARY KEY, analysis_id TEXT, purpose TEXT, model TEXT,
              tokens_in INTEGER, tokens_out INTEGER, latency_ms INTEGER, ok INTEGER,
              raw TEXT, error TEXT);
            CREATE TABLE IF NOT EXISTS vectors(
              analysis_id TEXT, collection TEXT, chunk_id TEXT, episode INTEGER,
              start_cs INTEGER, end_cs INTEGER, event_ids_json TEXT, text TEXT,
              embedding BLOB, PRIMARY KEY(analysis_id,collection,chunk_id));
            CREATE TABLE IF NOT EXISTS embedding_cache(key TEXT PRIMARY KEY, embedding BLOB);
            CREATE TABLE IF NOT EXISTS episode_cache(key TEXT PRIMARY KEY, payload TEXT);
            CREATE INDEX IF NOT EXISTS vector_filter ON vectors(analysis_id,collection,episode,start_cs,end_cs);
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=30000")
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def create_analysis(self, zip_path, params=None):
        aid = uuid.uuid4().hex
        with self.connection() as db:
            db.execute(
                "INSERT INTO analyses VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    aid,
                    "queued",
                    datetime.now(timezone.utc).isoformat(),
                    dump(params or {}),
                    str(zip_path),
                    None,
                    None,
                    "Parsing",
                    None,
                ),
            )
        return aid

    def analysis(self, aid):
        with self.connection() as db:
            row = db.execute("SELECT * FROM analyses WHERE id=?", (aid,)).fetchone()
        if row is None:
            raise PromoError("unknown_analysis", "Analysis not found", 404)
        return dict(row)

    def update_analysis(self, aid, **values):
        allowed = {"status", "parse_report", "results", "stage", "error"}
        if not values or not set(values) <= allowed:
            raise ValueError("Invalid analysis update")
        with self.connection() as db:
            db.execute(
                "UPDATE analyses SET "
                + ",".join(f"{k}=?" for k in values)
                + " WHERE id=?",
                (*values.values(), aid),
            )

    def save_parse(self, aid, result):
        with self.connection() as db:
            for ep in result.episodes:
                db.execute(
                    "INSERT OR IGNORE INTO episodes VALUES (?,?,?,?,?,?,?)",
                    (
                        aid,
                        ep.number,
                        "pending",
                        None,
                        len(ep.events),
                        dump(ep.model_copy(update={"logline": "", "continuity": ""})),
                        None,
                    ),
                )
                db.execute(
                    "INSERT OR REPLACE INTO episode_context VALUES (?,?,?,?)",
                    (aid, ep.number, ep.logline, ep.continuity),
                )
                for e in ep.events:
                    db.execute(
                        "INSERT OR REPLACE INTO events VALUES (?,?,?,?)",
                        (aid, e.id, ep.number, dump(e)),
                    )
            db.execute(
                "UPDATE analyses SET parse_report=?, status=?, stage=? WHERE id=?",
                (
                    dump(
                        {
                            "reports": [r.model_dump() for r in result.reports],
                            "files_received": result.files_received,
                        }
                    ),
                    "analyzing",
                    "Indexing",
                    aid,
                ),
            )

    def episode_rows(self, aid):
        with self.connection() as db:
            return [
                dict(r)
                for r in db.execute(
                    "SELECT * FROM episodes WHERE analysis_id=? ORDER BY number", (aid,)
                )
            ]

    def episodes(self, aid):
        return {
            r["number"]: self.episode(aid, r["number"]) for r in self.episode_rows(aid)
        }

    def episode(self, aid, number):
        with self.connection() as db:
            r = db.execute(
                "SELECT payload FROM episodes WHERE analysis_id=? AND number=?",
                (aid, number),
            ).fetchone()
        if not r:
            raise PromoError("unknown_episode", "Episode not found", 404)
        episode = Episode.model_validate_json(r[0])
        with self.connection() as db:
            context = db.execute(
                "SELECT logline,continuity FROM episode_context WHERE analysis_id=? AND number=?",
                (aid, number),
            ).fetchone()
        if context:
            episode.logline, episode.continuity = context
        return episode

    def episode_state(self, aid, number, status, error=None):
        with self.connection() as db:
            db.execute(
                "UPDATE episodes SET status=?, error=? WHERE analysis_id=? AND number=?",
                (status, error, aid, number),
            )

    def save_discovery(self, aid, number, discovery):
        with self.connection() as db:
            db.execute(
                "UPDATE episodes SET discovery=? WHERE analysis_id=? AND number=?",
                (dump(discovery), aid, number),
            )

    def discovery(self, aid, number):
        from .schemas import Discovery

        with self.connection() as db:
            row = db.execute(
                "SELECT discovery FROM episodes WHERE analysis_id=? AND number=?",
                (aid, number),
            ).fetchone()
        return Discovery.model_validate_json(row[0])

    def save_candidates(self, aid, candidates):
        with self.connection() as db:
            for c in candidates:
                db.execute(
                    "INSERT OR REPLACE INTO candidates VALUES (?,?,?,?,?,?)",
                    (
                        aid,
                        c.id,
                        c.segments[-1].episode,
                        c.status,
                        dump(c.reject_reason),
                        dump(c),
                    ),
                )

    def candidates(self, aid, number=None):
        sql, args = "SELECT payload FROM candidates WHERE analysis_id=?", [aid]
        if number is not None:
            sql += " AND episode=?"
            args.append(number)
        with self.connection() as db:
            return [Candidate.model_validate_json(r[0]) for r in db.execute(sql, args)]

    def claim_finalize(self, aid, owner="local"):
        """Atomic ownership, replayable by the same durable event after a crash."""
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            pending = db.execute(
                "SELECT COUNT(*) FROM episodes WHERE analysis_id=? AND status NOT IN ('complete','failed')",
                (aid,),
            ).fetchone()[0]
            if pending:
                return False
            row = db.execute(
                "SELECT status,params FROM analyses WHERE id=?", (aid,)
            ).fetchone()
            params = json.loads(row["params"])
            if row["status"] == "finalizing":
                return params.get("finalize_owner") == owner
            if row["status"] not in ("analyzing", "queued"):
                return False
            params["finalize_owner"] = owner
            db.execute(
                "UPDATE analyses SET status='finalizing',stage='Ranking candidates',params=? WHERE id=?",
                (dump(params), aid),
            )
            return True

    def save_results(self, aid, results):
        with self.connection() as db:
            db.execute("DELETE FROM promos WHERE analysis_id=?", (aid,))
            for p in results["promos"]:
                db.execute(
                    "INSERT INTO promos VALUES (?,?,?)", (aid, p["rank"], dump(p))
                )
            db.execute("UPDATE analyses SET results=? WHERE id=?", (dump(results), aid))

    def log_call(
        self,
        aid,
        purpose,
        model,
        tokens_in,
        tokens_out,
        latency_ms,
        ok,
        raw,
        error=None,
    ):
        with self.connection() as db:
            db.execute(
                "INSERT INTO model_calls VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    uuid.uuid4().hex,
                    aid,
                    purpose,
                    model,
                    tokens_in or 0,
                    tokens_out or 0,
                    latency_ms,
                    int(ok),
                    raw,
                    error,
                ),
            )

    def calls(self, aid):
        with self.connection() as db:
            return [
                dict(r)
                for r in db.execute(
                    "SELECT * FROM model_calls WHERE analysis_id=?", (aid,)
                )
            ]

    def cache_get(self, key):
        with self.connection() as db:
            r = db.execute(
                "SELECT payload FROM episode_cache WHERE key=?", (key,)
            ).fetchone()
        return (
            None
            if r is None
            else [Candidate.model_validate(c) for c in json.loads(r[0])]
        )

    def cache_put(self, key, candidates):
        with self.connection() as db:
            db.execute(
                "INSERT OR REPLACE INTO episode_cache VALUES (?,?)",
                (key, dump([c.model_dump(by_alias=True) for c in candidates])),
            )

    def embedding_get(self, key):
        with self.connection() as db:
            row = db.execute(
                "SELECT embedding FROM embedding_cache WHERE key=?", (key,)
            ).fetchone()
        return row[0] if row else None

    def embedding_put(self, key, vector):
        with self.connection() as db:
            db.execute(
                "INSERT OR REPLACE INTO embedding_cache VALUES (?,?)", (key, vector)
            )

    def replace_vectors(self, aid, collection, episode, rows):
        with self.connection() as db:
            sql, args = "DELETE FROM vectors WHERE analysis_id=? AND collection=?", [
                aid,
                collection,
            ]
            if episode is not None:
                sql += " AND episode=?"
                args.append(episode)
            db.execute(sql, args)
            db.executemany("INSERT INTO vectors VALUES (?,?,?,?,?,?,?,?,?)", rows)

    def vector_rows(self, aid, collection, filters):
        sql = "SELECT * FROM vectors WHERE analysis_id=? AND collection=?"
        args = [aid, collection]
        for key, clause in {
            "episode_min": "episode>=?",
            "episode_max": "episode<=?",
            "after_cs": "start_cs>=?",
            "before_cs": "end_cs<=?",
            "start_before_cs": "start_cs<=?",
            "end_after_cs": "end_cs>=?",
        }.items():
            if key in filters:
                sql += " AND " + clause
                args.append(filters[key])
        with self.connection() as db:
            return [dict(r) for r in db.execute(sql, args)]
