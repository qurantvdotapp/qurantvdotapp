"""
Batch Worker for Full Mushaf Reciter Timing Generation.
Processes Surahs (1..114) for a selected Moshaf recitation,
registers the read in reads.json, generates soar list,
and writes clean DRY timing JSONs.
"""

import os
import sys
import json
import time
import threading
from typing import Dict, Any, Optional, List

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT_DIR, "scripts"))

from stt_surah_timings import (
    load_tanzil_surah,
    transcribe_audio,
    align_ayah_timings,
    download_audio_if_url,
    BASMALA_CANONICAL
)

DATA_MIRROR = os.path.join(ROOT_DIR, "web", "data-mirror")
READS_FILE = os.path.join(DATA_MIRROR, "timing", "reads.json")
SOAR_DIR = os.path.join(DATA_MIRROR, "timing", "soar")
TIMING_DIR = os.path.join(DATA_MIRROR, "timing", "surah")
TIMING_CLEAN_DIR = os.path.join(DATA_MIRROR, "timing_clean")

os.makedirs(SOAR_DIR, exist_ok=True)
os.makedirs(TIMING_DIR, exist_ok=True)
os.makedirs(TIMING_CLEAN_DIR, exist_ok=True)

class BatchJob:
    def __init__(self, job_id: str, reciter_name: str, moshaf_name: str, server_url: str, surah_list: List[int], model_size: str = "base"):
        self.job_id = job_id
        self.reciter_name = reciter_name
        self.moshaf_name = moshaf_name
        self.server_url = server_url.rstrip("/") + "/"
        self.surah_list = surah_list
        self.model_size = model_size
        
        self.status = "queued" # queued, running, completed, cancelled, failed
        self.current_surah: Optional[int] = None
        self.completed_surahs: List[int] = []
        self.total_surahs = len(surah_list)
        self.current_step = ""
        self.logs: List[str] = []
        self.error: Optional[str] = None
        self.read_id: Optional[int] = None
        self._cancel_flag = False

    def log(self, msg: str):
        t_str = time.strftime("%H:%M:%S")
        entry = f"[{t_str}] {msg}"
        self.logs.append(entry)
        print(f"[BatchJob {self.job_id}] {entry}")

    def cancel(self):
        self._cancel_flag = True
        self.status = "cancelled"
        self.log("Job cancellation requested by user.")

# Global jobs registry
active_jobs: Dict[str, BatchJob] = {}

def get_or_create_read_id(server_url: str, reciter_name: str, moshaf_name: str) -> int:
    """Finds existing read_id for server_url or creates a new one in reads.json."""
    reads = []
    if os.path.exists(READS_FILE):
        try:
            with open(READS_FILE, "r", encoding="utf-8") as f:
                reads = json.load(f)
        except Exception:
            reads = []
            
    norm_target = server_url.rstrip("/") + "/"
    for r in reads:
        if r.get("folder_url", "").rstrip("/") + "/" == norm_target:
            return r["id"]
            
    # Assign new read ID (e.g. 5000 + max existing)
    max_id = max([r.get("id", 0) for r in reads] + [400])
    new_id = max_id + 1
    
    new_read = {
        "id": new_id,
        "name": reciter_name,
        "rewaya": moshaf_name,
        "folder_url": norm_target,
        "soar_count": 114,
        "soar_link": f"https://www.mp3quran.net/api/v3/ayat_timing/soar?read={new_id}"
    }
    reads.append(new_read)
    
    with open(READS_FILE, "w", encoding="utf-8") as f:
        json.dump(reads, f, ensure_ascii=False, indent=2)
        
    return new_id

def run_batch_job(job: BatchJob):
    """Executes the batch STT timing job sequentially."""
    job.status = "running"
    job.log(f"Starting batch timing for {job.reciter_name} ({job.moshaf_name}) — {job.total_surahs} surahs.")
    
    try:
        job.read_id = get_or_create_read_id(job.server_url, job.reciter_name, job.moshaf_name)
        job.log(f"Assigned/Matched Read ID: {job.read_id}")
        
        # Ensure soar list
        soar_file = os.path.join(SOAR_DIR, f"{job.read_id}.json")
        soar_entries = [{"id": s, "name": f"Surah {s}", "timing_link": f"https://www.mp3quran.net/api/v3/ayat_timing?surah={s}&read={job.read_id}"} for s in job.surah_list]
        with open(soar_file, "w", encoding="utf-8") as f:
            json.dump(soar_entries, f, ensure_ascii=False, indent=2)

        for s_idx, surah_id in enumerate(job.surah_list):
            if job._cancel_flag:
                job.log("Batch stopped early due to cancellation.")
                return

            job.current_surah = surah_id
            p_surah = f"{surah_id:03d}"
            audio_url = f"{job.server_url}{p_surah}.mp3"
            
            job.current_step = f"Surah {surah_id} ({s_idx + 1}/{job.total_surahs})"
            job.log(f"Processing Surah {surah_id} from {audio_url}...")
            
            # 1. Download audio
            audio_file = download_audio_if_url(audio_url)
            
            # 2. Tanzil text
            verses = load_tanzil_surah(surah_id)
            
            # 3. Transcribe with Whisper
            stt_words, total_dur = transcribe_audio(
                audio_file,
                model_size=job.model_size,
                surah_id=surah_id,
                verses=verses
            )
            
            # 4. Align
            aligned = align_ayah_timings(surah_id, verses, stt_words, total_dur)
            
            # 5. Save DRY Clean JSON in data-mirror
            clean_entries = [
                {
                    "ayah": a["ayah"],
                    "start_time": a["start_time"],
                    "end_time": a["end_time"]
                }
                for a in aligned
            ]
            
            # Save into both timing/surah/ and timing_clean/
            file_dest = os.path.join(TIMING_DIR, f"{job.read_id}_{surah_id}.json")
            clean_dest = os.path.join(TIMING_CLEAN_DIR, f"{job.read_id}_{surah_id}.json")
            
            with open(file_dest, "w", encoding="utf-8") as f:
                json.dump(clean_entries, f, ensure_ascii=False, indent=2)
            with open(clean_dest, "w", encoding="utf-8") as f:
                json.dump(clean_entries, f, ensure_ascii=False, indent=2)

            job.completed_surahs.append(surah_id)
            job.log(f"✓ Completed Surah {surah_id} ({len(clean_entries)} verses) -> {file_dest}")

        job.status = "completed"
        job.log(f"🎉 Successfully completed all {len(job.completed_surahs)} surahs for {job.reciter_name}!")
        
    except Exception as e:
        job.status = "failed"
        job.error = str(e)
        job.log(f"❌ Error during batch: {e}")

def start_batch_in_background(reciter_name: str, moshaf_name: str, server_url: str, surah_list: List[int], model_size: str = "base") -> str:
    """Spawns background thread for batch job."""
    job_id = f"batch_{int(time.time())}"
    job = BatchJob(job_id, reciter_name, moshaf_name, server_url, surah_list, model_size=model_size)
    active_jobs[job_id] = job
    
    t = threading.Thread(target=run_batch_job, args=(job,), daemon=True)
    t.start()
    return job_id
