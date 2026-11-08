"""Synthetic fiction only. Run from the project root; no external data needed."""

from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED


def episode(number=1):
    blocks = [
        ("CAMERA", "00:00.00", "00:39.00", "An empty courtroom."),
        (
            "NORA",
            "00:02.00",
            "00:08.00",
            "My brother will be executed unless I find the real killer.",
        ),
        ("CAMERA", "00:39.00", "00:41.50", "Nora opens a blood-stained envelope."),
        (
            "NORA (O.S.) (Shocked)",
            "00:39.10",
            "00:41.20",
            "The judge signed the murder order!",
        ),
        ("CAMERA", "00:41.50", "01:00.00", "The judge reaches beneath the desk."),
        (
            "NORA",
            "00:43.00",
            "00:49.00",
            "My brother dies tonight for a murder you ordered.",
        ),
        (
            "JUDGE",
            "00:52.00",
            "00:57.00",
            "Give me that letter or your sister dies too.",
        ),
        (
            "ACTION",
            "01:00.00",
            "01:10.00",
            "Nora locks the door and raises her phone to record.",
        ),
        (
            "NORA",
            "01:12.00",
            "01:18.00",
            "I already sent the proof. You cannot stop me.",
        ),
        ("CAMERA", "01:18.00", "01:23.70", "A silhouette appears behind the glass."),
        (
            "JUDGE",
            "01:20.00",
            "01:23.70",
            "Then why is your sister standing behind me?",
        ),
        ("CAMERA", "01:23.70", "01:30.80", "Nora freezes; a hand touches the door."),
        ("SISTER", "01:28.00", "01:30.80", "Because I helped him frame our brother."),
        ("SOUND FX", "01:31.00", "01:32.00", "A gunshot echoes."),
    ]
    text = f"EPISODE NUMBER: Episode {number}\nEPISODE LOGLINE: SECRET LOGLINE Nora exposes a corrupt judge.\nCONTINUITY NOTES: SECRET CONTINUITY The sister is an accomplice.\n--- SCRIPT START ---\nSCENE 01\nScene heading: INT. COURTROOM – NIGHT\nScene start: 00:00.00\nScene end: 01:40.00\n"
    for label, start, end, body in blocks:
        text += f"**{label}:**\nStart: ({start}) | End: ({end})\n{body}\n"
    return text + "--- SCRIPT END ---\n"


def make_zip(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(path, "w", ZIP_DEFLATED) as z:
        for number in range(1, 4):
            z.writestr(
                f"episode-{number:03d}-Episode {1671702+number}.txt", episode(number)
            )
    return path


if __name__ == "__main__":
    print(make_zip(Path(__file__).with_name("synthetic-show.zip")))
