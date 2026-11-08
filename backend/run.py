"""CLI and reusable local runner. No FastAPI/Inngest imports in the direct path."""

import argparse
import asyncio
import csv
import io
import json
from pathlib import Path
import shutil
import time
import uuid
from .config import Settings
from .ingest import read_zip
from .model import get_adapter
from .pipeline import analyze_episode, parse_analysis, finalize_analysis
from .rag import RAG
from .store import Store, dump


def csv_results(cards):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(
        [
            "rank",
            "segment",
            "episode",
            "start",
            "end",
            "start_cs",
            "end_cs",
            "total_seconds",
            "weighted",
            "hook",
            "open_question",
            "event_ids",
        ]
    )

    def safe(value):
        # Spreadsheet formula injection protection for model/source-derived strings.
        return (
            "'" + value
            if isinstance(value, str)
            and value.startswith(("=", "+", "-", "@", "\t", "\r"))
            else value
        )

    for card in cards:
        for i, s in enumerate(card["segments"]):
            writer.writerow(
                [
                    safe(v)
                    for v in [
                        card["rank"],
                        i + 1,
                        s["episode"],
                        s["start"],
                        s["end"],
                        s["start_cs"],
                        s["end_cs"],
                        card["total_seconds"],
                        card["scores"]["weighted"],
                        card["hook"]["description"],
                        card["cliffhanger"]["open_question"],
                        " ".join(s["event_ids"]),
                    ]
                ]
            )
    return out.getvalue()


def export_results(store, aid, out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    results = json.loads(store.analysis(aid)["results"])
    for key, filename in [
        ("promos", "promos.json"),
        ("rejected", "rejected.json"),
        ("run_report", "run_report.json"),
    ]:
        (out / filename).write_text(
            json.dumps(results[key], indent=2, ensure_ascii=False), encoding="utf-8"
        )
    (out / "promos.csv").write_text(csv_results(results["promos"]), encoding="utf-8")
    raw = out / "raw"
    raw.mkdir(exist_ok=True)
    for call in store.calls(aid):
        (raw / (call["id"] + ".txt")).write_text(call["raw"], encoding="utf-8")
        (raw / (call["id"] + ".meta.json")).write_text(
            dump({k: v for k, v in call.items() if k != "raw"}), encoding="utf-8"
        )
    return results


async def run_local(store, aid, cfg, adapter_factory=get_adapter):
    parse_analysis(store, aid, cfg)
    semaphore = asyncio.Semaphore(cfg.MODEL_CONCURRENCY)

    async def one(ep):
        async with semaphore:
            try:
                adapter = adapter_factory(cfg, store, aid)
                rag = RAG(store, adapter, cfg)
                store.episode_state(aid, ep.number, "indexing")
                await asyncio.to_thread(rag.index_episode, aid, ep)
                store.episode_state(aid, ep.number, "analyzing")
                candidates = await asyncio.to_thread(
                    analyze_episode, ep, adapter, cfg, store, aid, rag
                )
                store.save_candidates(aid, candidates)
                store.episode_state(aid, ep.number, "complete")
            except Exception as exc:
                store.episode_state(aid, ep.number, "failed", str(exc))

    await asyncio.gather(*(one(ep) for ep in store.episodes(aid).values()))
    if store.claim_finalize(aid):
        try:
            rag = (
                RAG(store, adapter_factory(cfg, store, aid), cfg)
                if any(r["status"] == "complete" for r in store.episode_rows(aid))
                else None
            )
            await asyncio.to_thread(finalize_analysis, store, aid, cfg, rag)
        except Exception as exc:
            store.update_analysis(aid, status="failed", stage="Failed", error=str(exc))
            raise
    return aid


async def main_async(args):
    cfg = Settings.from_env()
    store = Store(cfg.db_path)
    if args.resume:
        aid = args.resume
        store.analysis(aid)
    else:
        read_zip(args.zip, cfg)
        target = Path(cfg.DATA_DIR) / "uploads" / (uuid.uuid4().hex + ".zip")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.zip, target)
        aid = store.create_analysis(target)
    print(f"analysis_id={aid}", flush=True)
    if args.no_inngest:
        if args.resume:
            raise ValueError(
                "--resume is for exporting/polling an existing Inngest analysis"
            )
        await run_local(store, aid, cfg)
    else:
        from .workflows import client
        import inngest

        if not args.resume:
            await client.send(
                inngest.Event(
                    name="promo/analysis.requested",
                    data={"analysis_id": aid},
                    id=f"{aid}:requested",
                )
            )
        deadline = time.monotonic() + args.timeout
        while store.analysis(aid)["status"] not in ("complete", "partial", "failed"):
            if time.monotonic() > deadline:
                raise TimeoutError(
                    f"Analysis still running. Resume export with --resume {aid}"
                )
            await asyncio.sleep(2)
    analysis = store.analysis(aid)
    if analysis["results"]:
        export_results(store, aid, args.out)
    if analysis["status"] == "failed":
        raise RuntimeError(
            analysis["error"] or "All episodes failed; inspect run_report.json"
        )
    print(f"{analysis['status']}: outputs in {args.out}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--zip")
    source.add_argument("--resume", help="Poll/export an existing Inngest analysis ID")
    parser.add_argument("--out", required=True)
    parser.add_argument("--no-inngest", action="store_true")
    parser.add_argument("--timeout", type=int, default=3600)
    args = parser.parse_args()
    try:
        asyncio.run(main_async(args))
    except Exception as exc:
        parser.exit(1, f"Error: {exc}\n")


if __name__ == "__main__":
    main()
