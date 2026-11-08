"""Bounded, non-extracting ZIP ingestion and a line-preserving screenplay parser."""

import hashlib
import io
import logging
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile
from .config import Settings
from .schemas import Episode, Event, Scene, ParseReport, ParseResult, PromoError

log = logging.getLogger(__name__)
TIME = r"\d{2,}:\d{2}\.\d{2}"
BLOCK = re.compile(r"^\s*\*\*(.+?):\*\*\s*$")
TIMES = re.compile(rf"^Start:\s*\(({TIME})\)\s*\|\s*End:\s*\(({TIME})\)\s*$")


def to_cs(value: str) -> int:
    if not re.fullmatch(TIME, value):
        raise ValueError(f"Invalid timestamp: {value}")
    minutes, rest = value.split(":")
    seconds, hundredths = rest.split(".")
    if int(seconds) >= 60:
        raise ValueError(f"Invalid seconds: {value}")
    return int(minutes) * 6000 + int(seconds) * 100 + int(hundredths)


def display(cs: int) -> str:
    return f"{cs // 6000:02d}:{cs % 6000 // 100:02d}.{cs % 100:02d}"


def _read_zip(data, cfg):
    if isinstance(data, (str, Path)):
        if Path(data).stat().st_size > cfg.MAX_UPLOAD_MB * 1024**2:
            raise PromoError("upload_too_large", "ZIP exceeds upload size limit", 413)
        data = Path(data).read_bytes()
    if len(data) > cfg.MAX_UPLOAD_MB * 1024**2:
        raise PromoError("upload_too_large", "ZIP exceeds upload size limit", 413)
    scripts, notes = [], {}
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = archive.infolist()
            total = sum(i.file_size for i in infos)
            if total > cfg.MAX_UNCOMPRESSED_MB * 1024**2:
                raise PromoError(
                    "uncompressed_too_large", "ZIP expanded size exceeds limit", 413
                )
            names = set()
            selected = []
            for info in infos:
                name = info.filename.replace("\\", "/")
                parts = PurePosixPath(name).parts
                if (
                    name.startswith("/")
                    or ".." in parts
                    or re.match(r"^[A-Za-z]:", name)
                ):
                    raise PromoError("unsafe_zip_path", f"Unsafe ZIP member: {name}")
                if stat.S_ISLNK(info.external_attr >> 16):
                    raise PromoError(
                        "unsafe_zip_path", "ZIP symlinks are not supported"
                    )
                if (
                    info.is_dir()
                    or "__MACOSX" in parts
                    or any(p.startswith(".") for p in parts)
                ):
                    continue
                if not name.lower().endswith(".txt"):
                    continue
                if name in names:
                    raise PromoError(
                        "duplicate_zip_member", f"Duplicate ZIP filename: {name}"
                    )
                names.add(name)
                if (
                    info.file_size / max(1, info.compress_size)
                    > cfg.MAX_COMPRESSION_RATIO
                ):
                    raise PromoError(
                        "suspicious_compression",
                        f"Suspicious compression ratio: {name}",
                        413,
                    )
                selected.append(info)
            if len(selected) > cfg.MAX_FILES:
                raise PromoError("too_many_files", "Too many screenplay files", 413)
            for info in selected:
                raw = archive.read(info)
                try:
                    text = raw.decode("utf-8-sig")
                except UnicodeDecodeError:
                    text = raw.decode("latin-1")
                    notes[info.filename] = ["Decoded using latin-1 fallback"]
                    log.warning("latin-1 fallback: %s", info.filename)
                scripts.append((info.filename, text))
    except (
        zipfile.BadZipFile,
        RuntimeError,
        NotImplementedError,
        OSError,
        EOFError,
    ) as exc:
        raise PromoError("invalid_zip", f"Unreadable ZIP: {exc}") from exc
    if not scripts:
        raise PromoError("no_scripts", "ZIP contains no readable .txt scripts")
    return scripts, notes


def read_zip(bytes_or_path, settings: Settings | None = None) -> list[tuple[str, str]]:
    return _read_zip(bytes_or_path, settings or Settings.from_env())[0]


def parse_episode(filename: str, text: str) -> Episode:
    report = ParseReport(filename=filename)

    def header(name):
        m = re.search(rf"^{name}:[ \t]*([^\n\r]*)", text, re.M)
        return m.group(1).strip() if m else ""

    number_match = re.fullmatch(r"(?:Episode\s+)?(\d+)", header("EPISODE NUMBER"), re.I)
    if not number_match:
        raise PromoError("parse_error", "Missing or invalid EPISODE NUMBER header")
    number = int(number_match.group(1))
    if number < 1:
        raise PromoError("parse_error", "Episode number must be positive")
    file_match = re.search(r"episode[-_ ]*(\d+)", Path(filename).name, re.I)
    if file_match and int(file_match.group(1)) != number:
        report.warnings.append(
            "Filename episode number differs from header; header wins"
        )
    lines = text.splitlines()
    try:
        begin = next(
            i for i, s in enumerate(lines) if s.strip() == "--- SCRIPT START ---"
        )
        finish = next(
            i
            for i, s in enumerate(lines)
            if i > begin and s.strip() == "--- SCRIPT END ---"
        )
    except StopIteration as exc:
        raise PromoError("parse_error", "Missing script delimiters") from exc
    scenes, events = [], []
    scene = None
    order = 0
    i = begin + 1
    while i < finish:
        line = lines[i].strip()
        if re.fullmatch(r"SCENE\s+\S+", line):
            try:
                heading = re.split(
                    r"scene\s+heading\s*:", lines[i + 1],
                    maxsplit=1, flags=re.IGNORECASE,
                )[1].strip()
                start = to_cs(re.split(
                    r"scene\s+start\s*:", lines[i + 2],
                    maxsplit=1, flags=re.IGNORECASE,
                )[1].strip())
                end = to_cs(re.split(
                    r"scene\s+end\s*:", lines[i + 3],
                    maxsplit=1, flags=re.IGNORECASE,
                )[1].strip())
                scene = Scene(id=line, heading=heading, start_cs=start, end_cs=end)
                scenes.append(scene)
                if end <= start:
                    report.warnings.append(f"Line {i+1}: scene end must exceed start")
                i += 4
                continue
            except (IndexError, ValueError) as exc:
                raise PromoError(
                    "parse_error", f"Malformed scene at line {i+1}"
                ) from exc
        match = BLOCK.match(line)
        if match:
            order += 1
            source_line = i + 1
            j = i + 1
            time_match = TIMES.match(lines[j].strip()) if j < finish else None
            if not time_match or scene is None:
                raise PromoError(
                    "parse_error", f"Malformed block at line {source_line}"
                )
            try:
                start, end = map(to_cs, time_match.groups())
            except ValueError as exc:
                raise PromoError("parse_error", f"Line {source_line}: {exc}") from exc
            j += 1
            content = []
            while (
                j < finish
                and not BLOCK.match(lines[j])
                and not re.fullmatch(r"SCENE\s+\S+", lines[j].strip())
            ):
                content.append(lines[j])
                j += 1
            label = match.group(1).strip()
            kind = label if label in ("CAMERA", "ACTION", "SOUND FX") else "DIALOGUE"
            body = "\n".join(content).strip()
            if (
                kind == "DIALOGUE"
                and len(body) > 1
                and (body[0], body[-1]) in [('"', '"'), ("“", "”"), ("'", "'")]
            ):
                body = body[1:-1]
            event = Event(
                id=f"E{number:03d}-B{order:03d}",
                episode=number,
                scene=scene.id,
                type=kind,
                speaker=label.split("(", 1)[0].strip() if kind == "DIALOGUE" else "",
                qualifiers=re.findall(r"\(([^)]*)\)", label),
                start_cs=start,
                end_cs=end,
                start=time_match.group(1),
                end=time_match.group(2),
                text=body,
                source_filename=filename,
                source_line=source_line,
            )
            events.append(event)
            if end <= start:
                report.warnings.append(f"{event.id}: end must exceed start")
            if start < scene.start_cs or end > scene.end_cs:
                report.warnings.append(f"{event.id}: event outside scene")
            i = j
            continue
        if line:
            report.warnings.append(f"Line {i+1}: unrecognized script line: {line[:80]}")
        i += 1
    if not events or not scenes:
        raise PromoError("parse_error", "No event blocks parsed")
    duration = max(s.end_cs for s in scenes)
    for s in scenes:
        if not 0 <= s.start_cs < s.end_cs <= duration:
            report.warnings.append(f"{s.id}: scene outside episode bounds")
    return Episode(
        number=number,
        logline=header("EPISODE LOGLINE"),
        continuity=header("CONTINUITY NOTES"),
        duration_cs=duration,
        scenes=scenes,
        events=events,
        source_filename=filename,
        text_hash=hashlib.sha256(text.encode()).hexdigest(),
        report=report,
    )


def parse_zip(data, settings: Settings | None = None) -> ParseResult:
    scripts, notes = _read_zip(data, settings or Settings.from_env())
    episodes, reports, seen = [], [], set()
    for name, text in scripts:
        try:
            episode = parse_episode(name, text)
            episode.report.warnings.extend(notes.get(name, []))
            if episode.number in seen:
                episode.report.errors.append(
                    f"Duplicate episode number {episode.number}; first file retained"
                )
            else:
                seen.add(episode.number)
                episodes.append(episode)
            reports.append(episode.report)
        except PromoError as exc:
            reports.append(
                ParseReport(
                    filename=name, errors=[exc.message], warnings=notes.get(name, [])
                )
            )
    return ParseResult(
        episodes=sorted(episodes, key=lambda e: e.number),
        reports=reports,
        files_received=len(scripts),
    )
