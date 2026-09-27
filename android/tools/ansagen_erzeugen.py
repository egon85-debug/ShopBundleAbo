"""Erzeugt die Ansagen der Sprachabfrage als Audiodateien (res/raw/*.ogg).

Stimme: Piper „de_DE-thorsten-medium“ (Datensatz Thorsten-Voice, Lizenz CC0).
Die App spielt diese Dateien ab und ist damit nicht auf die Sprachausgabe des
Handys angewiesen (fehlt oft oder spricht Englisch).

Aufruf (einmalig, Ergebnis wird eingecheckt):
    pip install piper-tts imageio-ffmpeg
    # Stimme laden: de_DE-thorsten-medium.onnx und .onnx.json von
    # https://huggingface.co/rhasspy/piper-voices/tree/main/de/de_DE/thorsten/medium
    python tools/ansagen_erzeugen.py <ordner-mit-stimme>
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import imageio_ffmpeg

# Dateiname → gesprochener Text. Namen müssen zu SprachAbfrage.kt passen.
ANSAGEN = {
    "ansage_lagerplatz": "Lagerplatz?",
    "ansage_bestand": "Bestand? Wie viele Stück?",
    "ansage_zustand": "Zustand? Neu, geöffnet, gebraucht oder defekt?",
    "ansage_einkaufspreis": "Einkaufspreis netto?",
    "ansage_weitere": "Weitere Angaben? Oder sagen Sie: fertig.",
    "ansage_nicht_verstanden": "Nicht verstanden. Bitte noch einmal.",
    "ansage_bitte_zahl": "Bitte eine Zahl sagen.",
    "ansage_bitte_zustand": "Bitte sagen Sie: neu, geöffnet, gebraucht oder defekt.",
    "ansage_bitte_betrag": "Bitte einen Betrag sagen, zum Beispiel zwölf Euro fünfzig.",
    "ansage_fertig": "Danke. Alle Angaben sind erfasst.",
}

ZIEL = Path(__file__).resolve().parents[1] / "app/src/main/res/raw"


def main(stimme_ordner: str) -> None:
    modell = Path(stimme_ordner) / "de_DE-thorsten-medium.onnx"
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    ZIEL.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for name, text in ANSAGEN.items():
            wav = Path(tmp) / f"{name}.wav"
            subprocess.run([sys.executable, "-m", "piper", "-m", str(modell), "-f", str(wav)],
                           input=text.encode(), check=True, capture_output=True)
            # Etwas Stille am Ende, damit der Signalton nicht an der Ansage klebt.
            subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(wav),
                            "-af", "apad=pad_dur=0.15,loudnorm=I=-16:TP=-1.5",
                            "-ac", "1", "-ar", "22050", "-c:a", "libvorbis", "-q:a", "4",
                            str(ZIEL / f"{name}.ogg")], check=True)
    # Signalton: zwei kurze Töne aufwärts (880 → 1320 Hz), weich ein- und ausgeblendet.
    subprocess.run([ffmpeg, "-y", "-loglevel", "error",
                    "-f", "lavfi", "-i", "sine=frequency=880:duration=0.09",
                    "-f", "lavfi", "-i", "sine=frequency=1320:duration=0.12",
                    "-filter_complex",
                    "[0]afade=t=in:d=0.01,afade=t=out:st=0.07:d=0.02[a];"
                    "[1]afade=t=in:d=0.01,afade=t=out:st=0.09:d=0.03[b];"
                    "[a][b]concat=n=2:v=0:a=1,volume=0.6",
                    "-ac", "1", "-ar", "22050", "-c:a", "libvorbis", "-q:a", "4",
                    str(ZIEL / "signalton.ogg")], check=True)
    print(f"{len(ANSAGEN) + 1} Dateien in {ZIEL}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
