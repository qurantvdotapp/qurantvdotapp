"""
Batch Processor for Full Mushaf Reciter Timing Generation.
Processes Surahs (1..114) for any selected Moshaf recitation via Whisper STT,
provides granular real-time progress callbacks, supports Pause/Resume/Cancel/Retry/Delete,
updates reads.json, writes clean DRY timing JSONs into timing_clean/<slug>/<surah_id>.json,
and syncs timing_index.json.
"""

import os
import sys
import json
import time
import re
import threading
from typing import Dict, Any, Optional, List

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT_DIR, "scripts"))

from stt_surah_timings import (
    load_tanzil_surah,
    transcribe_audio,
    align_ayah_timings,
    download_audio_if_url,
    normalize_arabic,
    BASMALA_CANONICAL
)

DATA_MIRROR = os.path.join(ROOT_DIR, "web", "data-mirror")
READS_FILE = os.path.join(DATA_MIRROR, "timing", "reads.json")
SOAR_DIR = os.path.join(DATA_MIRROR, "timing", "soar")
TIMING_DIR = os.path.join(DATA_MIRROR, "timing", "surah")
TIMING_CLEAN_DIR = os.path.join(DATA_MIRROR, "timing_clean")
TIMING_INDEX_FILE = os.path.join(DATA_MIRROR, "timing_index.json")
JOBS_PERSIST_FILE = os.path.join(ROOT_DIR, "scratch", "batch_jobs.json")

os.makedirs(SOAR_DIR, exist_ok=True)
os.makedirs(TIMING_DIR, exist_ok=True)
os.makedirs(TIMING_CLEAN_DIR, exist_ok=True)
os.makedirs(os.path.dirname(JOBS_PERSIST_FILE), exist_ok=True)

def generate_default_slug(reciter_name: str, moshaf_name: str, server_url: str) -> str:
    """Generates a clean slug for reciter and moshaf."""
    # Check timing_index.json first for existing mapping
    norm_target = server_url.rstrip("/") + "/"
    if os.path.exists(TIMING_INDEX_FILE):
        try:
            with open(TIMING_INDEX_FILE, "r", encoding="utf-8") as f:
                idx = json.load(f)
                entries = idx.get("timing_sources", idx)
                if norm_target in entries and "slug" in entries[norm_target]:
                    return entries[norm_target]["slug"]
        except Exception:
            pass

    # Clean reciter name
    clean_reciter = re.sub(r'[^a-zA-Z0-9]+', '-', reciter_name.lower()).strip('-')
    if not clean_reciter or len(clean_reciter) < 3:
        clean_reciter = "reciter"
    clean_moshaf = "hafs"
    if "warsh" in moshaf_name.lower() or "ورش" in moshaf_name:
        clean_moshaf = "warsh"
    elif "mojawwad" in moshaf_name.lower() or "مجود" in moshaf_name:
        clean_moshaf = "mojawwad"
    elif "moallim" in moshaf_name.lower() or "معلم" in moshaf_name:
        clean_moshaf = "moallim"
    elif "qalon" in moshaf_name.lower() or "قالون" in moshaf_name:
        clean_moshaf = "qalon"
    elif "dori" in moshaf_name.lower() or "دوري" in moshaf_name:
        clean_moshaf = "dori"

    return f"qurantvapp-{clean_reciter}-{clean_moshaf}"

class BatchJob:
    def __init__(
        self,
        job_id: str,
        reciter_name: str,
        moshaf_name: str,
        server_url: str,
        surah_list: List[int],
        model_size: str = "turbo",
        slug: Optional[str] = None
    ):
        self.job_id = job_id
        self.reciter_name = reciter_name
        self.moshaf_name = moshaf_name
        self.server_url = server_url.rstrip("/") + "/"
        self.surah_list = sorted(list(set(surah_list)))
        self.model_size = model_size
        self.slug = slug or generate_default_slug(reciter_name, moshaf_name, server_url)
        
        self.status = "queued"  # queued, running, paused, completed, cancelled, failed
        self.created_at = time.time()
        self.started_at: Optional[float] = None
        self.finished_at: Optional[float] = None
        
        self.current_surah: Optional[int] = None
        self.completed_surahs: List[int] = []
        self.failed_surahs: Dict[int, str] = {}
        self.total_surahs = len(self.surah_list)
        
        # Granular sub-step progress for current surah
        self.current_step = ""
        self.current_phase = "idle"  # idle, downloading, transcribing, aligning, saving
        self.current_surah_pct = 0.0
        self.current_surah_time = 0.0
        self.current_surah_total_time = 0.0
        self.current_speed = "1.0x"
        self.current_words_count = 0
        self.current_last_text = ""
        self.current_message = ""
        
        self.logs: List[str] = []
        self.error: Optional[str] = None
        self.read_id: Optional[int] = None
        
        self._cancel_flag = False
        self._pause_flag = False
        self._thread: Optional[threading.Thread] = None

    def log(self, msg: str):
        t_str = time.strftime("%H:%M:%S")
        entry = f"[{t_str}] {msg}"
        self.logs.append(entry)
        if len(self.logs) > 200:
            self.logs = self.logs[-200:]
        print(f"[BatchJob {self.job_id}] {entry}")

    def pause(self):
        if self.status == "running":
            self._pause_flag = True
            self.status = "paused"
            self.log("⏸️ Job execution paused by user.")
            save_jobs_to_disk()

    def resume(self):
        if self.status == "paused":
            self._pause_flag = False
            self.status = "running"
            self.log("▶️ Job execution resumed by user.")
            # If thread terminated, restart
            if not self._thread or not self._thread.is_alive():
                self._thread = threading.Thread(target=run_batch_job, args=(self,), daemon=True)
                self._thread.start()
            save_jobs_to_disk()

    def cancel(self):
        self._cancel_flag = True
        self._pause_flag = False
        self.status = "cancelled"
        self.finished_at = time.time()
        self.log("⏹️ Job cancellation requested by user.")
        save_jobs_to_disk()

    def to_dict(self) -> Dict[str, Any]:
        overall_pct = 0.0
        if self.total_surahs > 0:
            done_cnt = len(self.completed_surahs)
            # Add partial progress of current surah
            partial = (self.current_surah_pct / 100.0) if self.status == "running" else 0.0
            overall_pct = round(min(100.0, ((done_cnt + partial) / self.total_surahs) * 100.0), 1)

        return {
            "job_id": self.job_id,
            "reciter_name": self.reciter_name,
            "moshaf_name": self.moshaf_name,
            "server_url": self.server_url,
            "slug": self.slug,
            "model_size": self.model_size,
            "status": self.status,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "current_surah": self.current_surah,
            "completed_surahs": self.completed_surahs,
            "failed_surahs": self.failed_surahs,
            "completed_count": len(self.completed_surahs),
            "total_surahs": self.total_surahs,
            "percent": overall_pct,
            "current_step": self.current_step,
            "current_phase": self.current_phase,
            "current_surah_pct": round(self.current_surah_pct, 1),
            "current_surah_time": round(self.current_surah_time, 1),
            "current_surah_total_time": round(self.current_surah_total_time, 1),
            "current_speed": self.current_speed,
            "current_words_count": self.current_words_count,
            "current_last_text": self.current_last_text,
            "current_message": self.current_message,
            "logs": self.logs[-40:],
            "error": self.error,
            "read_id": self.read_id
        }

# Global in-memory jobs registry
active_jobs: Dict[str, BatchJob] = {}

def save_jobs_to_disk():
    """Persists jobs to scratch/batch_jobs.json."""
    try:
        data = {j_id: job.to_dict() for j_id, job in active_jobs.items()}
        with open(JOBS_PERSIST_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[!] Error saving batch jobs to disk: {e}")

def load_jobs_from_disk():
    """Loads previous jobs from scratch/batch_jobs.json."""
    if not os.path.exists(JOBS_PERSIST_FILE):
        return
    try:
        with open(JOBS_PERSIST_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            for j_id, d in data.items():
                if j_id not in active_jobs:
                    job = BatchJob(
                        job_id=d["job_id"],
                        reciter_name=d.get("reciter_name", ""),
                        moshaf_name=d.get("moshaf_name", ""),
                        server_url=d.get("server_url", ""),
                        surah_list=d.get("surah_list", list(range(1, 115))),
                        model_size=d.get("model_size", "turbo"),
                        slug=d.get("slug")
                    )
                    job.status = d.get("status", "completed")
                    if job.status == "running":
                        job.status = "paused"
                    job.created_at = d.get("created_at", time.time())
                    job.started_at = d.get("started_at")
                    job.finished_at = d.get("finished_at")
                    job.completed_surahs = d.get("completed_surahs", [])
                    job.failed_surahs = d.get("failed_surahs", {})
                    job.logs = d.get("logs", [])
                    job.error = d.get("error")
                    job.read_id = d.get("read_id")
                    active_jobs[j_id] = job
    except Exception as e:
        print(f"[!] Error loading batch jobs from disk: {e}")

# Initial load
load_jobs_from_disk()

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
            
    # Assign new read ID
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

def update_timing_index(server_url: str, slug: str, read_id: int, completed_surahs: List[int]):
    """Updates timing_index.json so the web app and players immediately recognize the timings."""
    try:
        norm_target = server_url.rstrip("/") + "/"
        index_data = {}
        if os.path.exists(TIMING_INDEX_FILE):
            with open(TIMING_INDEX_FILE, "r", encoding="utf-8") as f:
                index_data = json.load(f)

        is_nested = "timing_sources" in index_data
        sources = index_data.get("timing_sources", index_data)

        # Existing entry or new entry
        existing_surahs = []
        if norm_target in sources and isinstance(sources[norm_target].get("surahs"), list):
            existing_surahs = sources[norm_target]["surahs"]

        merged_surahs = sorted(list(set(existing_surahs + completed_surahs)))
        surah_val = "all" if len(merged_surahs) >= 114 else merged_surahs

        sources[norm_target] = {
            "read_id": read_id,
            "slug": slug,
            "surahs": surah_val,
            "clean": True
        }

        if is_nested:
            index_data["timing_sources"] = sources
        else:
            index_data = sources

        with open(TIMING_INDEX_FILE, "w", encoding="utf-8") as f:
            json.dump(index_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[!] Warning: failed to update timing_index.json: {e}")

def run_batch_job(job: BatchJob):
    """Executes the batch STT timing job sequentially with live granular progress."""
    job.status = "running"
    if not job.started_at:
        job.started_at = time.time()
    job.log(f"🚀 Started batch alignment for {job.reciter_name} ({job.moshaf_name}) — {job.total_surahs} surahs (Whisper '{job.model_size}').")
    save_jobs_to_disk()
    
    try:
        job.read_id = get_or_create_read_id(job.server_url, job.reciter_name, job.moshaf_name)
        job.log(f"📌 Assigned Read ID #{job.read_id} | Slug: {job.slug}")
        
        # Ensure soar list
        soar_file = os.path.join(SOAR_DIR, f"{job.read_id}.json")
        soar_entries = [{"id": s, "name": f"Surah {s}", "timing_link": f"https://www.mp3quran.net/api/v3/ayat_timing?surah={s}&read={job.read_id}"} for s in range(1, 115)]
        with open(soar_file, "w", encoding="utf-8") as f:
            json.dump(soar_entries, f, ensure_ascii=False, indent=2)

        # Slug directory in timing_clean
        slug_clean_dir = os.path.join(TIMING_CLEAN_DIR, job.slug)
        os.makedirs(slug_clean_dir, exist_ok=True)

        for s_idx, surah_id in enumerate(job.surah_list):
            # Check pause / cancel
            if job._cancel_flag:
                job.status = "cancelled"
                job.finished_at = time.time()
                job.log("⏹️ Batch stopped early due to user cancellation.")
                save_jobs_to_disk()
                return

            while job._pause_flag:
                job.current_phase = "paused"
                job.current_message = "Paused. Waiting to resume..."
                time.sleep(0.5)
                if job._cancel_flag:
                    job.status = "cancelled"
                    job.finished_at = time.time()
                    job.log("⏹️ Batch cancelled while paused.")
                    save_jobs_to_disk()
                    return

            # Skip if already completed (in case of resume/retry)
            if surah_id in job.completed_surahs:
                continue

            job.current_surah = surah_id
            p_surah = f"{surah_id:03d}"
            audio_url = f"{job.server_url}{p_surah}.mp3"
            
            job.current_step = f"Surah {surah_id} ({len(job.completed_surahs) + 1}/{job.total_surahs})"
            job.current_phase = "downloading"
            job.current_surah_pct = 5.0
            job.current_message = f"Downloading audio from {audio_url}..."
            job.log(f"▶ [{len(job.completed_surahs) + 1}/{job.total_surahs}] Processing Surah {surah_id} ({audio_url})...")
            save_jobs_to_disk()

            try:
                # 1. Download audio
                audio_file = download_audio_if_url(audio_url)
                
                # 2. Tanzil text
                job.current_phase = "loading_text"
                job.current_surah_pct = 10.0
                job.current_message = f"Loading canonical text for Surah {surah_id}..."
                verses = load_tanzil_surah(surah_id)
                
                # Progress callback for Whisper
                def on_stt_progress(data: Dict[str, Any]):
                    job.current_phase = "transcribing"
                    job.current_surah_pct = data.get("percent", job.current_surah_pct)
                    job.current_surah_time = data.get("current_time_sec", job.current_surah_time)
                    job.current_surah_total_time = data.get("total_duration_sec", job.current_surah_total_time)
                    job.current_speed = data.get("speed_x", job.current_speed)
                    job.current_words_count = data.get("words_count", job.current_words_count)
                    job.current_last_text = data.get("last_text", job.current_last_text)
                    job.current_message = data.get("message", f"Transcribing Surah {surah_id} on GPU ({job.current_surah_pct:.0f}%)...")

                # 3. Transcribe with Whisper
                job.current_phase = "transcribing"
                job.current_message = f"Transcribing Surah {surah_id} with Whisper ({job.model_size})..."
                stt_words, total_dur = transcribe_audio(
                    audio_file,
                    model_size=job.model_size,
                    progress_callback=on_stt_progress,
                    surah_id=surah_id,
                    verses=verses
                )
                
                # 4. Align
                job.current_phase = "aligning"
                job.current_surah_pct = 96.0
                job.current_message = f"Aligning {len(stt_words)} words with {len(verses)} Tanzil verses..."
                aligned = align_ayah_timings(surah_id, verses, stt_words, total_dur)
                
                # 5. Save DRY Clean JSON in data-mirror
                job.current_phase = "saving"
                job.current_surah_pct = 99.0
                clean_entries = [
                    {
                        "ayah": a["ayah"],
                        "start_time": a["start_time"],
                        "end_time": a["end_time"]
                    }
                    for a in aligned
                ]
                
                # Save into timing/surah/ and timing_clean/<slug>/
                file_dest_surah = os.path.join(TIMING_DIR, f"{job.read_id}_{surah_id}.json")
                file_dest_clean = os.path.join(slug_clean_dir, f"{surah_id}.json")
                
                with open(file_dest_surah, "w", encoding="utf-8") as f:
                    json.dump(clean_entries, f, ensure_ascii=False, indent=2)
                with open(file_dest_clean, "w", encoding="utf-8") as f:
                    json.dump(clean_entries, f, ensure_ascii=False, indent=2)

                job.completed_surahs.append(surah_id)
                if surah_id in job.failed_surahs:
                    del job.failed_surahs[surah_id]

                job.current_surah_pct = 100.0
                job.log(f"✓ Surah {surah_id} completed ({len(clean_entries)} ayahs, {total_dur:.1f}s) -> saved to {job.slug}/{surah_id}.json")
                
                # Update index progressively
                update_timing_index(job.server_url, job.slug, job.read_id, job.completed_surahs)
                save_jobs_to_disk()

            except Exception as surah_err:
                job.failed_surahs[surah_id] = str(surah_err)
                job.log(f"⚠️ Failed Surah {surah_id}: {surah_err}")
                save_jobs_to_disk()
                continue

        if len(job.completed_surahs) == job.total_surahs:
            job.status = "completed"
            job.finished_at = time.time()
            job.current_phase = "completed"
            job.current_message = f"🎉 Successfully aligned all {len(job.completed_surahs)} surahs!"
            job.log(f"🎉 Successfully completed all {len(job.completed_surahs)} surahs for {job.reciter_name}!")
        elif len(job.completed_surahs) > 0:
            job.status = "completed_with_errors" if job.failed_surahs else "completed"
            job.finished_at = time.time()
            job.current_phase = "finished"
            job.log(f"Finished batch: {len(job.completed_surahs)} succeeded, {len(job.failed_surahs)} failed.")
        else:
            job.status = "failed"
            job.finished_at = time.time()
            job.current_phase = "failed"
            job.error = "All surahs in batch failed."
            job.log("❌ All surahs in batch failed.")

        save_jobs_to_disk()
        
    except Exception as e:
        job.status = "failed"
        job.finished_at = time.time()
        job.current_phase = "failed"
        job.error = str(e)
        job.log(f"❌ Critical error during batch: {e}")
        save_jobs_to_disk()

def start_batch_in_background(
    reciter_name: str,
    moshaf_name: str,
    server_url: str,
    surah_list: List[int],
    model_size: str = "turbo",
    slug: Optional[str] = None
) -> str:
    """Spawns background thread for batch job."""
    job_id = f"job_{int(time.time())}_{abs(hash(server_url)) % 10000}"
    job = BatchJob(
        job_id=job_id,
        reciter_name=reciter_name,
        moshaf_name=moshaf_name,
        server_url=server_url,
        surah_list=surah_list,
        model_size=model_size,
        slug=slug
    )
    active_jobs[job_id] = job
    save_jobs_to_disk()
    
    t = threading.Thread(target=run_batch_job, args=(job,), daemon=True)
    job._thread = t
    t.start()
    return job_id

def retry_batch_job(job_id: str) -> bool:
    """Retries failed surahs of a batch job."""
    job = active_jobs.get(job_id)
    if not job:
        return False
        
    if job.status == "running":
        return False

    job._cancel_flag = False
    job._pause_flag = False
    job.status = "running"
    job.error = None
    
    t = threading.Thread(target=run_batch_job, args=(job,), daemon=True)
    job._thread = t
    t.start()
    return True

def delete_batch_job(job_id: str) -> bool:
    """Cancels and removes a batch job from registry."""
    job = active_jobs.get(job_id)
    if not job:
        return False
        
    if job.status == "running":
        job.cancel()
        
    del active_jobs[job_id]
    save_jobs_to_disk()
    return True

def clear_finished_jobs():
    """Removes all completed, cancelled, or failed jobs."""
    to_delete = [j_id for j_id, j in active_jobs.items() if j.status in ["completed", "cancelled", "failed", "completed_with_errors"]]
    for j_id in to_delete:
        del active_jobs[j_id]
    save_jobs_to_disk()
    return len(to_delete)
