"""Framework-free discovery, deterministic cuts, isolated judging, and ranking."""

from collections import Counter
from dataclasses import asdict
import hashlib
import json
import logging
from .ingest import display, parse_zip
from .model import DISCOVERY, JUDGE, LOOKAHEAD, PROMPT_VERSION, data_prompt
from .schemas import Candidate, Discovery, Judge, Lookahead, Segment
from .store import dump

log = logging.getLogger(__name__)


def discover(ep, adapter):
    lines = [
        f"{e.id} | {e.type.lower()} | {e.start}-{e.end} | {e.speaker} | {e.text}"
        for e in ep.events
    ]
    d = adapter.generate_json(
        DISCOVERY,
        data_prompt(
            {"logline": ep.logline, "continuity": ep.continuity, "events": lines}
        ),
        Discovery,
        purpose="discovery",
    )
    ids = {e.id for e in ep.events}
    for item in d.hooks + d.endings:
        if item.event_id not in ids:
            log.warning("Dropping invalid discovery ID %s", item.event_id)
    for ending in d.endings:
        if ending.answer_event_id and ending.answer_event_id not in ids:
            log.warning("Dropping invalid answer ID %s", ending.answer_event_id)
            ending.answer_event_id = None
    d.hooks = [h for h in d.hooks if h.event_id in ids]
    d.endings = [e for e in d.endings if e.event_id in ids]
    return d


def overlap_events(ep, start, end):
    return sorted(
        [e for e in ep.events if e.start_cs < end and e.end_cs > start],
        key=lambda e: (e.start_cs, e.source_line),
    )


def segment(ep, start, end):
    starts = {e.start_cs: e.start for e in ep.events}
    ends = {e.end_cs: e.end for e in ep.events}
    return Segment(
        episode=ep.number,
        start_cs=start,
        end_cs=end,
        start=starts.get(start, ends.get(start, display(start))),
        end=ends.get(end, starts.get(end, display(end))),
        event_ids=[e.id for e in overlap_events(ep, start, end)],
    )


def make_candidate(segments, hook, ending):
    key = [
        [(s.episode, s.start_cs, s.end_cs) for s in segments],
        hook.event_id,
        ending.event_id,
    ]
    return Candidate(
        id=hashlib.sha256(dump(key).encode()).hexdigest()[:24],
        segments=segments,
        hook=hook,
        ending=ending,
    )


def validate_candidate(c, episodes, cfg):
    reasons, flags = [], []
    if (
        not cfg.MIN_PROMO_CS
        <= sum(s.end_cs - s.start_cs for s in c.segments)
        <= cfg.MAX_PROMO_CS
    ):
        reasons.append("duration_out_of_range")
    events = {e.id: e for ep in episodes.values() for e in ep.events}
    if c.hook.event_id not in events or c.ending.event_id not in events:
        reasons.append("invalid_event_id")
    if c.ending.answer_event_id and c.ending.answer_event_id not in events:
        reasons.append("invalid_answer_id")
    previous, hook_lands = None, None
    included, offset = set(), 0
    for s in c.segments:
        ep = episodes.get(s.episode)
        if ep is None:
            reasons.append("invalid_episode")
            continue
        if previous and (
            s.episode < previous.episode
            or (s.episode == previous.episode and s.start_cs < previous.end_cs)
        ):
            reasons.append("segments_out_of_order")
        previous = s
        if not 0 <= s.start_cs < s.end_cs <= ep.duration_cs:
            reasons.append("invalid_segment_bounds")
        boundaries = {t for e in ep.events for t in (e.start_cs, e.end_cs)}
        if s.start_cs not in boundaries or s.end_cs not in boundaries:
            reasons.append("unresolved_source_boundary")
        selected = overlap_events(ep, s.start_cs, s.end_cs)
        if s.event_ids != [e.id for e in selected]:
            reasons.append("invalid_event_ids")
        included.update(s.event_ids)
        scenes = {scene.id: scene for scene in ep.scenes}
        for e in selected:
            scene = scenes[e.scene]
            if (
                e.end_cs <= e.start_cs
                or e.start_cs < scene.start_cs
                or e.end_cs > scene.end_cs
                or scene.end_cs <= scene.start_cs
            ):
                reasons.append("invalid_source_event")
            if e.type == "DIALOGUE" and (
                e.start_cs < s.start_cs or e.end_cs > s.end_cs
            ):
                reasons.append("split_dialogue")
            if e.id == c.hook.event_id:
                onset = offset + max(0, e.start_cs - s.start_cs)
                hook_lands = (
                    offset + e.end_cs - s.start_cs if e.type == "DIALOGUE" else onset
                )
                if e.start_cs < s.start_cs or onset > cfg.HOOK_WINDOW_CS:
                    reasons.append("hook_outside_window")
                elif hook_lands > cfg.HOOK_WINDOW_CS:
                    flags.append("hook_timing_review")
                    reasons.append("hook_timing_unverified")
        answer = events.get(c.ending.answer_event_id)
        if answer and answer.episode == s.episode and s.end_cs >= answer.start_cs:
            reasons.append("answer_boundary_reached")
        offset += s.end_cs - s.start_cs
    if hook_lands is None:
        reasons.append("hook_not_in_cut")
    if c.ending.event_id not in included:
        reasons.append("ending_not_in_cut")
    return list(dict.fromkeys(reasons)), list(dict.fromkeys(flags))


def build_candidates(ep, discovery, cfg):
    events, candidates = {e.id: e for e in ep.events}, {}
    for hook in discovery.hooks:
        h = events.get(hook.event_id)
        if h is None:
            continue
        starts = {h.start_cs}
        cameras = [
            e
            for e in ep.events
            if e.type == "CAMERA" and 0 <= h.start_cs - e.start_cs <= cfg.HOOK_WINDOW_CS
        ]
        if cameras:
            starts.add(max(cameras, key=lambda e: e.start_cs).start_cs)
        starts.update(
            e.start_cs
            for e in ep.events
            if e.type == "DIALOGUE"
            and 0 <= h.start_cs - e.end_cs <= 200
            and h.start_cs - e.start_cs <= cfg.HOOK_WINDOW_CS
        )
        for ending in discovery.endings:
            end = events.get(ending.event_id)
            if end is None or end.start_cs <= h.start_cs:
                continue
            ends = {end.end_cs}
            shots = [
                e.end_cs
                for e in ep.events
                if e.type == "CAMERA" and e.end_cs > end.end_cs
            ]
            if shots:
                ends.add(min(shots))
            for start in sorted(starts):
                for stop in sorted(ends):
                    c = make_candidate([segment(ep, start, stop)], hook, ending)
                    reasons, c.flags = validate_candidate(c, {ep.number: ep}, cfg)
                    if reasons:
                        c.status, c.reject_reason = "rejected", reasons
                    candidates[c.id] = c
    result = list(candidates.values())
    pending = sorted(
        [c for c in result if c.status == "pending"],
        key=lambda c: (
            -c.hook.strength,
            abs(c.segments[0].end_cs - c.segments[0].start_cs - 4000),
            c.id,
        ),
    )
    for c in pending[cfg.MAX_CANDIDATES_PER_EPISODE :]:
        c.status, c.reject_reason = "rejected", ["candidate_budget_exceeded"]
    return result


def judge_payload(c, episodes):
    """Trust boundary: no Episode serialization, discovery notes, or retrieval."""
    playback, offset = [], 0
    for index, s in enumerate(c.segments):
        for e in overlap_events(episodes[s.episode], s.start_cs, s.end_cs):
            playback.append(
                {
                    "segment": index + 1,
                    "event_id": e.id,
                    "type": e.type,
                    "speaker": e.speaker,
                    "text": e.text,
                    "start": display(offset + max(s.start_cs, e.start_cs) - s.start_cs),
                    "end": display(offset + min(s.end_cs, e.end_cs) - s.start_cs),
                }
            )
        offset += s.end_cs - s.start_cs
    return {"playback_events": playback}


def judge_candidate(c, episodes, adapter, cfg):
    """Judge and immediate source lookahead only. No retrieval dependency is accepted."""
    reasons, flags = validate_candidate(c, episodes, cfg)
    c.flags = list(dict.fromkeys(c.flags + flags))
    if reasons:
        c.status, c.reject_reason = "rejected", reasons
        return c
    j = adapter.generate_json(
        JUDGE, data_prompt(judge_payload(c, episodes)), Judge, purpose="judge"
    )
    c.judge = j
    ids = {eid for s in c.segments for eid in s.event_ids}
    if any(
        getattr(j, k).evidence_event_id not in ids
        for k in ("hook", "clarity", "cliffhanger")
    ):
        reasons.append("invalid_judge_evidence")
    if j.hook.evidence_event_id != c.hook.event_id:
        reasons.append("hook_evidence_mismatch")
    for name in ("hook", "clarity", "cliffhanger"):
        if not getattr(j, name).passed:
            reasons.append(name + "_failed")
    last = c.segments[-1]
    ep = episodes[last.episode]
    final = overlap_events(ep, last.start_cs, last.end_cs)[-cfg.LOOKAHEAD_EVENTS :]
    following = sorted(
        [e for e in ep.events if e.start_cs >= last.end_cs],
        key=lambda e: (e.start_cs, e.source_line),
    )[: cfg.LOOKAHEAD_EVENTS]
    look = adapter.generate_json(
        LOOKAHEAD,
        data_prompt(
            {
                "open_question": j.cliffhanger.open_question,
                "final_cut_events": [{"event_id": e.id, "text": e.text} for e in final],
                "following_source_events": [
                    {"event_id": e.id, "text": e.text} for e in following
                ],
            }
        ),
        Lookahead,
        purpose="lookahead",
    )
    c.lookahead = look
    if look.answer_event_id and look.answer_event_id not in {
        e.id for e in final + following
    }:
        reasons.append("invalid_lookahead_evidence")
    if look.answered:
        reasons.append("cliffhanger_answered")
        if not look.answer_event_id:
            reasons.append("missing_lookahead_evidence")
    c.weighted = round(
        cfg.WEIGHT_HOOK * j.hook.score
        + cfg.WEIGHT_CLIFF * j.cliffhanger.score
        + cfg.WEIGHT_CLARITY * j.clarity.score,
        4,
    )
    c.status, c.reject_reason = ("rejected" if reasons else "eligible"), list(
        dict.fromkeys(reasons)
    )
    return c


def annotate_candidate(c, episodes, rag, analysis_id):
    """Separate optional retrieval phase; cannot alter pass/fail decisions."""
    if not c.judge:
        return c
    last = c.segments[-1]
    j = c.judge
    if rag:
        try:
            answer = rag.find_later_answer(
                analysis_id,
                j.cliffhanger.open_question,
                last.end_cs,
                episode=last.episode,
            )
            event = next(
                (e for ep in episodes.values() for e in ep.events if e.id == answer),
                None,
            )
            if event:
                c.answered_later = {
                    "event_id": event.id,
                    "episode": event.episode,
                    "description": f"answered later in episode {event.episode}",
                }
        except Exception:
            log.exception("Optional later-answer annotation failed")
            c.flags.append("later_answer_annotation_unavailable")
    return c


def repair_context(c, episodes, adapter, cfg, rag, aid):
    """Try a chronological earlier setup with its OWN hook, then rejudge all events."""
    if (
        not cfg.ENABLE_TWO_SEGMENT
        or not rag
        or not c.judge
        or not c.judge.clarity_missing_context
    ):
        return None
    if c.reject_reason != ["clarity_failed"] or len(c.segments) != 1:
        return None
    first = c.segments[0]
    ep = episodes[first.episode]
    ids = set(
        rag.find_setup_context(
            aid, c.ending.open_question, first.episode, first.start_cs
        )
    )
    earlier = [e for e in ep.events if e.id in ids and e.end_cs <= first.start_cs]
    windows = [
        (a, b) for a in earlier for b in earlier if 300 <= b.end_cs - a.start_cs <= 1500
    ]
    if not windows:
        return None
    a, b = max(windows, key=lambda pair: pair[1].end_cs)
    setup = segment(ep, a.start_cs, b.end_cs)
    d = discover(
        ep.model_copy(
            update={"events": overlap_events(ep, setup.start_cs, setup.end_cs)}
        ),
        adapter,
    )
    hooks = [
        h
        for h in d.hooks
        if next(e for e in ep.events if e.id == h.event_id).start_cs
        <= setup.start_cs + cfg.HOOK_WINDOW_CS
    ]
    if not hooks:
        return None
    repaired = make_candidate(
        [setup, first], max(hooks, key=lambda h: h.strength), c.ending
    )
    repaired.flags.append("context_repair")
    judge_candidate(repaired, episodes, adapter, cfg)
    return annotate_candidate(repaired, episodes, rag, aid)


def cache_key(ep, cfg):
    settings = asdict(cfg)
    for k in ("GEMINI_API_KEY", "DATA_DIR"):
        settings.pop(k)
    return hashlib.sha256(
        dump([ep.text_hash, PROMPT_VERSION, settings]).encode()
    ).hexdigest()


def analyze_episode(ep, adapter, cfg, store=None, analysis_id="", rag=None):
    key = cache_key(ep, cfg)
    cached = store.cache_get(key) if store else None
    if cached is not None:
        for c in cached:
            c.answered_later = None
            c.flags = list(dict.fromkeys(c.flags + ["episode_cache_hit"]))
        return cached
    d = discover(ep, adapter)
    if store:
        store.save_discovery(analysis_id, ep.number, d)
    candidates = build_candidates(ep, d, cfg)
    episodes = store.episodes(analysis_id) if store else {ep.number: ep}
    for c in list(candidates):
        if c.status == "pending":
            judge_candidate(c, episodes, adapter, cfg)
            annotate_candidate(c, episodes, rag, analysis_id)
            repaired = repair_context(c, episodes, adapter, cfg, rag, analysis_id)
            if repaired:
                candidates.append(repaired)
    if store:
        store.cache_put(key, candidates)
    return candidates


def iou(a, b):
    inter = sum(
        max(0, min(x.end_cs, y.end_cs) - max(x.start_cs, y.start_cs))
        for x in a.segments
        for y in b.segments
        if x.episode == y.episode
    )
    union = sum(s.end_cs - s.start_cs for s in a.segments + b.segments) - inter
    return inter / union if union else 0


def promo_card(c, rank, episodes):
    offset, lands = 0, 0
    for s in c.segments:
        for e in episodes[s.episode].events:
            if e.id == c.hook.event_id and e.id in s.event_ids:
                lands = (
                    offset
                    + (e.end_cs if e.type == "DIALOGUE" else e.start_cs)
                    - s.start_cs
                )
        offset += s.end_cs - s.start_cs
    j = c.judge
    return {
        "rank": rank,
        "segments": [s.model_dump() for s in c.segments],
        "total_seconds": offset / 100,
        "hook": {
            "event_id": c.hook.event_id,
            "description": c.hook.what_audience_learns_or_sees,
            "lands_at_seconds": lands / 100,
        },
        "cliffhanger": {
            "event_id": c.ending.event_id,
            "open_question": j.cliffhanger.open_question,
        },
        "why_it_works": j.viewer_summary,
        "scores": {
            "hook": j.hook.score,
            "cliffhanger": j.cliffhanger.score,
            "clarity": j.clarity.score,
            "weighted": c.weighted,
        },
        "evidence": {
            k: getattr(j, k).evidence_event_id
            for k in ("hook", "clarity", "cliffhanger")
        },
        "flags": c.flags,
        "answered_later": c.answered_later,
    }


def rank_show(candidates, episodes, cfg):
    selected = []
    for c in sorted(candidates, key=lambda c: (-c.weighted, c.id)):
        if (
            c.status not in ("eligible", "deduplicated")
            or not c.judge
            or c.reject_reason
        ):
            continue
        if (
            not all(
                getattr(c.judge, k).passed for k in ("hook", "clarity", "cliffhanger")
            )
            or not c.lookahead
            or c.lookahead.answered
        ):
            continue
        reasons, _ = validate_candidate(c, episodes, cfg)
        if reasons:
            c.status, c.reject_reason = "rejected", reasons
            continue
        if any(
            c.ending.event_id == p.ending.event_id and iou(c, p) > cfg.OVERLAP_IOU
            for p in selected
        ):
            c.status = "deduplicated"
            continue
        c.status = "eligible"
        selected.append(c)
    return [
        promo_card(c, i + 1, episodes) for i, c in enumerate(selected[: cfg.MAX_PROMOS])
    ]


def parse_analysis(store, aid, cfg):
    try:
        result = parse_zip(store.analysis(aid)["zip_path"], cfg)
        store.save_parse(aid, result)
        return {"episodes": len(result.episodes), "files": result.files_received}
    except Exception as exc:
        store.update_analysis(aid, status="failed", error=str(exc), stage="Failed")
        raise


def finalize_analysis(store, aid, cfg, rag=None):
    episodes, candidates = store.episodes(aid), store.candidates(aid)
    failed = {r["number"] for r in store.episode_rows(aid) if r["status"] == "failed"}
    for c in candidates:
        if any(s.episode in failed for s in c.segments):
            c.status = "rejected"
            c.reject_reason = list(dict.fromkeys(c.reject_reason + ["episode_failed"]))
    cards = rank_show(candidates, episodes, cfg)
    store.save_candidates(aid, candidates)
    analysis = store.analysis(aid)
    parsed = json.loads(analysis["parse_report"] or "{}")
    rows = store.episode_rows(aid)
    failures = [
        {"filename": r["filename"], "errors": r["errors"]}
        for r in parsed.get("reports", [])
        if r["errors"]
    ]
    failures += [
        {"filename": episodes[r["number"]].source_filename, "errors": [r["error"]]}
        for r in rows
        if r["status"] == "failed"
    ]
    calls = store.calls(aid)
    from datetime import datetime, timezone

    runtime = (
        datetime.now(timezone.utc) - datetime.fromisoformat(analysis["created_at"])
    ).total_seconds()
    report = {
        "files_received": parsed.get("files_received", 0),
        "episodes_parsed": len(episodes),
        "episodes_analyzed": sum(r["status"] == "complete" for r in rows),
        "episodes_failed": sum(r["status"] == "failed" for r in rows),
        "failures": failures,
        "parse_reports": parsed.get("reports", []),
        "candidates_generated": len(candidates),
        "candidates_rejected": sum(c.status == "rejected" for c in candidates),
        "rejected_by_reason": dict(
            Counter(r for c in candidates for r in c.reject_reason)
        ),
        "candidates_eligible": sum(
            c.status in ("eligible", "deduplicated") for c in candidates
        ),
        "deduplicated": sum(c.status == "deduplicated" for c in candidates),
        "promos_returned": len(cards),
        "model_calls": len(calls),
        "tokens_in": sum(c["tokens_in"] for c in calls),
        "tokens_out": sum(c["tokens_out"] for c in calls),
        "runtime_seconds": round(runtime, 3),
        "model_ids": {
            "discovery": cfg.GEMINI_MODEL,
            "judge": cfg.GEMINI_JUDGE_MODEL,
            "embedding": cfg.EMBED_MODEL,
        },
        "prompt_version": PROMPT_VERSION,
    }
    results = {
        "promos": cards,
        "run_report": report,
        "rejected": [
            c.model_dump(by_alias=True)
            for c in candidates
            if c.status in ("rejected", "deduplicated")
        ],
    }
    store.save_results(aid, results)
    artifact_error = None
    if rag:
        try:
            rag.index_artifacts(aid)
        except Exception as exc:
            log.exception("Artifact index unavailable; preserving completed analysis")
            artifact_error = str(exc)
            report["artifact_index_error"] = artifact_error
            store.save_results(aid, results)
    status = "partial" if failures or artifact_error else "complete"
    if not report["episodes_analyzed"]:
        status = "failed"
    store.update_analysis(
        aid, status=status, stage="Complete" if status != "failed" else "Failed"
    )
    return {"status": status, "promos": len(cards)}
