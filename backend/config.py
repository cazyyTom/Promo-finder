"""Environment-only configuration; model identifiers deliberately have no defaults."""

from dataclasses import dataclass, fields
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = ""
    GEMINI_JUDGE_MODEL: str = ""
    EMBED_MODEL: str = ""
    EMBED_TASK_STYLE: str = "task_type"
    MODEL_PROVIDER: str = "gemini"
    DATA_DIR: str = "./data"
    MAX_UPLOAD_MB: int = 25
    MAX_FILES: int = 200
    MAX_UNCOMPRESSED_MB: int = 50
    MAX_COMPRESSION_RATIO: int = 200
    MIN_PROMO_CS: int = 2000
    MAX_PROMO_CS: int = 6000
    HOOK_WINDOW_CS: int = 300
    WEIGHT_HOOK: float = 0.40
    WEIGHT_CLIFF: float = 0.35
    WEIGHT_CLARITY: float = 0.25
    MAX_PROMOS: int = 10
    OVERLAP_IOU: float = 0.5
    LOOKAHEAD_EVENTS: int = 8
    MAX_CANDIDATES_PER_EPISODE: int = 12
    ENABLE_TWO_SEGMENT: bool = False
    MODEL_CONCURRENCY: int = 2
    MODEL_MAX_RETRIES: int = 3
    EMBED_BATCH_SIZE: int = 32
    INNGEST_APP_ID: str = "promo-finder"

    def __post_init__(self):
        if not self.GEMINI_JUDGE_MODEL:
            object.__setattr__(self, "GEMINI_JUDGE_MODEL", self.GEMINI_MODEL)
        for name in (
            "MAX_UPLOAD_MB",
            "MAX_FILES",
            "MAX_UNCOMPRESSED_MB",
            "MODEL_CONCURRENCY",
            "MAX_CANDIDATES_PER_EPISODE",
            "EMBED_BATCH_SIZE",
            "MAX_PROMOS",
            "LOOKAHEAD_EVENTS",
            "HOOK_WINDOW_CS",
            "MAX_COMPRESSION_RATIO",
        ):
            if getattr(self, name) <= 0:
                raise ValueError(f"{name} must be positive")
        if not 0 < self.MIN_PROMO_CS <= self.MAX_PROMO_CS:
            raise ValueError("Invalid duration limits")
        if self.EMBED_TASK_STYLE not in ("prefix", "task_type"):
            raise ValueError("EMBED_TASK_STYLE must be prefix or task_type")
        weights = (self.WEIGHT_HOOK, self.WEIGHT_CLIFF, self.WEIGHT_CLARITY)
        if min(weights) < 0 or abs(sum(weights) - 1) > 1e-6:
            raise ValueError("Ranking weights must be nonnegative and sum to one")
        if not 0 <= self.OVERLAP_IOU <= 1:
            raise ValueError("OVERLAP_IOU must be between zero and one")

    @property
    def db_path(self) -> Path:
        return Path(self.DATA_DIR) / "promo.sqlite3"

    @classmethod
    def from_env(cls):
        values = {}
        for f in fields(cls):
            if f.name in os.environ:
                raw = os.environ[f.name]
                if f.type is bool:
                    if raw.lower() not in ("1", "0", "true", "false", "yes", "no"):
                        raise ValueError(f"Invalid boolean {f.name}")
                    values[f.name] = raw.lower() in ("1", "true", "yes")
                else:
                    values[f.name] = f.type(raw)
        return cls(**values)
