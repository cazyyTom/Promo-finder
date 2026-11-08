"""Thin durable wrappers. Step outputs contain counters/IDs, never screenplay payloads."""

import asyncio
import logging
import inngest
from .config import Settings
from .model import get_adapter
from .pipeline import (
    parse_analysis,
    discover,
    build_candidates,
    judge_candidate,
    repair_context,
    cache_key,
    finalize_analysis,
    annotate_candidate,
)
from .rag import RAG
from .store import Store

cfg = Settings.from_env()
client = inngest.Inngest(app_id=cfg.INNGEST_APP_ID, logger=logging.getLogger("uvicorn"))


def resources(aid):
    settings = Settings.from_env()
    store = Store(settings.db_path)
    adapter = get_adapter(settings, store, aid)
    return settings, store, adapter, RAG(store, adapter, settings)


def parse_step(aid):
    settings = Settings.from_env()
    return parse_analysis(Store(settings.db_path), aid, settings)


def episode_step(aid, number, stage):
    """Idempotent stage writes; provider retries occur inside the model boundary.

    A terminal per-episode error becomes a small return value, so sibling episodes
    continue and the durable completion event can still be sent.
    """
    settings = Settings.from_env()
    store = Store(settings.db_path)
    row = next(r for r in store.episode_rows(aid) if r["number"] == number)
    if row["status"] in ("failed", "complete"):
        return {"episode": number, "status": row["status"]}
    try:
        adapter = get_adapter(settings, store, aid)
        rag = RAG(store, adapter, settings)
        ep = store.episode(aid, number)
        key = cache_key(ep, settings)
        if stage == "index":
            store.episode_state(aid, number, "indexing")
            count = rag.index_episode(aid, ep)
            return {"chunks": count}
        if stage == "discover":
            cached = store.cache_get(key)
            if cached is not None:
                for c in cached:
                    c.answered_later = None
                    c.flags = list(dict.fromkeys(c.flags + ["episode_cache_hit"]))
                store.save_candidates(aid, cached)
                store.episode_state(aid, number, "complete")
                return {"cached": True}
            store.episode_state(aid, number, "analyzing")
            store.save_discovery(aid, number, discover(ep, adapter))
        elif stage == "build-candidates":
            store.save_candidates(
                aid, build_candidates(ep, store.discovery(aid, number), settings)
            )
        elif stage == "judge":
            episodes = store.episodes(aid)
            for c in store.candidates(aid, number):
                if c.status != "pending":
                    continue
                judge_candidate(c, episodes, adapter, settings)
                annotate_candidate(c, episodes, rag, aid)
                repaired = repair_context(c, episodes, adapter, settings, rag, aid)
                store.save_candidates(aid, [c] + ([repaired] if repaired else []))
        elif stage == "save":
            store.cache_put(key, store.candidates(aid, number))
            store.episode_state(aid, number, "complete")
        else:
            raise ValueError("Unknown stage")
        return {"episode": number, "stage": stage}
    except Exception as exc:
        logging.getLogger(__name__).exception("Episode %s failed at %s", number, stage)
        store.episode_state(aid, number, "failed", str(exc))
        return {"episode": number, "status": "failed"}


def claim_step(aid, owner):
    return Store(Settings.from_env().db_path).claim_finalize(aid, owner)


def rank_step(aid):
    settings = Settings.from_env()
    store = Store(settings.db_path)
    rag = (
        RAG(store, get_adapter(settings, store, aid), settings)
        if any(r["status"] == "complete" for r in store.episode_rows(aid))
        else None
    )
    return finalize_analysis(store, aid, settings, rag)


@client.create_function(
    fn_id="analysis-orchestrator",
    trigger=inngest.TriggerEvent(event="promo/analysis.requested"),
)
async def analysis_orchestrator(ctx: inngest.Context):
    aid = ctx.event.data["analysis_id"]
    counts = await ctx.step.run("parse", lambda: parse_step(aid))
    # IDs are read locally rather than returning large arrays from a durable step.
    rows = Store(Settings.from_env().db_path).episode_rows(aid)
    events = [
        inngest.Event(
            name="promo/episode.requested",
            data={"analysis_id": aid, "episode": r["number"]},
            id=f"{aid}:episode:{r['number']}",
        )
        for r in rows
    ]
    if events:
        await ctx.step.send_event("fan-out", events)
    else:
        await ctx.step.send_event(
            "empty-done",
            inngest.Event(
                name="promo/episode.done", data={"analysis_id": aid}, id=f"{aid}:empty"
            ),
        )
    return counts


@client.create_function(
    fn_id="analyze-episode",
    trigger=inngest.TriggerEvent(event="promo/episode.requested"),
    concurrency=[inngest.Concurrency(limit=cfg.MODEL_CONCURRENCY)],
)
async def analyze_episode_workflow(ctx: inngest.Context):
    aid, number = ctx.event.data["analysis_id"], int(ctx.event.data["episode"])
    for stage in ("index", "discover", "build-candidates", "judge", "save"):
        await ctx.step.run(stage, lambda stage=stage: episode_step(aid, number, stage))
    await ctx.step.send_event(
        "done",
        inngest.Event(
            name="promo/episode.done",
            data={"analysis_id": aid, "episode": number},
            id=f"{aid}:done:{number}",
        ),
    )
    return {"episode": number}


@client.create_function(
    fn_id="finalize-analysis", trigger=inngest.TriggerEvent(event="promo/episode.done")
)
async def finalize_workflow(ctx: inngest.Context):
    aid = ctx.event.data["analysis_id"]
    owner = str(ctx.event.id)
    claimed = await ctx.step.run("claim", lambda: claim_step(aid, owner))
    if not claimed:
        return {"waiting_or_already_finalized": True}
    return await ctx.step.run("rank-and-index-artifacts", lambda: rank_step(aid))


functions = [analysis_orchestrator, analyze_episode_workflow, finalize_workflow]
