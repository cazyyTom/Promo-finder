"""Analysis-scoped retrieval for setup, annotations, and artifact chat; NEVER judging.

The events collection contains screenplay blocks only. Artifacts are kept separate.
Metadata filtering happens in SQLite before cosine similarity is calculated.
"""

import hashlib
import json
from typing import Protocol
import numpy as np
from .model import LATER_ANSWER, CHAT_RANKING, data_prompt
from .schemas import Answer, ChatAnswer, PromoError
from .store import dump


class VectorStore(Protocol):
    def replace_vectors(self, aid, collection, episode, rows): ...
    def vector_rows(self, aid, collection, filters): ...
    def embedding_get(self, key): ...
    def embedding_put(self, key, vector): ...


def chunk_episode(episode):
    chunks = []
    for i in range(0, len(episode.events), 4):
        events = episode.events[i : i + 8]
        if not events:
            break
        chunks.append(
            {
                "id": f"E{episode.number:03d}-W{i:04d}",
                "episode": episode.number,
                "start_cs": min(e.start_cs for e in events),
                "end_cs": max(e.end_cs for e in events),
                "event_ids": [e.id for e in events],
                "text": "\n".join(
                    f"{e.id} [{e.start}-{e.end}] {e.type.lower()} {e.speaker}: {e.text}"
                    for e in events
                ),
            }
        )
    return chunks


def normalize(vector):
    v = np.asarray(vector, dtype=np.float32)
    if v.ndim != 1 or not v.size or not np.isfinite(v).all() or np.linalg.norm(v) == 0:
        raise ValueError("Invalid embedding vector")
    return v / np.linalg.norm(v)


class RAG:
    def __init__(
        self, store, adapter, settings, vector_store: VectorStore | None = None
    ):
        self.store, self.adapter, self.cfg = store, adapter, settings
        self.vectors = vector_store or store

    def embeddings(self, texts, role):
        vectors = [None] * len(texts)
        missing = {}
        for i, text in enumerate(texts):
            # Include style to invalidate when the document/query encoding changes.
            key = hashlib.sha256(
                dump(
                    [text, self.cfg.EMBED_MODEL, role, self.cfg.EMBED_TASK_STYLE]
                ).encode()
            ).hexdigest()
            cached = self.vectors.embedding_get(key)
            if cached is not None:
                vectors[i] = np.frombuffer(cached, dtype=np.float32)
            else:
                missing.setdefault(key, {"text": text, "indices": []})[
                    "indices"
                ].append(i)
        items = list(missing.items())
        for start in range(0, len(items), self.cfg.EMBED_BATCH_SIZE):
            batch = items[start : start + self.cfg.EMBED_BATCH_SIZE]
            embedded = self.adapter.embed([v["text"] for _, v in batch], role)
            if len(embedded) != len(batch):
                raise ValueError("Embedding count mismatch")
            for (key, item), vector in zip(batch, embedded):
                v = normalize(vector)
                self.vectors.embedding_put(key, v.tobytes())
                for i in item["indices"]:
                    vectors[i] = v
        return vectors

    def _index(self, aid, collection, chunks, episode=None):
        vectors = self.embeddings([c["text"] for c in chunks], "document")
        rows = [
            (
                aid,
                collection,
                c["id"],
                c["episode"],
                c["start_cs"],
                c["end_cs"],
                dump(c["event_ids"]),
                c["text"],
                v.tobytes(),
            )
            for c, v in zip(chunks, vectors)
        ]
        # Atomic replacement after embeddings succeed: retries cannot leave half an index.
        self.vectors.replace_vectors(aid, collection, episode, rows)
        return len(rows)

    def index_episode(self, analysis_id, episode):
        return self._index(
            analysis_id, "events", chunk_episode(episode), episode.number
        )

    def retrieve(self, analysis_id, query, k=5, filters=None):
        filters = dict(filters or {})
        collection = filters.pop("collection", "events")
        if collection not in ("events", "artifacts"):
            raise ValueError("Unknown collection")
        if k <= 0:
            return []
        rows = self.vectors.vector_rows(analysis_id, collection, filters)
        if not rows:
            return []
        query_vector = self.embeddings([query], "query")[0]
        result = []
        for row in rows:
            vector = np.frombuffer(row.pop("embedding"), dtype=np.float32)
            if vector.shape != query_vector.shape:
                raise ValueError(
                    "Embedding dimension changed; reindex with the configured model"
                )
            row["similarity"] = float(np.dot(query_vector, vector))
            row["event_ids"] = json.loads(row.pop("event_ids_json"))
            result.append(row)
        return sorted(result, key=lambda r: (-r["similarity"], r["chunk_id"]))[:k]

    def find_setup_context(self, analysis_id, open_question, episode, before_cs):
        rows = self.retrieve(
            analysis_id,
            open_question,
            5,
            {
                "episode_min": episode,
                "episode_max": episode,
                "start_before_cs": before_cs,
            },
        )
        # Check individual source events as well, not only the enclosing chunk metadata.
        allowed = {
            e.id
            for e in self.store.episode(analysis_id, episode).events
            if e.end_cs <= before_cs
        }
        return list(
            dict.fromkeys(eid for r in rows for eid in r["event_ids"] if eid in allowed)
        )

    def find_later_answer(self, analysis_id, open_question, after_cs, episode=None):
        # Time has meaning only within an episode. Callers supply episode; if absent,
        # search each episode independently, interpreting after_cs within each episode.
        episodes = self.store.episodes(analysis_id)
        rows = []
        for number in episodes:
            if episode is not None and number < episode:
                continue
            filters = {"episode_min": number, "episode_max": number}
            if episode is None or number == episode:
                filters["after_cs"] = after_cs
            rows.extend(self.retrieve(analysis_id, open_question, 3, filters))
        ids = {eid for r in rows for eid in r["event_ids"]}
        events = [
            e
            for ep in episodes.values()
            for e in ep.events
            if e.id in ids
            and (episode is not None and e.episode > episode or e.start_cs >= after_cs)
        ]
        if not events:
            return None
        result = self.adapter.generate_json(
            LATER_ANSWER,
            data_prompt(
                {
                    "open_question": open_question,
                    "later_events": [
                        {"event_id": e.id, "text": e.text} for e in events
                    ],
                }
            ),
            Answer,
            purpose="later_answer",
        )
        return (
            result.answer_event_id
            if result.answer_event_id in {e.id for e in events}
            else None
        )

    def index_artifacts(self, analysis_id):
        analysis = self.store.analysis(analysis_id)
        results = json.loads(analysis["results"] or "{}")
        chunks = []
        for card in results.get("promos", []):
            chunks.append(
                {
                    "id": f"rank:{card['rank']}",
                    "episode": card["segments"][0]["episode"],
                    "start_cs": 0,
                    "end_cs": 0,
                    "event_ids": [
                        eid for s in card["segments"] for eid in s["event_ids"]
                    ],
                    "text": dump(card),
                }
            )
        for c in self.store.candidates(analysis_id):
            chunks.append(
                {
                    "id": f"candidate:{c.id}",
                    "episode": c.segments[0].episode,
                    "start_cs": 0,
                    "end_cs": 0,
                    "event_ids": [eid for s in c.segments for eid in s.event_ids],
                    "text": dump(
                        {
                            "candidate_id": c.id,
                            "status": c.status,
                            "reasons": c.reject_reason,
                            "judge": (
                                c.judge.model_dump(by_alias=True) if c.judge else None
                            ),
                        }
                    ),
                }
            )
        return self._index(analysis_id, "artifacts", chunks)

    def answer_ranking_question(self, analysis_id, question):
        if not self.store.analysis(analysis_id)["results"]:
            raise PromoError("not_ready", "Results are not ready", 409)
        rows = self.retrieve(analysis_id, question, 8, {"collection": "artifacts"})
        # Explicitly named ranks must not be lost to semantic top-k retrieval.
        import re

        requested = {
            f"rank:{n}" for n in re.findall(r"(?:#|rank\s*:?\s*)(\d+)", question, re.I)
        }
        for row in self.vectors.vector_rows(analysis_id, "artifacts", {}):
            if row["chunk_id"] in requested and row["chunk_id"] not in {
                r["chunk_id"] for r in rows
            }:
                row.pop("embedding")
                row["event_ids"] = json.loads(row.pop("event_ids_json"))
                rows.append(row)
        if not rows:
            return ChatAnswer(
                answer="No stored promo or rejection artifacts support an answer yet.",
                citations=[],
            )
        answer = self.adapter.generate_json(
            CHAT_RANKING,
            data_prompt(
                {
                    "question": question,
                    "artifacts": [
                        {"citation": r["chunk_id"], "text": r["text"]} for r in rows
                    ],
                }
            ),
            ChatAnswer,
            purpose="chat",
        )
        allowed = {r["chunk_id"] for r in rows if r["chunk_id"].startswith("rank:")}
        allowed.update(eid for r in rows for eid in r["event_ids"])
        if not answer.citations or not set(answer.citations) <= allowed:
            raise PromoError(
                "invalid_chat_citations",
                "The model did not cite valid supplied artifacts",
                502,
            )
        return answer
