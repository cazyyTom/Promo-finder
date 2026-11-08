"""Run `python -m examples.offline_demo` for explicitly mocked, credential-free output.

The synthetic adapter deliberately returns fixed judgments; this is a wiring demo,
not a semantic evaluation of the screenplay or of any real model's performance.
"""

import asyncio
import json
from pathlib import Path
import re
import tempfile
from backend.config import Settings
from backend.run import run_local, export_results
from backend.schemas import Discovery, Judge, Lookahead, Answer, ChatAnswer
from backend.store import Store
from .make_synthetic import make_zip


class DemoAdapter:
    def __init__(self, cfg, store, aid):
        self.store, self.aid = store, aid

    def generate_json(
        self, system, prompt, schema, temperature=0.1, purpose="discovery"
    ):
        data = json.loads(prompt.split("\n", 1)[1].rsplit("\n", 1)[0])
        prefix_match = re.search(r"E\d{3}", str(data))
        prefix = prefix_match.group() if prefix_match else "E001"
        if schema is Discovery:
            value = {
                "hooks": [
                    {
                        "event_id": prefix + "-B004",
                        "strength": 5,
                        "what_audience_learns_or_sees": "The judge ordered the murder.",
                    }
                ],
                "endings": [
                    {
                        "event_id": prefix + "-B011",
                        "open_question": "Why is the sister with the judge?",
                        "answer_event_id": None,
                    }
                ],
            }
        elif schema is Judge:
            criterion = {
                "pass": True,
                "score": 5,
                "evidence_event_id": prefix + "-B004",
                "reason": "Fixed mock verdict for wiring verification.",
            }
            value = {
                "hook": criterion,
                "clarity": {**criterion, "score": 4},
                "cliffhanger": {
                    **criterion,
                    "evidence_event_id": prefix + "-B011",
                    "open_question": "Why is the sister with the judge?",
                },
                "viewer_summary": "A woman exposes a judge who threatens her family.",
            }
        elif schema is Lookahead:
            value = {
                "answered": False,
                "answer_event_id": None,
                "reason": "Fixed mock; not a narrative assessment.",
            }
        elif schema is Answer:
            value = {
                "answer_event_id": None,
                "reason": "Annotation disabled in the mock.",
            }
        elif schema is ChatAnswer:
            value = {"answer": "Mock explanation only.", "citations": ["rank:1"]}
        else:
            raise ValueError(schema)
        raw = json.dumps(value)
        self.store.log_call(self.aid, purpose, "mock-no-network", 0, 0, 0, True, raw)
        return schema.model_validate_json(raw)

    def embed(self, texts, role):
        vectors = [[1.0, 0.5, 0.2] for _ in texts]
        self.store.log_call(
            self.aid,
            "embed_" + role,
            "mock-no-network",
            0,
            0,
            0,
            True,
            json.dumps({"vectors": vectors}),
        )
        return vectors


def main():
    with tempfile.TemporaryDirectory() as temp:
        cfg = Settings(
            DATA_DIR=temp, GEMINI_MODEL="mock-no-network", EMBED_MODEL="mock-no-network"
        )
        store = Store(cfg.db_path)
        aid = store.create_analysis(make_zip(Path(temp) / "show.zip"))
        asyncio.run(run_local(store, aid, cfg, DemoAdapter))
        results = export_results(store, aid, Path(__file__).parent / "mock-output")
        print(
            f"Mock run: {results['run_report']['episodes_analyzed']} episodes, {len(results['promos'])} promos"
        )


if __name__ == "__main__":
    main()
