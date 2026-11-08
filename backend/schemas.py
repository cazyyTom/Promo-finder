"""Validated source, model, and API contracts. All source arithmetic is centiseconds."""

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class PromoError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


class Event(Strict):
    id: str
    episode: int
    scene: str
    type: Literal["CAMERA", "ACTION", "SOUND FX", "DIALOGUE"]
    speaker: str = ""
    qualifiers: list[str] = Field(default_factory=list)
    start_cs: int
    end_cs: int
    start: str
    end: str
    text: str
    source_filename: str
    source_line: int


class Scene(Strict):
    id: str
    heading: str
    start_cs: int
    end_cs: int


class ParseReport(Strict):
    filename: str
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class Episode(Strict):
    number: int
    logline: str
    continuity: str
    duration_cs: int
    scenes: list[Scene]
    events: list[Event]
    source_filename: str
    text_hash: str
    report: ParseReport


class ParseResult(Strict):
    episodes: list[Episode]
    reports: list[ParseReport]
    files_received: int


class Hook(Strict):
    event_id: str
    what_audience_learns_or_sees: str
    strength: int = Field(ge=1, le=5)


class Ending(Strict):
    event_id: str
    open_question: str
    answer_event_id: str | None = None


class Discovery(Strict):
    hooks: list[Hook] = Field(max_length=24)
    endings: list[Ending] = Field(max_length=24)


class Criterion(Strict):
    passed: bool = Field(alias="pass")
    score: int = Field(ge=1, le=5)
    evidence_event_id: str
    reason: str


class CliffCriterion(Criterion):
    open_question: str


class Judge(Strict):
    hook: Criterion
    clarity: Criterion
    cliffhanger: CliffCriterion
    viewer_summary: str
    clarity_missing_context: bool = False


class Lookahead(Strict):
    answered: bool
    answer_event_id: str | None = None
    reason: str


class Answer(Strict):
    answer_event_id: str | None = None
    reason: str


class ChatAnswer(Strict):
    answer: str
    citations: list[str]


class Segment(Strict):
    episode: int
    start_cs: int
    end_cs: int
    event_ids: list[str]
    start: str = ""
    end: str = ""


class Candidate(Strict):
    id: str
    segments: list[Segment]
    hook: Hook
    ending: Ending
    status: Literal["pending", "eligible", "rejected", "deduplicated"] = "pending"
    reject_reason: list[str] = Field(default_factory=list)
    flags: list[str] = Field(default_factory=list)
    judge: Judge | None = None
    lookahead: Lookahead | None = None
    weighted: float = 0
    answered_later: dict | None = None


class AnalysisCreated(Strict):
    analysis_id: str


class AnalysisStatus(Strict):
    status: str
    files_received: int
    episodes_parsed: int
    episodes_analyzed: int
    episodes_failed: int
    stage: str
    errors: list[dict]


class ChatRequest(Strict):
    question: str = Field(min_length=1, max_length=4000)


class ErrorResponse(Strict):
    code: str
    message: str
