#!/usr/bin/env python3
"""
STT Quran Ayah Timing Generator
Generates per-ayah timing JSON (AyahTimingDto) for any reciter's surah audio
using speech-to-text (faster-whisper) and ground-truth Quran text alignment.
"""

import sys
import os
import re
import json
import time
import threading
import urllib.request
import argparse
from typing import List, Dict, Any, Optional, Tuple

# Set utf-8 stdout
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# Tanzil Arabic text path
TANZIL_FILE = os.path.join(os.path.dirname(__file__), "..", "app", "src", "main", "assets", "quran", "quran-uthmani.txt")
TIMING_MIRROR_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "data-mirror", "timing", "surah")

BASMALA_CANONICAL = "بسم الله الرحمن الرحيم"

def normalize_arabic(text: str) -> str:
    """Normalize Arabic text for robust string matching."""
    if not text:
        return ""
    # Remove tashkeel / diacritics
    text = re.sub(r'[\u0617-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]', '', text)
    # Remove Quranic pause marks and annotations
    text = re.sub(r'[\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]', '', text)
    # Tatweel
    text = re.sub(r'\u0640', '', text)
    # Normalize alefs
    text = re.sub(r'[إأآٱ]', 'ا', text)
    # Normalize yaa
    text = re.sub(r'[ىي]', 'ي', text)
    # Normalize taa marbuta
    text = re.sub(r'ة', 'ه', text)
    # Remove non-arabic characters and punctuation
    text = re.sub(r'[^\u0621-\u063A\u0641-\u064A\s]', ' ', text)
    # Normalize whitespace
    return ' '.join(text.split())

def load_tanzil_surah(surah_id: int) -> List[Dict[str, Any]]:
    """Load canonical verse texts for a surah from Tanzil dataset."""
    verses = []
    if not os.path.exists(TANZIL_FILE):
        raise FileNotFoundError(f"Tanzil file not found at: {TANZIL_FILE}")
        
    with open(TANZIL_FILE, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split("|")
            if len(parts) >= 3:
                s_id, v_id, text = int(parts[0]), int(parts[1]), parts[2]
                if s_id == surah_id:
                    # If surah >= 2 and v_id == 1, Tanzil prefixes Basmala. Strip it for verse 1 text.
                    raw_text = text
                    if surah_id >= 2 and v_id == 1:
                        # Basmala prefix in Tanzil
                        basmala_prefix = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ "
                        if raw_text.startswith(basmala_prefix):
                            raw_text = raw_text[len(basmala_prefix):]
                        elif normalize_arabic(raw_text).startswith(normalize_arabic(BASMALA_CANONICAL)):
                            norm_v = normalize_arabic(raw_text)
                            norm_b = normalize_arabic(BASMALA_CANONICAL)
                            words_v = raw_text.split()
                            # Basmala is 4 words
                            if len(words_v) > 4:
                                raw_text = " ".join(words_v[4:])
                    
                    norm = normalize_arabic(raw_text)
                    verses.append({
                        "ayah": v_id,
                        "text_uthmani": raw_text,
                        "text_norm": norm,
                        "words": norm.split()
                    })
    return verses

def find_reference_polygons(surah_id: int) -> Dict[int, Dict[str, Any]]:
    """Find reference SVG polygons & page coordinates for the surah from mirror data."""
    if not os.path.exists(TIMING_MIRROR_DIR):
        return {}
    
    # Find any existing timing file for this surah to reuse its polygon/page metadata
    for filename in os.listdir(TIMING_MIRROR_DIR):
        if filename.endswith(f"_{surah_id}.json"):
            filepath = os.path.join(TIMING_MIRROR_DIR, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return {
                        item["ayah"]: {
                            "polygon": item.get("polygon"),
                            "x": item.get("x"),
                            "y": item.get("y"),
                            "page": item.get("page")
                        }
                        for item in data
                    }
            except Exception:
                continue
    return {}

def download_audio_if_url(audio_path_or_url: str) -> str:
    """Download audio file if URL, otherwise return local path."""
    if audio_path_or_url.startswith("http://") or audio_path_or_url.startswith("https://"):
        local_dir = os.path.join(os.path.dirname(__file__), "..", "scratch")
        os.makedirs(local_dir, exist_ok=True)
        filename = os.path.basename(audio_path_or_url.split("?")[0]) or "surah.mp3"
        if not filename.endswith(".mp3"):
            filename += ".mp3"
        local_path = os.path.join(local_dir, filename)
        
        if os.path.exists(local_path) and os.path.getsize(local_path) > 10000:
            return local_path

        print(f"[*] Downloading audio from {audio_path_or_url}...")
        tmp_path = local_path + ".tmp"
        req = urllib.request.Request(
            audio_path_or_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "*/*"
            }
        )
        with urllib.request.urlopen(req, timeout=60) as resp, open(tmp_path, "wb") as out_file:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                out_file.write(chunk)

        if os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 10000:
            if os.path.exists(local_path):
                os.remove(local_path)
            os.rename(tmp_path, local_path)
            print(f"[*] Saved audio to {local_path} ({os.path.getsize(local_path)} bytes)")
            return local_path
        else:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise IOError(f"Failed to download audio from {audio_path_or_url} (file truncated or empty)")
    return audio_path_or_url

_MODEL_CACHE: Dict[str, Any] = {}
_MODEL_LOCK = threading.Lock()

def get_whisper_engine(model_size: str = "turbo"):
    """
    Thread-safe singleton cache for Whisper models.
    Prefers PyTorch GPU (ROCm/CUDA on AMD 9070XT / NVIDIA) when available,
    otherwise falls back to Faster-Whisper / CTranslate2 on CPU.
    """
    with _MODEL_LOCK:
        if model_size not in _MODEL_CACHE:
            actual_model = "large-v3-turbo" if model_size == "turbo" else model_size
            
            # Check if PyTorch ROCm/CUDA is available
            try:
                import torch
                import whisper
                if torch.cuda.is_available() and torch.cuda.device_count() > 0:
                    device_name = torch.cuda.get_device_name(0)
                    print(f"[*] [GPU Accelerated] Loading Whisper '{actual_model}' on GPU: {device_name} (ROCm/CUDA)...")
                    model = whisper.load_model(actual_model, device="cuda")
                    _MODEL_CACHE[model_size] = {"engine": "whisper_gpu", "model": model, "device_name": device_name}
                    return _MODEL_CACHE[model_size]
            except Exception as e:
                print(f"[!] PyTorch GPU Whisper not available ({e}), falling back to Faster-Whisper CPU...")

            # Fallback to Faster-Whisper (CPU)
            from faster_whisper import WhisperModel
            import ctranslate2
            cuda_available = (ctranslate2.get_cuda_device_count() > 0)
            device = "cuda" if cuda_available else "cpu"
            compute_type = "float16" if cuda_available else "int8"
            cpu_threads = os.cpu_count() or 8
            print(f"[*] Loading Faster-Whisper '{actual_model}' on {device} ({compute_type}) with {cpu_threads} threads...")
            model = WhisperModel(
                actual_model,
                device=device,
                compute_type=compute_type,
                cpu_threads=cpu_threads
            )
            _MODEL_CACHE[model_size] = {"engine": "faster_whisper", "model": model, "device_name": device}
            
        return _MODEL_CACHE[model_size]

def get_whisper_model(model_size: str = "turbo"):
    """Backward-compatible helper returning model instance."""
    entry = get_whisper_engine(model_size)
    return entry["model"]

def transcribe_audio(
    audio_path: str,
    model_size: str = "turbo",
    progress_callback: Optional[Any] = None,
    surah_id: Optional[int] = None,
    verses: Optional[List[Dict[str, Any]]] = None,
    beam_size: int = 1
) -> Tuple[List[Dict[str, Any]], float]:
    """
    Transcribe audio with word-level timestamps and live progress reporting.
    Accelerated with AMD Radeon RX 9070 XT (ROCm) / NVIDIA (CUDA) if present,
    with automatic CPU fallback.
    Optimized for high throughput on long Surahs:
    - beam_size=1 (greedy decoding) provides ~2.5x speedup with high accuracy when primed with Quranic prompt.
    """
    engine_info = get_whisper_engine(model_size)
    engine_type = engine_info["engine"]
    model = engine_info["model"]
    device_desc = engine_info.get("device_name", "GPU")
    
    if progress_callback:
        progress_callback({
            "phase": "loading_model",
            "percent": 5,
            "message": f"Running Whisper '{model_size}' on {device_desc}..."
        })

    # Construct initial prompt with surah verses to guide Whisper's vocabulary
    initial_prompt = ""
    if verses:
        prompt_words = []
        if surah_id and surah_id >= 2 and surah_id != 9:
            prompt_words.extend(BASMALA_CANONICAL.split())
        for v in verses:
            prompt_words.extend(v.get("text_uthmani", "").split())
            if len(prompt_words) > 150:
                break
        initial_prompt = " ".join(prompt_words)
    elif surah_id:
        try:
            loaded_v = load_tanzil_surah(surah_id)
            prompt_words = [BASMALA_CANONICAL] if surah_id >= 2 and surah_id != 9 else []
            for v in loaded_v:
                prompt_words.append(v.get("text_uthmani", ""))
                if len(" ".join(prompt_words).split()) > 150:
                    break
            initial_prompt = " ".join(prompt_words)
        except Exception:
            initial_prompt = ""

    print(f"[*] Transcribing audio on {device_desc} (beam_size={beam_size}) with word timestamps...")
    if progress_callback:
        progress_callback({"phase": "starting_transcription", "percent": 10, "message": f"Transcribing audio on {device_desc}..."})

    all_words = []
    total_duration = 1.0

    if engine_type == "whisper_gpu":
        import whisper
        # PyTorch Whisper GPU backend
        audio_tensor = whisper.load_audio(audio_path)
        total_duration = max(1.0, len(audio_tensor) / 16000.0)
        start_time = time.time()

        res = model.transcribe(
            audio_tensor,
            language="ar",
            word_timestamps=True,
            beam_size=beam_size,
            best_of=beam_size if beam_size > 1 else None,
            condition_on_previous_text=False,
            initial_prompt=initial_prompt or None,
            temperature=(0.0, 0.2)
        )

        segments = res.get("segments", [])
        for segment in segments:
            seg_words = []
            for word_info in segment.get("words", []):
                raw_w = word_info.get("word", "")
                clean_w = normalize_arabic(raw_w)
                if clean_w:
                    all_words.append({
                        "word": clean_w,
                        "raw_word": raw_w,
                        "start": word_info.get("start", 0.0),
                        "end": word_info.get("end", 0.0),
                        "probability": word_info.get("probability", 1.0)
                    })
                    seg_words.append(raw_w)

            if progress_callback:
                seg_end = segment.get("end", total_duration)
                pct = min(95.0, round((seg_end / total_duration) * 85.0 + 10.0, 1))
                elapsed = max(0.1, time.time() - start_time)
                speed = round(seg_end / elapsed, 1)
                progress_callback({
                    "phase": "transcribing",
                    "percent": pct,
                    "current_time_sec": round(seg_end, 2),
                    "total_duration_sec": round(total_duration, 2),
                    "speed_x": f"{speed}x",
                    "words_count": len(all_words),
                    "last_text": " ".join(seg_words) or segment.get("text", "")
                })

    else:
        # Faster-Whisper CPU / CTranslate2 backend
        segments, info = model.transcribe(
            audio_path,
            language="ar",
            word_timestamps=True,
            vad_filter=False,
            beam_size=beam_size,
            condition_on_previous_text=False,
            initial_prompt=initial_prompt or None,
            temperature=[0.0, 0.2]
        )
        total_duration = info.duration or 1.0
        start_time = time.time()

        for segment in segments:
            seg_words = []
            for word in (segment.words or []):
                clean_word = normalize_arabic(word.word)
                if clean_word:
                    item = {
                        "word": clean_word,
                        "raw_word": word.word,
                        "start": word.start,
                        "end": word.end,
                        "probability": word.probability
                    }
                    all_words.append(item)
                    seg_words.append(word.word)

            if progress_callback:
                seg_end = segment.end
                pct = min(95.0, round((seg_end / total_duration) * 85.0 + 10.0, 1))
                elapsed = max(0.1, time.time() - start_time)
                speed = round(seg_end / elapsed, 1)
                progress_callback({
                    "phase": "transcribing",
                    "percent": pct,
                    "current_time_sec": round(seg_end, 2),
                    "total_duration_sec": round(total_duration, 2),
                    "speed_x": f"{speed}x",
                    "words_count": len(all_words),
                    "last_text": " ".join(seg_words) or segment.text
                })
                
    if progress_callback:
        progress_callback({"phase": "aligning_tanzil", "percent": 96, "message": "Aligning STT words with Tanzil verses..."})

    return all_words, total_duration

def word_similarity(w1: str, w2: str) -> float:
    """Calculate phonetic/character similarity between two normalized Arabic words."""
    if w1 == w2:
        return 1.0
    if not w1 or not w2:
        return 0.0
    if w1.startswith(w2) or w2.startswith(w1):
        return 0.8
    # Simple edit distance
    len1, len2 = len(w1), len(w2)
    dp = [[0] * (len2 + 1) for _ in range(len1 + 1)]
    for i in range(len1 + 1):
        dp[i][0] = i
    for j in range(len2 + 1):
        dp[0][j] = j
    for i in range(1, len1 + 1):
        for j in range(1, len2 + 1):
            cost = 0 if w1[i - 1] == w2[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    dist = dp[len1][len2]
    max_len = max(len1, len2)
    return max(0.0, 1.0 - (dist / max_len))

def align_ayah_timings(
    surah_id: int,
    verses: List[Dict[str, Any]],
    stt_words: List[Dict[str, Any]],
    total_duration_sec: float
) -> List[Dict[str, Any]]:
    """
    Robust Quran Ayah alignment algorithm:
    1. Checks Basmala recitation
    2. Uses forward sequence matching with dynamic similarity scoring
    3. Finds high-confidence anchor ayahs
    4. Interpolates unanchored ayahs proportionally to verse length
    5. Produces gapless, monotonic, continuous timing entries from 0:00 to total_duration
    """
    if not verses:
        raise ValueError("Verses list is empty.")
    
    total_duration_ms = int(total_duration_sec * 1000)
    has_basmala_slot = (surah_id >= 2 and surah_id <= 114 and surah_id != 9)
    basmala_words = normalize_arabic(BASMALA_CANONICAL).split()
    
    # 1. Detect Basmala in STT words
    has_recited_basmala = False
    basmala_end_idx = 0
    if has_basmala_slot and len(stt_words) >= 3:
        test_cnt = min(4, len(stt_words))
        score = sum(word_similarity(stt_words[i]["word"], basmala_words[i]) for i in range(test_cnt)) / float(len(basmala_words))
        if score >= 0.5:
            has_recited_basmala = True
            basmala_end_idx = test_cnt
            if len(stt_words) > test_cnt and verses:
                v1_first = verses[0]["words"][0] if verses[0]["words"] else ""
                for idx in range(3, min(6, len(stt_words))):
                    if word_similarity(stt_words[idx]["word"], v1_first) > 0.6:
                        basmala_end_idx = idx
                        break

    # Build sequence of targets to align
    target_units = []
    if has_basmala_slot:
        target_units.append({
            "ayah": 0,
            "is_basmala": True,
            "words": basmala_words,
            "text": BASMALA_CANONICAL,
            "recited": has_recited_basmala
        })
    for v in verses:
        target_units.append({
            "ayah": v["ayah"],
            "is_basmala": False,
            "words": v["words"],
            "text": v["text_uthmani"],
            "recited": True
        })

    # If no STT words at all, do proportional fallback across all recited units
    if not stt_words:
        recited_units = [u for u in target_units if u["recited"]]
        total_chars = sum(len(u["text"]) for u in recited_units) or 1
        curr_ms = 0
        results = []
        for u in target_units:
            if not u["recited"]:
                results.append({"ayah": u["ayah"], "start_time": 0, "end_time": 0})
            else:
                dur = int((len(u["text"]) / total_chars) * total_duration_ms)
                start_t = curr_ms
                end_t = min(total_duration_ms, curr_ms + dur)
                results.append({"ayah": u["ayah"], "start_time": start_t, "end_time": end_t})
                curr_ms = end_t
        if results:
            results[-1]["end_time"] = total_duration_ms
        return results

    # 2. Sequence Alignment / Scoring
    flat_targets = []
    for u_idx, u in enumerate(target_units):
        if not u["recited"]:
            continue
        for w_idx, w in enumerate(u["words"]):
            flat_targets.append({
                "unit_idx": u_idx,
                "ayah": u["ayah"],
                "word": w,
                "is_first": (w_idx == 0),
                "is_last": (w_idx == len(u["words"]) - 1)
            })

    N = len(stt_words)
    M = len(flat_targets)

    dp = [[-1e9] * (M + 1) for _ in range(N + 1)]
    ptr = [[(0, 0)] * (M + 1) for _ in range(N + 1)]
    dp[0][0] = 0.0

    for i in range(N + 1):
        for j in range(M + 1):
            if dp[i][j] <= -1e8:
                continue
            # Insertion (skip STT word)
            if i < N:
                sc = dp[i][j] - 0.05
                if sc > dp[i + 1][j]:
                    dp[i + 1][j] = sc
                    ptr[i + 1][j] = (i, j)
            # Deletion (skip target word)
            if j < M:
                sc = dp[i][j] - 0.15
                if sc > dp[i][j + 1]:
                    dp[i][j + 1] = sc
                    ptr[i][j + 1] = (i, j)
            # Match
            if i < N and j < M:
                sim = word_similarity(stt_words[i]["word"], flat_targets[j]["word"])
                match_sc = 2.5 * sim - 0.3
                sc = dp[i][j] + match_sc
                if sc > dp[i + 1][j + 1]:
                    dp[i + 1][j + 1] = sc
                    ptr[i + 1][j + 1] = (i, j)

    # Backtrack
    curr_i, curr_j = N, M
    aligned_matches = []
    while curr_i > 0 or curr_j > 0:
        pi, pj = ptr[curr_i][curr_j]
        if pi == curr_i - 1 and pj == curr_j - 1:
            aligned_matches.append((pi, pj))
        curr_i, curr_j = pi, pj
    aligned_matches.reverse()

    # Group STT words by unit
    unit_stt = {u_idx: [] for u_idx in range(len(target_units))}
    for stt_i, tgt_j in aligned_matches:
        u_idx = flat_targets[tgt_j]["unit_idx"]
        sim = word_similarity(stt_words[stt_i]["word"], flat_targets[tgt_j]["word"])
        if sim >= 0.4:
            unit_stt[u_idx].append(stt_words[stt_i])

    # 3. Find Anchors (units with valid matched words)
    anchors = {}
    for u_idx, u in enumerate(target_units):
        if not u["recited"]:
            continue
        words = unit_stt[u_idx]
        if words:
            s_ms = int(words[0]["start"] * 1000)
            e_ms = int(words[-1]["end"] * 1000)
            if e_ms > s_ms:
                anchors[u_idx] = (s_ms, e_ms)

    # 4. Monotonic constraint on anchors
    sorted_anchor_idxs = sorted(anchors.keys())
    valid_anchor_idxs = []
    last_s = -1
    for a_idx in sorted_anchor_idxs:
        s, e = anchors[a_idx]
        if s >= last_s:
            valid_anchor_idxs.append(a_idx)
            last_s = s

    # 5. Build raw start and end timestamps for all units with interpolation
    unit_starts = [None] * len(target_units)
    unit_ends = [None] * len(target_units)

    for a_idx in valid_anchor_idxs:
        unit_starts[a_idx] = anchors[a_idx][0]
        unit_ends[a_idx] = anchors[a_idx][1]

    # Interpolate leading unanchored recited units (before first anchor)
    first_recited_idx = next((i for i, u in enumerate(target_units) if u["recited"]), None)
    if valid_anchor_idxs:
        first_a = valid_anchor_idxs[0]
        if first_recited_idx is not None and first_recited_idx < first_a:
            first_anchor_start = unit_starts[first_a]
            span_units = target_units[first_recited_idx:first_a]
            total_chars = sum(len(u["text"]) for u in span_units) or 1
            cur = 0
            for offset, u in enumerate(span_units):
                idx = first_recited_idx + offset
                dur = int((len(u["text"]) / total_chars) * first_anchor_start)
                unit_starts[idx] = cur
                unit_ends[idx] = cur + dur
                cur += dur

    # Interpolate intermediate unanchored gaps between anchors
    for k in range(len(valid_anchor_idxs) - 1):
        a1 = valid_anchor_idxs[k]
        a2 = valid_anchor_idxs[k + 1]
        if a2 > a1 + 1:
            t1 = unit_ends[a1]
            t2 = unit_starts[a2]
            gap_duration = max(0, t2 - t1)
            span_units = target_units[a1 + 1:a2]
            total_chars = sum(len(u["text"]) for u in span_units) or 1
            cur = t1
            for offset, u in enumerate(span_units):
                idx = a1 + 1 + offset
                dur = int((len(u["text"]) / total_chars) * gap_duration)
                unit_starts[idx] = cur
                unit_ends[idx] = cur + dur
                cur += dur

    # Interpolate trailing unanchored units (after last anchor)
    if valid_anchor_idxs:
        last_a = valid_anchor_idxs[-1]
        if last_a < len(target_units) - 1:
            last_anchor_end = unit_ends[last_a]
            remaining_dur = max(0, total_duration_ms - last_anchor_end)
            span_units = target_units[last_a + 1:]
            total_chars = sum(len(u["text"]) for u in span_units) or 1
            cur = last_anchor_end
            for offset, u in enumerate(span_units):
                idx = last_a + 1 + offset
                dur = int((len(u["text"]) / total_chars) * remaining_dur)
                unit_starts[idx] = cur
                unit_ends[idx] = cur + dur
                cur += dur
    else:
        recited_units = [u for u in target_units if u["recited"]]
        total_chars = sum(len(u["text"]) for u in recited_units) or 1
        cur = 0
        for idx, u in enumerate(target_units):
            if u["recited"]:
                dur = int((len(u["text"]) / total_chars) * total_duration_ms)
                unit_starts[idx] = cur
                unit_ends[idx] = cur + dur
                cur += dur

    # 6. Format final gapless monotonic ayah timings
    results = []
    last_boundary = 0

    for idx, u in enumerate(target_units):
        ayah_num = u["ayah"]
        if not u["recited"]:
            results.append({
                "ayah": ayah_num,
                "start_time": 0,
                "end_time": 0
            })
            continue

        raw_s = unit_starts[idx] if unit_starts[idx] is not None else last_boundary
        raw_e = unit_ends[idx] if unit_ends[idx] is not None else raw_s + 1000

        start_ms = max(last_boundary, raw_s)
        
        # Lookahead: end boundary is the start of next recited unit
        next_recited_idx = next((i for i in range(idx + 1, len(target_units)) if target_units[i]["recited"]), None)
        if next_recited_idx is not None and unit_starts[next_recited_idx] is not None:
            end_ms = max(start_ms + 300, unit_starts[next_recited_idx])
        else:
            end_ms = max(start_ms + 300, raw_e, total_duration_ms)

        # Snap last recited unit to total duration
        if next_recited_idx is None:
            end_ms = total_duration_ms

        results.append({
            "ayah": ayah_num,
            "start_time": start_ms,
            "end_time": end_ms
        })
        last_boundary = end_ms

    # Ensure the first recited unit starts at 0:00
    if first_recited_idx is not None and results:
        results[first_recited_idx]["start_time"] = 0

    # Ensure last unit ends at audio end
    if results and any(u["recited"] for u in target_units):
        results[-1]["end_time"] = total_duration_ms

    return results

def generate_timing(
    audio_source: str,
    surah_id: int,
    model_size: str = "base",
    output_path: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Complete pipeline to generate AyahTimingDto list."""
    print(f"==================================================")
    print(f"  Surah Timing STT Generator (Surah {surah_id})")
    print(f"==================================================")
    
    # 1. Load Quran text
    verses = load_tanzil_surah(surah_id)
    print(f"[+] Loaded {len(verses)} verses for Surah {surah_id}")
    
    # 2. Reference polygons/pages
    ref_polygons = find_reference_polygons(surah_id)
    print(f"[+] Found {len(ref_polygons)} reference polygon entries for Surah {surah_id}")
    
    # 3. Audio file
    audio_file = download_audio_if_url(audio_source)
    
    # 4. Transcribe with Whisper
    stt_words, total_dur = transcribe_audio(
        audio_file,
        model_size=model_size,
        surah_id=surah_id,
        verses=verses
    )
    print(f"[+] Transcribed {len(stt_words)} words (Audio duration: {total_dur:.2f}s)")
    
    # 5. Align Ayahs
    timing_entries = align_ayah_timings(surah_id, verses, stt_words, total_dur)
    
    # 6. Attach polygon metadata
    final_output = []
    for entry in timing_entries:
        ayah = entry["ayah"]
        poly_meta = ref_polygons.get(ayah, {})
        final_output.append({
            "ayah": ayah,
            "polygon": poly_meta.get("polygon", None),
            "start_time": entry["start_time"],
            "end_time": entry["end_time"],
            "x": poly_meta.get("x", None),
            "y": poly_meta.get("y", None),
            "page": poly_meta.get("page", None)
        })
        
    # 7. Print result table
    print("\n" + "="*80)
    print(f"{'Ayah':<6} | {'Start (ms)':<10} | {'End (ms)':<10} | {'Duration (s)':<12} | {'Text'}")
    print("-" * 80)
    
    verse_map = {v["ayah"]: v["text_uthmani"] for v in verses}
    for item in final_output:
        ayah = item["ayah"]
        st = item["start_time"]
        et = item["end_time"]
        dur = (et - st) / 1000.0
        text = BASMALA_CANONICAL if ayah == 0 else verse_map.get(ayah, "")
        print(f"{ayah:<6} | {st:<10} | {et:<10} | {dur:<12.2f} | {text}")
    print("="*80 + "\n")
    
    # 8. Save output
    if output_path:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(final_output, f, ensure_ascii=False, indent=2)
        print(f"[✓] Timing JSON saved to: {output_path}")
        
    return final_output

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate Quran Ayah Timings using Whisper STT")
    parser.add_argument("--audio", required=True, help="Audio URL or local file path")
    parser.add_argument("--surah", type=int, required=True, help="Surah number (1-114)")
    parser.add_argument("--model", default="base", help="Whisper model size (tiny, base, small, medium)")
    parser.add_argument("--output", help="Path to save output JSON")
    
    args = parser.parse_args()
    generate_timing(args.audio, args.surah, args.model, args.output)
