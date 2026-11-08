"""HTTP boundary. Run uvicorn backend.app:app; core modules are framework-free."""

import asyncio
import json
from pathlib import Path
import uuid
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
import inngest
import inngest.fast_api
from .config import Settings
from .ingest import read_zip
from .model import get_adapter
from .rag import RAG
from .run import csv_results
from .schemas import (
    PromoError,
    AnalysisCreated,
    AnalysisStatus,
    ChatRequest,
    ChatAnswer,
    ErrorResponse,
)
from .store import Store
from .workflows import client, functions
import logging


def create_app(settings=None, event_client=None):
    cfg = settings or Settings.from_env()
    store = Store(cfg.db_path)
    sender = event_client or client
    app = FastAPI(title="Promo Finder", version="1.0.0")
    app.state.store = store
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    logging.basicConfig(level=logging.INFO)

    @app.exception_handler(PromoError)
    async def typed_error(request, exc):
        return JSONResponse(
            status_code=exc.status, content={"code": exc.code, "message": exc.message}
        )

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post(
        "/analyses",
        response_model=AnalysisCreated,
        status_code=202,
        responses={
            400: {"model": ErrorResponse},
            413: {"model": ErrorResponse},
            503: {"model": ErrorResponse},
        },
    )
    async def upload(file: UploadFile = File(...)):
        data = bytearray()
        try:
            while chunk := await file.read(1024 * 1024):
                data.extend(chunk)
                if len(data) > cfg.MAX_UPLOAD_MB * 1024**2:
                    raise PromoError(
                        "upload_too_large", "ZIP exceeds upload size limit", 413
                    )
            scripts = await asyncio.to_thread(read_zip, bytes(data), cfg)
        finally:
            await file.close()
        path = Path(cfg.DATA_DIR) / "uploads" / (uuid.uuid4().hex + ".zip")
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)
        aid = store.create_analysis(path, {"files_received": len(scripts)})
        try:
            await sender.send(
                inngest.Event(
                    name="promo/analysis.requested",
                    data={"analysis_id": aid},
                    id=f"{aid}:requested",
                )
            )
        except Exception as exc:
            logging.getLogger("uvicorn.error").exception(
                "Failed to dispatch analysis %s to Inngest", aid
            )
            store.update_analysis(
                aid,
                status="failed",
                stage="Failed",
                error="Could not dispatch analysis",
            )
            raise PromoError(
                "dispatch_failed",
                f"Could not schedule analysis {aid}; check Inngest connectivity",
                503,
            ) from exc
        return AnalysisCreated(analysis_id=aid)

    @app.get("/analyses/{aid}", response_model=AnalysisStatus)
    def status(aid: str):
        a = store.analysis(aid)
        rows = store.episode_rows(aid)
        parsed = json.loads(a["parse_report"] or "{}")
        params = json.loads(a["params"])
        completed = sum(r["status"] == "complete" for r in rows)
        failed = sum(r["status"] == "failed" for r in rows)
        errors = [
            {"filename": r["filename"], "errors": r["errors"]}
            for r in parsed.get("reports", [])
            if r["errors"]
        ]
        errors += [
            {"episode": r["number"], "error": r["error"]} for r in rows if r["error"]
        ]
        if a["error"]:
            errors.append({"error": a["error"]})
        stage = a["stage"]
        if a["status"] == "analyzing":
            stage = (
                "Indexing"
                if rows and all(r["status"] in ("pending", "indexing") for r in rows)
                else f"Analyzing {completed+failed} of {len(rows)}"
            )
        return AnalysisStatus(
            status=a["status"],
            files_received=parsed.get(
                "files_received", params.get("files_received", 0)
            ),
            episodes_parsed=len(rows),
            episodes_analyzed=completed,
            episodes_failed=failed,
            stage=stage,
            errors=errors,
        )

    @app.get("/analyses/{aid}/results")
    def results(aid: str, format: str = "json"):
        a = store.analysis(aid)
        if not a["results"] or a["status"] not in ("complete", "partial", "failed"):
            raise PromoError("not_ready", "Results are not ready", 409)
        result = json.loads(a["results"])
        if format == "csv":
            return Response(
                csv_results(result["promos"]),
                media_type="text/csv",
                headers={"Content-Disposition": 'attachment; filename="promos.csv"'},
            )
        if format != "json":
            raise PromoError("invalid_format", "format must be json or csv")
        return result

    @app.post("/analyses/{aid}/chat", response_model=ChatAnswer)
    def chat(aid: str, request: ChatRequest):
        a = store.analysis(aid)
        if a["status"] not in ("complete", "partial"):
            raise PromoError("not_ready", "Wait for completed results", 409)
        return RAG(store, get_adapter(cfg, store, aid), cfg).answer_ranking_question(
            aid, request.question
        )

    inngest.fast_api.serve(app, client, functions)
    return app


app = create_app()
