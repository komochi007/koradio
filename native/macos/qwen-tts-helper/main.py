#!/usr/bin/env python3

import argparse
import base64
import contextlib
import io
import json
import sys
import wave

import numpy as np


VOICES = {"zh-CN": "Serena", "en-GB": "Ryan"}
LANGUAGES = {"zh-CN": "Chinese", "en-GB": "English"}


def emit(value):
    sys.stdout.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def synthesize(model, request):
    request_id = request.get("id")
    if (
        not isinstance(request_id, str)
        or not request_id
        or request.get("command") != "synthesize"
        or request.get("language") not in LANGUAGES
        or request.get("voiceStyle") != "natural-radio"
        or not isinstance(request.get("text"), str)
        or not request["text"].strip()
        or len(request["text"]) > 500
    ):
        emit({"id": request_id, "ok": False, "code": "request_invalid"})
        return

    minimum_duration = max(500, len(request["text"]) * 30)
    maximum_duration = max(5000, len(request["text"]) * 250)
    audio = None
    sample_rate = None
    for temperature in (0.9, 0.8, 0.7):
        with contextlib.redirect_stdout(sys.stderr):
            results = list(
                model.generate(
                    text=request["text"],
                    voice=VOICES[request["language"]],
                    lang_code=LANGUAGES[request["language"]],
                    max_tokens=4096,
                    temperature=temperature,
                    top_k=50,
                    top_p=1.0,
                    repetition_penalty=1.05,
                    verbose=False,
                )
            )
        if not results:
            continue
        candidate_rate = results[0].sample_rate
        if candidate_rate != 24000 or any(result.sample_rate != candidate_rate for result in results):
            continue
        candidate = np.concatenate(
            [np.asarray(result.audio, dtype=np.float32) for result in results]
        )
        duration = round((candidate.size / candidate_rate) * 1000)
        if (
            candidate.size > 0
            and np.isfinite(candidate).all()
            and minimum_duration <= duration <= maximum_duration
            and float(np.sqrt(np.mean(np.square(candidate)))) >= 0.001
        ):
            audio = candidate
            sample_rate = candidate_rate
            break
    if audio is None or sample_rate is None:
        emit({"id": request_id, "ok": False, "code": "audio_invalid"})
        return
    pcm = np.clip(audio, -1.0, 1.0)
    pcm = (pcm * 32767.0).astype("<i2")
    output = io.BytesIO()
    with wave.open(output, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(sample_rate)
        target.writeframes(pcm.tobytes())
    emit(
        {
            "id": request_id,
            "ok": True,
            "audioBase64": base64.b64encode(output.getvalue()).decode("ascii"),
            "extension": "wav",
            "mimeType": "audio/wav",
            "durationMs": round((pcm.size / sample_rate) * 1000),
            "markers": [],
        }
    )


def serve(model_directory):
    with contextlib.redirect_stdout(sys.stderr):
        from mlx_audio.tts.utils import load_model

        model = load_model(model_directory)
    emit({"ready": True, "voices": VOICES})
    for line in sys.stdin:
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError()
            synthesize(model, request)
        except Exception:
            emit({"id": None, "ok": False, "code": "helper_failed"})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["serve"])
    parser.add_argument("--model-directory", required=True)
    arguments = parser.parse_args()
    serve(arguments.model_directory)


if __name__ == "__main__":
    main()
