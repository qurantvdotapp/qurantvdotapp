import os
import sys
import json
import time
import glob
import tempfile
import subprocess
import urllib.request
import httpx
from typing import Optional, List, Dict, Any, Tuple
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Set UTF-8
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT_DIR, "scripts"))
sys.path.insert(0, os.path.dirname(__file__))

from stt_surah_timings import (
    load_tanzil_surah,
    transcribe_audio,
    align_ayah_timings,
    normalize_arabic,
    BASMALA_CANONICAL
)
from batch_processor import start_batch_in_background, active_jobs
from cloud_adapters import ArchiveOrgAdapter, GitHubAdapter, load_env

app = FastAPI(title="Quran TV — Studio & Cloud Control Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_MIRROR = os.path.join(ROOT_DIR, "web", "data-mirror")
SCRATCH_DIR = os.path.join(ROOT_DIR, "scratch")
os.makedirs(SCRATCH_DIR, exist_ok=True)

# ----------------- Request Models -----------------

class SaveTimingRequest(BaseModel):
    surah_id: int
    read_id: Optional[int] = None
    reciter_name: Optional[str] = None
    entries: List[Dict[str, Any]]
    filename: Optional[str] = None

class BatchStartRequest(BaseModel):
    reciter_name: str
    moshaf_name: str
    server_url: str
    surahs: List[int]
    model_size: str = "turbo"

class ReciterSaveRequest(BaseModel):
    id: Optional[int] = None
    name_ar: str
    name_en: Optional[str] = None
    letter: Optional[str] = None

class MoshafSaveRequest(BaseModel):
    id: Optional[int] = None
    reciter_id: int
    name: str
    server: str
    rewaya_id: int = 1
    moshaf_type: int = 11
    surah_total: int = 114
    surah_list: Optional[str] = None

class ArchiveUploadRequest(BaseModel):
    reciter_id: int
    moshaf_id: int
    surah_id: int
    source_url: str
    bucket_identifier: Optional[str] = None
    title: Optional[str] = None
    creator: Optional[str] = None
    update_moshaf_server: bool = False

class GitHubPublishRequest(BaseModel):
    approved: bool
    commit_message: Optional[str] = None
    target_files: Optional[List[str]] = None

# ----------------- Cloud Connectivity Endpoints -----------------

@app.get("/api/cloud/status")
def get_cloud_status():
    """Check connectivity to Archive.org S3 and GitHub API."""
    load_env()
    ia = ArchiveOrgAdapter()
    gh = GitHubAdapter()

    ia_status = ia.test_connection()
    gh_status = gh.test_connection()

    return {
        "archive_org": ia_status,
        "github": gh_status
    }

# ----------------- Catalog & Metadata Endpoints -----------------

@app.get("/api/surahs")
def get_surahs():
    """Get list of 114 surahs with Arabic and English names + verse counts."""
    suwar_file = os.path.join(DATA_MIRROR, "catalog", "suwar_ar.json")
    suwar_en_file = os.path.join(DATA_MIRROR, "catalog", "suwar_en.json")
    
    ar_map = {}
    if os.path.exists(suwar_file):
        with open(suwar_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            for s in data.get("suwar", []):
                ar_map[s["id"]] = s
                
    en_map = {}
    if os.path.exists(suwar_en_file):
        with open(suwar_en_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            for s in data.get("suwar", []):
                en_map[s["id"]] = s
                
    result = []
    for sid in range(1, 115):
        s_ar = ar_map.get(sid, {})
        s_en = en_map.get(sid, {})
        result.append({
            "id": sid,
            "name_ar": s_ar.get("name", f"سورة {sid}"),
            "name_en": s_en.get("name", f"Surah {sid}"),
            "start_page": s_ar.get("start_page", 1),
            "end_page": s_ar.get("end_page", 1),
            "makkia": s_ar.get("makkia", 1) == 1
        })
    return result

@app.get("/api/surah/{surah_id}/verses")
def get_surah_verses(surah_id: int):
    """Get canonical Tanzil Uthmani verses for a surah."""
    try:
        verses = load_tanzil_surah(surah_id)
        has_basmala = (surah_id >= 2 and surah_id <= 114 and surah_id != 9)
        return {
            "surah_id": surah_id,
            "has_basmala": has_basmala,
            "basmala_text": BASMALA_CANONICAL if has_basmala else None,
            "verses": verses
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/catalog/reciters-with-moshafs")
def get_reciters_with_moshafs():
    """Get all reciters grouped with their multiple moshaf recitations and timed status."""
    try:
        reads_file = os.path.join(DATA_MIRROR, "timing", "reads.json")
        timed_folders = set()
        if os.path.exists(reads_file):
            with open(reads_file, "r", encoding="utf-8") as f:
                reads = json.load(f)
                timed_folders = {r["folder_url"].rstrip("/") + "/" for r in reads if "folder_url" in r}
                
        catalog_file = os.path.join(DATA_MIRROR, "catalog", "reciters_ar.json")
        catalog_en_file = os.path.join(DATA_MIRROR, "catalog", "reciters_en.json")
        
        en_names = {}
        if os.path.exists(catalog_en_file):
            with open(catalog_en_file, "r", encoding="utf-8") as f:
                for r in json.load(f).get("reciters", []):
                    en_names[r["id"]] = r.get("name")
                    
        reciters_list = []
        if os.path.exists(catalog_file):
            with open(catalog_file, "r", encoding="utf-8") as f:
                catalog = json.load(f)
                for r in catalog.get("reciters", []):
                    moshafs = []
                    for m in r.get("moshaf", []):
                        server = m.get("server", "").rstrip("/") + "/"
                        is_timed = server in timed_folders
                        is_archive_org = "archive.org" in server.lower()
                        moshafs.append({
                            "id": m["id"],
                            "name": m["name"],
                            "server": server,
                            "is_timed": is_timed,
                            "is_archive_org": is_archive_org,
                            "rewaya_id": m.get("rewaya_id", 1),
                            "moshaf_type": m.get("moshaf_type", 11),
                            "surah_total": m.get("surah_total", 114),
                            "surah_list": m.get("surah_list")
                        })
                    reciters_list.append({
                        "id": r["id"],
                        "name_ar": r["name"],
                        "name_en": en_names.get(r["id"], r["name"]),
                        "letter": r.get("letter", ""),
                        "moshafs": moshafs
                    })
        return reciters_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/timing/catalog-filter-summary")
def get_catalog_filter_summary():
    """Get high-level summary of all reciters with their timing completeness status."""
    try:
        reciters = get_reciters_with_moshafs()
        reads_file = os.path.join(DATA_MIRROR, "timing", "reads.json")
        reads_map = {}
        if os.path.exists(reads_file):
            with open(reads_file, "r", encoding="utf-8") as f:
                for r in json.load(f):
                    if "folder_url" in r:
                        norm = r["folder_url"].rstrip("/") + "/"
                        reads_map[norm] = r

        clean_dir = os.path.join(DATA_MIRROR, "timing_clean")
        summary_list = []
        for r in reciters:
            has_timing = False
            is_complete = False
            for m in r["moshafs"]:
                srv = m.get("server", "").rstrip("/") + "/"
                slug = reads_map.get(srv, {}).get("slug")
                if slug and os.path.exists(os.path.join(clean_dir, slug)):
                    count = len([f for f in os.listdir(os.path.join(clean_dir, slug)) if f.endswith(".json")])
                    if count > 0:
                        has_timing = True
                    if count >= 114:
                        is_complete = True
            summary_list.append({
                "id": r["id"],
                "has_timing": has_timing,
                "is_complete": is_complete
            })
        return {"reciters": summary_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/catalog/untimed-reciters")
def get_untimed_reciters():
    """Flat list of all untimed moshaf recitations."""
    reciters = get_reciters_with_moshafs()
    flat_untimed = []
    for r in reciters:
        for m in r["moshafs"]:
            if not m["is_timed"]:
                flat_untimed.append({
                    "reciter_id": r["id"],
                    "name_ar": r["name_ar"],
                    "name_en": r["name_en"],
                    "moshaf_id": m["id"],
                    "moshaf_name": m["name"],
                    "server": m["server"],
                    "is_archive_org": m.get("is_archive_org", False),
                    "surah_list": m.get("surah_list")
                })
    return flat_untimed

# ----------------- Reciters & Moshafs CRUD -----------------

@app.post("/api/reciters/save")
def save_reciter(req: ReciterSaveRequest):
    """Create or update a reciter."""
    try:
        catalog_ar_path = os.path.join(DATA_MIRROR, "catalog", "reciters_ar.json")
        catalog_en_path = os.path.join(DATA_MIRROR, "catalog", "reciters_en.json")
        
        with open(catalog_ar_path, "r", encoding="utf-8") as f:
            data_ar = json.load(f)
        with open(catalog_en_path, "r", encoding="utf-8") as f:
            data_en = json.load(f)

        reciters_ar = data_ar.get("reciters", [])
        reciters_en = data_en.get("reciters", [])

        reciter_id = req.id
        if not reciter_id:
            max_id = max([r["id"] for r in reciters_ar] + [0])
            reciter_id = max_id + 1

        # Update or Insert in AR
        found_ar = False
        for r in reciters_ar:
            if r["id"] == reciter_id:
                r["name"] = req.name_ar
                if req.letter:
                    r["letter"] = req.letter
                found_ar = True
                break
        if not found_ar:
            reciters_ar.append({
                "id": reciter_id,
                "name": req.name_ar,
                "letter": req.letter or req.name_ar[0],
                "date": "2026-08-22T00:00:00.000000Z",
                "moshaf": []
            })

        # Update or Insert in EN
        en_name = req.name_en or req.name_ar
        found_en = False
        for r in reciters_en:
            if r["id"] == reciter_id:
                r["name"] = en_name
                if req.letter:
                    r["letter"] = req.letter
                found_en = True
                break
        if not found_en:
            reciters_en.append({
                "id": reciter_id,
                "name": en_name,
                "letter": req.letter or en_name[0].upper(),
                "date": "2026-08-22T00:00:00.000000Z",
                "moshaf": []
            })

        with open(catalog_ar_path, "w", encoding="utf-8") as f:
            json.dump(data_ar, f, ensure_ascii=False, indent=2)
        with open(catalog_en_path, "w", encoding="utf-8") as f:
            json.dump(data_en, f, ensure_ascii=False, indent=2)

        return {"success": True, "id": reciter_id, "name_ar": req.name_ar, "name_en": en_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/reciters/{reciter_id}")
def delete_reciter(reciter_id: int):
    """Delete a reciter from catalogs."""
    try:
        catalog_ar_path = os.path.join(DATA_MIRROR, "catalog", "reciters_ar.json")
        catalog_en_path = os.path.join(DATA_MIRROR, "catalog", "reciters_en.json")
        
        with open(catalog_ar_path, "r", encoding="utf-8") as f:
            data_ar = json.load(f)
        with open(catalog_en_path, "r", encoding="utf-8") as f:
            data_en = json.load(f)

        data_ar["reciters"] = [r for r in data_ar.get("reciters", []) if r["id"] != reciter_id]
        data_en["reciters"] = [r for r in data_en.get("reciters", []) if r["id"] != reciter_id]

        with open(catalog_ar_path, "w", encoding="utf-8") as f:
            json.dump(data_ar, f, ensure_ascii=False, indent=2)
        with open(catalog_en_path, "w", encoding="utf-8") as f:
            json.dump(data_en, f, ensure_ascii=False, indent=2)

        return {"success": True, "deleted_id": reciter_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/moshafs/save")
def save_moshaf(req: MoshafSaveRequest):
    """Create or update a moshaf / recitation for a reciter."""
    try:
        catalog_ar_path = os.path.join(DATA_MIRROR, "catalog", "reciters_ar.json")
        catalog_en_path = os.path.join(DATA_MIRROR, "catalog", "reciters_en.json")

        with open(catalog_ar_path, "r", encoding="utf-8") as f:
            data_ar = json.load(f)
        with open(catalog_en_path, "r", encoding="utf-8") as f:
            data_en = json.load(f)

        moshaf_id = req.id
        if not moshaf_id:
            all_m_ids = []
            for r in data_ar.get("reciters", []):
                for m in r.get("moshaf", []):
                    all_m_ids.append(m["id"])
            moshaf_id = max(all_m_ids + [0]) + 1

        server_url = req.server.rstrip("/") + "/"
        surah_list = req.surah_list or ",".join(str(i) for i in range(1, 115))

        moshaf_obj = {
            "id": moshaf_id,
            "name": req.name,
            "rewaya_id": req.rewaya_id,
            "server": server_url,
            "surah_total": req.surah_total,
            "moshaf_type": req.moshaf_type,
            "surah_list": surah_list
        }

        # Update in AR
        for r in data_ar.get("reciters", []):
            if r["id"] == req.reciter_id:
                if "moshaf" not in r:
                    r["moshaf"] = []
                # Check if exists
                found = False
                for idx, m in enumerate(r["moshaf"]):
                    if m["id"] == moshaf_id:
                        r["moshaf"][idx] = moshaf_obj
                        found = True
                        break
                if not found:
                    r["moshaf"].append(moshaf_obj)
                break

        # Update in EN
        for r in data_en.get("reciters", []):
            if r["id"] == req.reciter_id:
                if "moshaf" not in r:
                    r["moshaf"] = []
                found = False
                for idx, m in enumerate(r["moshaf"]):
                    if m["id"] == moshaf_id:
                        r["moshaf"][idx] = moshaf_obj
                        found = True
                        break
                if not found:
                    r["moshaf"].append(moshaf_obj)
                break

        with open(catalog_ar_path, "w", encoding="utf-8") as f:
            json.dump(data_ar, f, ensure_ascii=False, indent=2)
        with open(catalog_en_path, "w", encoding="utf-8") as f:
            json.dump(data_en, f, ensure_ascii=False, indent=2)

        return {"success": True, "moshaf": moshaf_obj}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ArchiveBatchUploadRequest(BaseModel):
    reciter_id: int
    moshaf_id: int
    bucket_identifier: str
    source_server: str
    surahs: Optional[List[int]] = None
    creator: Optional[str] = None
    title_prefix: Optional[str] = None

# Background Archive Upload Jobs
active_archive_jobs = {}

class ArchiveUploadJob:
    def __init__(self, job_id: str, reciter_id: int, moshaf_id: int, bucket_id: str, source_server: str, surahs: List[int], creator: str):
        self.job_id = job_id
        self.reciter_id = reciter_id
        self.moshaf_id = moshaf_id
        self.bucket_id = bucket_id
        self.source_server = source_server.rstrip("/") + "/"
        self.surahs = surahs
        self.creator = creator
        self.status = "queued"
        self.current_surah = 0
        self.completed_surahs = []
        self.failed_surahs = []
        self.total_surahs = len(surahs)
        self.logs = []
        self.is_cancelled = False
        self.start_time = time.time()
        self.bytes_uploaded = 0
        self.end_time = None

    def log(self, msg: str):
        self.logs.append(msg)
        print(f"[Archive-Job {self.job_id}] {msg}")

    def run(self):
        self.status = "running"
        self.start_time = time.time()
        self.log(f"Starting batch upload for {self.total_surahs} surahs to Archive.org item '{self.bucket_id}'...")
        ia = ArchiveOrgAdapter()

        audio_cache_dir = os.path.join(SCRATCH_DIR, "audio", self.bucket_id)
        os.makedirs(audio_cache_dir, exist_ok=True)

        for s_id in self.surahs:
            if self.is_cancelled:
                self.status = "cancelled"
                self.end_time = time.time()
                self.log("Batch upload cancelled by user.")
                return

            self.current_surah = s_id
            fname = f"{str(s_id).zfill(3)}.mp3"
            source_url = f"{self.source_server}{fname}"
            local_path = os.path.join(audio_cache_dir, fname)

            self.log(f"[{len(self.completed_surahs)+1}/{self.total_surahs}] Downloading Surah {s_id} ({fname})...")
            try:
                # 1. Download locally if not already cached
                if not os.path.exists(local_path) or os.path.getsize(local_path) < 1000:
                    req = urllib.request.Request(source_url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(req, timeout=60) as resp, open(local_path, "wb") as f:
                        f.write(resp.read())

                with open(local_path, "rb") as f:
                    file_bytes = f.read()

                # 2. Upload to Archive.org
                self.log(f"Uploading Surah {s_id} ({len(file_bytes)/1024/1024:.2f} MB) to Archive.org...")
                res = ia.upload_file(
                    bucket_identifier=self.bucket_id,
                    filename=fname,
                    file_bytes=file_bytes,
                    title=f"Surah {s_id} - {self.creator}",
                    creator=self.creator,
                    description=f"Surah {s_id} recited by {self.creator} hosted on Archive.org for Quran TV."
                )
                self.bytes_uploaded += len(file_bytes)
                self.completed_surahs.append(s_id)
                self.log(f"✓ Surah {s_id} uploaded successfully -> {res['download_url']}")
            except Exception as e:
                err_msg = f"Failed Surah {s_id}: {str(e)}"
                self.failed_surahs.append({"surah_id": s_id, "error": str(e)})
                self.log(f"✗ {err_msg}")

        # Update moshaf server URL
        try:
            archive_server = f"https://archive.org/download/{self.bucket_id}/"
            save_moshaf(MoshafSaveRequest(
                id=self.moshaf_id,
                reciter_id=self.reciter_id,
                name=f"Rewayat - {self.bucket_id}",
                server=archive_server
            ))
            self.log(f"Updated Moshaf #{self.moshaf_id} server to Archive.org: {archive_server}")
        except Exception as e:
            self.log(f"Warning: could not auto-update catalog server: {e}")

        self.end_time = time.time()
        self.status = "completed" if not self.failed_surahs else "completed_with_errors"
        self.log(f"Batch completed! {len(self.completed_surahs)}/{self.total_surahs} uploaded successfully.")

# ----------------- Archive.org Audio Upload & Mirroring -----------------

@app.post("/api/archive/upload-surah")
def upload_surah_to_archive(req: ArchiveUploadRequest):
    """
    Download audio track for a surah, cache locally, and upload it to an Archive.org item.
    Returns direct streaming CDN URL and item URL.
    Optionally updates the Moshaf server URL to point to Archive.org.
    """
    try:
        ia = ArchiveOrgAdapter()
        if not ia.is_configured:
            raise HTTPException(status_code=400, detail="Archive.org credentials not configured in .env")

        filename = f"{str(req.surah_id).zfill(3)}.mp3"
        item_id = req.bucket_identifier or f"qurantvapp-reciter-{req.reciter_id}-moshaf-{req.moshaf_id}"

        # 1. Download file to local scratch audio cache
        audio_cache_dir = os.path.join(SCRATCH_DIR, "audio", item_id)
        os.makedirs(audio_cache_dir, exist_ok=True)
        local_path = os.path.join(audio_cache_dir, filename)

        source_audio_url = req.source_url.rstrip("/") + "/" + filename

        headers = {"User-Agent": "Mozilla/5.0"}
        download_req = urllib.request.Request(source_audio_url, headers=headers)
        with urllib.request.urlopen(download_req, timeout=60) as resp, open(local_path, "wb") as f:
            f.write(resp.read())

        with open(local_path, "rb") as f:
            file_bytes = f.read()

        # 2. Upload to Archive.org
        title = req.title or f"Quran Surah {req.surah_id}"
        creator = req.creator or f"Quran TV Reciter {req.reciter_id}"
        desc = f"Quran recitation audio stream for Surah {req.surah_id} hosted on Archive.org for Quran TV."

        upload_res = ia.upload_file(
            bucket_identifier=item_id,
            filename=filename,
            file_bytes=file_bytes,
            title=title,
            creator=creator,
            description=desc
        )

        # 3. Optional update of Moshaf server URL
        if req.update_moshaf_server:
            archive_server_url = f"https://archive.org/download/{item_id}/"
            # Update moshaf
            moshaf_req = MoshafSaveRequest(
                id=req.moshaf_id,
                reciter_id=req.reciter_id,
                name=title,
                server=archive_server_url
            )
            save_moshaf(moshaf_req)

        return {
            "success": True,
            "bucket": item_id,
            "filename": filename,
            "download_url": upload_res["download_url"],
            "item_url": upload_res["item_url"],
            "size_bytes": len(file_bytes),
            "local_path": local_path
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/archive/upload-mushaf-batch")
def start_archive_mushaf_batch(req: ArchiveBatchUploadRequest):
    """Start full or partial mushaf batch upload to Archive.org."""
    import uuid
    import threading

    job_id = f"ia_batch_{uuid.uuid4().hex[:8]}"
    surahs = req.surahs or list(range(1, 115))
    creator = req.creator or f"Reciter {req.reciter_id}"

    job = ArchiveUploadJob(
        job_id=job_id,
        reciter_id=req.reciter_id,
        moshaf_id=req.moshaf_id,
        bucket_id=req.bucket_identifier,
        source_server=req.source_server,
        surahs=surahs,
        creator=creator
    )
    active_archive_jobs[job_id] = job

    thread = threading.Thread(target=job.run, daemon=True)
    thread.start()

    return {
        "success": True,
        "job_id": job_id,
        "bucket_identifier": req.bucket_identifier,
        "total_surahs": len(surahs)
    }

@app.get("/api/archive/batch-status/{job_id}")
def get_archive_batch_status(job_id: str):
    """Get live progress of Archive.org mushaf batch upload with speed, elapsed, and remaining ETA metrics."""
    job = active_archive_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    now = job.end_time or time.time()
    elapsed_sec = max(1, int(now - job.start_time))
    bytes_uploaded = job.bytes_uploaded
    completed_count = len(job.completed_surahs)
    total_surahs = max(1, job.total_surahs)

    pct = round((completed_count / total_surahs) * 100, 1)

    # Average speed
    speed_bps = bytes_uploaded / elapsed_sec
    speed_mb_s = round(speed_bps / (1024 * 1024), 2)
    speed_str = f"{speed_mb_s} MB/s" if speed_mb_s >= 0.1 else f"{round(speed_bps / 1024, 1)} KB/s"

    # ETA Calculation
    if completed_count > 0 and pct < 100:
        avg_bytes_per_surah = bytes_uploaded / completed_count
        remaining_surahs = total_surahs - completed_count
        est_remaining_bytes = remaining_surahs * avg_bytes_per_surah
        remaining_sec = int(est_remaining_bytes / max(1000, speed_bps))
        est_total_mb = round((bytes_uploaded + est_remaining_bytes) / (1024 * 1024), 1)
    else:
        remaining_sec = 0
        est_total_mb = round(bytes_uploaded / (1024 * 1024), 1)

    def fmt_dur(s):
        m, sec = divmod(int(s), 60)
        h, m = divmod(m, 60)
        return f"{h:02d}:{m:02d}:{sec:02d}" if h > 0 else f"{m:02d}:{sec:02d}"

    return {
        "job_id": job.job_id,
        "status": job.status,
        "bucket_id": job.bucket_id,
        "current_surah": job.current_surah,
        "completed_count": completed_count,
        "total_surahs": total_surahs,
        "failed_count": len(job.failed_surahs),
        "failed_surahs": job.failed_surahs,
        "percent": pct,
        "metrics": {
            "elapsed_sec": elapsed_sec,
            "elapsed_str": fmt_dur(elapsed_sec),
            "remaining_sec": remaining_sec,
            "remaining_str": fmt_dur(remaining_sec) if pct < 100 and job.status == "running" else "00:00",
            "speed_bps": speed_bps,
            "speed_str": speed_str,
            "uploaded_mb": round(bytes_uploaded / (1024 * 1024), 2),
            "estimated_total_mb": est_total_mb
        },
        "logs": job.logs[-20:],
        "download_base": f"https://archive.org/download/{job.bucket_id}/",
        "item_url": f"https://archive.org/details/{job.bucket_id}"
    }

# ----------------- Local Audio Serving & Auto-Detection -----------------

@app.get("/api/audio/status")
def get_local_audio_status(bucket: str, surah: int):
    """Check if local audio track is cached for immediate playback and STT."""
    filename = f"{str(surah).zfill(3)}.mp3"
    candidates = [
        os.path.join(SCRATCH_DIR, "audio", bucket, filename),
        os.path.join(SCRATCH_DIR, f"temp_{bucket}_{filename}"),
        os.path.join(SCRATCH_DIR, f"surah_{surah}_{filename}"),
        os.path.join(SCRATCH_DIR, f"surah_{surah}_{bucket}_{filename}")
    ]

    for p in candidates:
        if os.path.exists(p) and os.path.getsize(p) > 1000:
            return {
                "available": True,
                "local_path": p,
                "local_url": f"/api/audio/file?bucket={bucket}&surah={surah}",
                "size_bytes": os.path.getsize(p),
                "size_mb": round(os.path.getsize(p) / (1024 * 1024), 2)
            }

    return {
        "available": False,
        "local_url": None,
        "size_bytes": 0
    }

@app.get("/api/audio/file")
def get_local_audio_file(bucket: str, surah: int):
    """Serve cached local audio file with range headers for fast HTML5 audio seeking."""
    from fastapi.responses import FileResponse
    filename = f"{str(surah).zfill(3)}.mp3"
    candidates = [
        os.path.join(SCRATCH_DIR, "audio", bucket, filename),
        os.path.join(SCRATCH_DIR, f"temp_{bucket}_{filename}"),
        os.path.join(SCRATCH_DIR, f"surah_{surah}_{filename}"),
        os.path.join(SCRATCH_DIR, f"surah_{surah}_{bucket}_{filename}")
    ]

    for p in candidates:
        if os.path.exists(p) and os.path.getsize(p) > 1000:
            return FileResponse(p, media_type="audio/mpeg")

    raise HTTPException(status_code=404, detail="Audio file not cached locally")

@app.post("/api/archive/cancel-batch/{job_id}")
def cancel_archive_batch(job_id: str):
    job = active_archive_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.is_cancelled = True
    return {"success": True, "status": "cancelling"}

# ----------------- Single Surah STT Processing with Live Progress -----------------

active_stt_jobs = {}

class STTJob:
    def __init__(self, job_id: str, surah_id: int, model_size: str, audio_path: str):
        self.job_id = job_id
        self.surah_id = surah_id
        self.model_size = model_size
        self.audio_path = audio_path
        self.status = "queued"
        self.percent = 0.0
        self.current_time_sec = 0.0
        self.total_duration_sec = 0.0
        self.speed_x = "1.0x"
        self.words_count = 0
        self.last_text = ""
        self.message = "Initializing STT..."
        self.entries = []
        self.error = None

    def on_progress(self, data: Dict[str, Any]):
        self.percent = data.get("percent", self.percent)
        self.current_time_sec = data.get("current_time_sec", self.current_time_sec)
        self.total_duration_sec = data.get("total_duration_sec", self.total_duration_sec)
        self.speed_x = data.get("speed_x", self.speed_x)
        self.words_count = data.get("words_count", self.words_count)
        self.last_text = data.get("last_text", self.last_text)
        if "message" in data:
            self.message = data["message"]

    def run(self):
        try:
            self.status = "running"
            self.message = "Transcribing with Faster-Whisper..."
            verses = load_tanzil_surah(self.surah_id)
            stt_words, total_dur = transcribe_audio(
                self.audio_path,
                model_size=self.model_size,
                progress_callback=self.on_progress,
                surah_id=self.surah_id,
                verses=verses
            )
            self.message = "Aligning with Tanzil Uthmani verses..."
            aligned = align_ayah_timings(self.surah_id, verses, stt_words, total_dur)
            verse_map = {v["ayah"]: v["text_uthmani"] for v in verses}
            for item in aligned:
                item["text"] = BASMALA_CANONICAL if item["ayah"] == 0 else verse_map.get(item["ayah"], "")
                item["duration_ms"] = item["end_time"] - item["start_time"]

            self.entries = aligned
            self.total_duration_sec = total_dur
            self.percent = 100.0
            self.status = "completed"
            self.message = "Completed successfully"
        except Exception as e:
            self.status = "error"
            self.error = str(e)
            self.message = f"Failed: {str(e)}"
            import traceback
            traceback.print_exc()

def resolve_local_audio_path(url_or_path: str, surah_id: int) -> Optional[str]:
    """Check if URL or path points to a locally cached audio track."""
    if not url_or_path:
        return None
    if os.path.exists(url_or_path) and os.path.getsize(url_or_path) > 1000:
        return url_or_path
    if "api/audio/file" in url_or_path or "bucket=" in url_or_path:
        import urllib.parse
        parsed = urllib.parse.urlparse(url_or_path)
        qs = urllib.parse.parse_qs(parsed.query)
        bucket = qs.get("bucket", [""])[0]
        s_val = qs.get("surah", [str(surah_id)])[0]
        try:
            surah = int(s_val)
        except Exception:
            surah = surah_id
        filename = f"{surah:03d}.mp3"
        candidates = [
            os.path.join(SCRATCH_DIR, "audio", bucket, filename),
            os.path.join(SCRATCH_DIR, f"temp_{bucket}_{filename}"),
            os.path.join(SCRATCH_DIR, f"surah_{surah}_{filename}"),
            os.path.join(SCRATCH_DIR, f"surah_{surah}_{bucket}_{filename}")
        ]
        for p in candidates:
            if os.path.exists(p) and os.path.getsize(p) > 1000:
                return p
    return None

@app.post("/api/process-timing/start")
async def start_process_timing(
    surah_id: int = Form(...),
    model_size: str = Form("turbo"),
    audio_url: Optional[str] = Form(None),
    source_url: Optional[str] = Form(None),
    audio_file: Optional[UploadFile] = File(None)
):
    """Start background faster-whisper STT processing with real-time progress updates."""
    import uuid
    import threading

    local_audio_path = None
    if audio_file:
        ext = os.path.splitext(audio_file.filename)[1] or ".mp3"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext, dir=SCRATCH_DIR)
        content = await audio_file.read()
        tmp.write(content)
        tmp.close()
        local_audio_path = tmp.name
    elif audio_url or source_url:
        urls_to_try = [u for u in [audio_url, source_url] if u]
        
        # First check if any URL resolves to a local file immediately
        for u in urls_to_try:
            resolved = resolve_local_audio_path(u, surah_id)
            if resolved:
                local_audio_path = resolved
                break

        if not local_audio_path:
            download_success = False
            last_err = None

            cache_dir = os.path.join(SCRATCH_DIR, "audio_cache")
            os.makedirs(cache_dir, exist_ok=True)

            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "*/*"
            }
            for u in urls_to_try:
                try:
                    import hashlib
                    url_hash = hashlib.sha256(u.encode('utf-8')).hexdigest()[:12]
                    clean_name = os.path.basename(u.split('?')[0])
                    if not clean_name.endswith(".mp3"):
                        clean_name = f"{surah_id:03d}.mp3"
                    candidate_path = os.path.join(cache_dir, f"{url_hash}_{clean_name}")
                    
                    if os.path.exists(candidate_path) and os.path.getsize(candidate_path) > 10000:
                        local_audio_path = candidate_path
                        download_success = True
                        break

                    tmp_download_path = candidate_path + ".tmp"
                    with httpx.Client(timeout=60.0, follow_redirects=True, headers=headers) as client:
                        with client.stream("GET", u) as response:
                            if response.status_code != 200:
                                last_err = f"HTTP {response.status_code} from {u}"
                                continue
                            with open(tmp_download_path, "wb") as f:
                                for chunk in response.iter_bytes(chunk_size=65536):
                                    if chunk:
                                        f.write(chunk)

                    if os.path.exists(tmp_download_path) and os.path.getsize(tmp_download_path) > 10000:
                        if os.path.exists(candidate_path):
                            os.remove(candidate_path)
                        os.rename(tmp_download_path, candidate_path)
                        local_audio_path = candidate_path
                        download_success = True
                        break
                    else:
                        if os.path.exists(tmp_download_path):
                            os.remove(tmp_download_path)
                        last_err = "Downloaded audio file is too small or incomplete"
                except Exception as e:
                    last_err = str(e)
                    continue

            if not download_success:
                raise HTTPException(status_code=400, detail=f"Could not download audio: {str(last_err)}")
    else:
        raise HTTPException(status_code=400, detail="Either audio_url, source_url, or audio_file must be provided")

    job_id = f"stt_{uuid.uuid4().hex[:8]}"
    job = STTJob(job_id, surah_id, model_size, local_audio_path)
    active_stt_jobs[job_id] = job

    thread = threading.Thread(target=job.run, daemon=True)
    thread.start()

    return {
        "success": True,
        "job_id": job_id,
        "surah_id": surah_id
    }

@app.get("/api/process-timing/status/{job_id}")
def get_stt_job_status(job_id: str):
    """Poll live progress of Faster-Whisper transcription."""
    job = active_stt_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="STT job not found")

    return {
        "job_id": job.job_id,
        "surah_id": job.surah_id,
        "status": job.status,
        "percent": job.percent,
        "current_time_sec": job.current_time_sec,
        "total_duration_sec": job.total_duration_sec,
        "speed_x": job.speed_x,
        "words_count": job.words_count,
        "last_text": job.last_text,
        "message": job.message,
        "error": job.error,
        "entries": job.entries
    }

@app.post("/api/process-timing")
async def process_timing(
    surah_id: int = Form(...),
    model_size: str = Form("base"),
    audio_url: Optional[str] = Form(None),
    source_url: Optional[str] = Form(None),
    audio_file: Optional[UploadFile] = File(None)
):
    """Process single audio synchronously (backward-compatible fallback)."""
    try:
        local_audio_path = None
        if audio_file:
            ext = os.path.splitext(audio_file.filename)[1] or ".mp3"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext, dir=SCRATCH_DIR)
            content = await audio_file.read()
            tmp.write(content)
            tmp.close()
            local_audio_path = tmp.name
        elif audio_url or source_url:
            urls_to_try = [u for u in [audio_url, source_url] if u]
            for u in urls_to_try:
                resolved = resolve_local_audio_path(u, surah_id)
                if resolved:
                    local_audio_path = resolved
                    break

            if not local_audio_path:
                download_success = False
                last_err = None

                cache_dir = os.path.join(SCRATCH_DIR, "audio_cache")
                os.makedirs(cache_dir, exist_ok=True)

                for u in urls_to_try:
                    try:
                        import hashlib
                        url_hash = hashlib.sha256(u.encode('utf-8')).hexdigest()[:12]
                        clean_name = os.path.basename(u.split('?')[0])
                        if not clean_name.endswith(".mp3"):
                            clean_name = f"{surah_id:03d}.mp3"
                        local_audio_path = os.path.join(cache_dir, f"{url_hash}_{clean_name}")
                        
                        if os.path.exists(local_audio_path) and os.path.getsize(local_audio_path) > 1000:
                            download_success = True
                            break

                        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
                        with urllib.request.urlopen(req, timeout=45) as resp, open(local_audio_path, "wb") as f:
                            f.write(resp.read())
                        download_success = True
                        break
                    except Exception as e:
                        last_err = e
                        continue

                if not download_success:
                    raise RuntimeError(f"Could not download audio from provided URLs ({urls_to_try}): {str(last_err)}")
        else:
            raise HTTPException(status_code=400, detail="Either audio_url, source_url, or audio_file must be provided")

        verses = load_tanzil_surah(surah_id)
        stt_words, total_dur = transcribe_audio(
            local_audio_path,
            model_size=model_size,
            surah_id=surah_id,
            verses=verses
        )
        aligned = align_ayah_timings(surah_id, verses, stt_words, total_dur)
        
        verse_map = {v["ayah"]: v["text_uthmani"] for v in verses}
        for item in aligned:
            item["text"] = BASMALA_CANONICAL if item["ayah"] == 0 else verse_map.get(item["ayah"], "")
            item["duration_ms"] = item["end_time"] - item["start_time"]
            
        return {
            "success": True,
            "surah_id": surah_id,
            "total_duration_sec": total_dur,
            "total_words_transcribed": len(stt_words),
            "entries": aligned
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

REVIEWS_FILE = os.path.join(DATA_MIRROR, "timing", "reviews.json")

def get_timing_review_status(reciter_id: int, moshaf_id: Optional[int], surah_id: int) -> Dict[str, Any]:
    """Retrieve review verification status for a specific surah timing."""
    if not os.path.exists(REVIEWS_FILE):
        return {"reviewed": False}
    try:
        with open(REVIEWS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        k1 = f"{reciter_id}_{moshaf_id}_{surah_id}" if moshaf_id else None
        k2 = f"{reciter_id}_{surah_id}"
        info = (data.get(k1) if k1 else None) or data.get(k2)
        if info:
            return info
    except Exception:
        pass
    return {"reviewed": False}

def set_timing_review_status(
    reciter_id: int,
    moshaf_id: Optional[int],
    surah_id: int,
    reviewed: bool = True,
    slug: Optional[str] = None,
    ayah_count: Optional[int] = None,
    total_duration_sec: Optional[float] = None
) -> Dict[str, Any]:
    """Set and persist review verification status for a specific surah timing."""
    os.makedirs(os.path.dirname(REVIEWS_FILE), exist_ok=True)
    data = {}
    if os.path.exists(REVIEWS_FILE):
        try:
            with open(REVIEWS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}

    import datetime
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    key1 = f"{reciter_id}_{moshaf_id}_{surah_id}" if moshaf_id else f"{reciter_id}_{surah_id}"
    key2 = f"{reciter_id}_{surah_id}"

    info = {
        "key": key1,
        "reciter_id": reciter_id,
        "moshaf_id": moshaf_id or reciter_id,
        "surah_id": surah_id,
        "slug": slug,
        "reviewed": reviewed,
        "reviewed_at": now_iso if reviewed else None,
        "ayah_count": ayah_count,
        "total_duration_sec": total_duration_sec
    }

    data[key1] = info
    if key2 != key1:
        data[key2] = info

    with open(REVIEWS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return info

class SaveTimingRequest(BaseModel):
    surah_id: int
    read_id: int
    reciter_id: Optional[int] = None
    moshaf_id: Optional[int] = None
    slug: Optional[str] = None
    entries: List[Dict[str, Any]]
    reviewed: bool = True

class SingleTimingPublishRequest(BaseModel):
    surah_id: int
    read_id: int
    reciter_id: int
    moshaf_id: Optional[int] = None
    slug: Optional[str] = None
    reciter_name: Optional[str] = None
    moshaf_name: Optional[str] = None
    entries: List[Dict[str, Any]]
    reviewed: bool = True
    commit_message: Optional[str] = None

@app.get("/api/timing/{reciter_id}/{surah_id}")
def get_existing_timing(reciter_id: int, surah_id: int, moshaf_id: Optional[int] = None, slug: Optional[str] = None):
    """
    Fetch existing timing for a reciter and specific moshaf / recitation.
    Supports both subfolder structure (timing_clean/{slug}/{surah_id}.json) and flat filenames.
    Guarantees isolation between different recitations (e.g. Hafs vs Qalon vs Warsh).
    """
    try:
        candidates = []

        # 0. If slug not provided, try to find slug for reciter_id / moshaf_id
        resolved_slug = slug
        if not resolved_slug:
            reads_file = os.path.join(DATA_MIRROR, "timing", "reads.json")
            if os.path.exists(reads_file):
                try:
                    with open(reads_file, "r", encoding="utf-8") as rf:
                        for r in json.load(rf):
                            if r.get("id") == reciter_id or r.get("id") == moshaf_id:
                                resolved_slug = r.get("slug")
                                break
                except Exception:
                    pass

        if resolved_slug:
            # Dedicated slug folder for this reading (Primary)
            candidates.append(os.path.join(DATA_MIRROR, "timing_clean", resolved_slug, f"{surah_id}.json"))
            candidates.append(os.path.join(DATA_MIRROR, "timing", resolved_slug, f"{surah_id}.json"))
            candidates.append(os.path.join(DATA_MIRROR, "timing_clean", f"{resolved_slug}_{surah_id}.json"))
            candidates.append(os.path.join(DATA_MIRROR, "timing", "surah", f"{resolved_slug}_{surah_id}.json"))

        # Also search timing_clean directories for any folder matching the reciter slug prefix
        if slug:
            clean_dir = os.path.join(DATA_MIRROR, "timing_clean")
            if os.path.exists(clean_dir):
                for d in os.listdir(clean_dir):
                    if os.path.isdir(os.path.join(clean_dir, d)):
                        # If slug prefix matches or directory ends with similar name
                        if d.startswith(slug) or slug.startswith(d) or (slug.replace("-akda-", "-akdar-") == d):
                            candidates.append(os.path.join(clean_dir, d, f"{surah_id}.json"))

        if moshaf_id:
            candidates.append(os.path.join(DATA_MIRROR, "timing_clean", f"{reciter_id}_{moshaf_id}_{surah_id}.json"))
            candidates.append(os.path.join(DATA_MIRROR, "timing", "surah", f"{reciter_id}_{moshaf_id}_{surah_id}.json"))

        # Check reciter-level timing only if moshaf_id is not specified or matches reciter default
        if not moshaf_id or moshaf_id == reciter_id:
            candidates.append(os.path.join(DATA_MIRROR, "timing_clean", f"{reciter_id}_{surah_id}.json"))
            candidates.append(os.path.join(DATA_MIRROR, "timing", "surah", f"{reciter_id}_{surah_id}.json"))

        target_path = None
        for p in candidates:
            if os.path.exists(p):
                target_path = p
                break

        verses = load_tanzil_surah(surah_id)
        verse_map = {v["ayah"]: v["text_uthmani"] for v in verses}

        review_status = get_timing_review_status(reciter_id, moshaf_id, surah_id)

        if target_path:
            with open(target_path, "r", encoding="utf-8") as f:
                raw_entries = json.load(f)
            
            entries = []
            if raw_entries and isinstance(raw_entries[0], (int, float)):
                # Flat number array
                if len(raw_entries) % 3 == 0:
                    for i in range(0, len(raw_entries), 3):
                        ayah_num = int(raw_entries[i])
                        st = int(raw_entries[i+1])
                        et = int(raw_entries[i+2])
                        text = BASMALA_CANONICAL if ayah_num == 0 else verse_map.get(ayah_num, "")
                        entries.append({
                            "ayah": ayah_num,
                            "start_time": st,
                            "end_time": et,
                            "duration_ms": et - st,
                            "text": text
                        })
                else:
                    ayah_num = 1
                    for i in range(0, len(raw_entries), 2):
                        st = int(raw_entries[i])
                        et = int(raw_entries[i+1])
                        text = verse_map.get(ayah_num, "")
                        entries.append({
                            "ayah": ayah_num,
                            "start_time": st,
                            "end_time": et,
                            "duration_ms": et - st,
                            "text": text
                        })
                        ayah_num += 1
            else:
                for e in raw_entries:
                    ayah_num = e.get("ayah", 0)
                    text = BASMALA_CANONICAL if ayah_num == 0 else verse_map.get(ayah_num, "")
                    entries.append({
                        "ayah": ayah_num,
                        "start_time": e.get("start_time", 0),
                        "end_time": e.get("end_time", 0),
                        "duration_ms": e.get("end_time", 0) - e.get("start_time", 0),
                        "text": text
                    })
            
            max_end = max([e["end_time"] for e in entries] + [0])
            dur_sec = round(max_end / 1000, 2)

            # Check if this timing file exists on remote GitHub branch
            is_pushed = False
            gh_url = None
            try:
                gh = GitHubAdapter()
                if gh.is_configured and target_path:
                    rel_p = os.path.relpath(target_path, ROOT_DIR).replace("\\", "/")
                    if gh.check_file_exists(rel_p):
                        is_pushed = True
                        gh_url = f"https://github.com/{gh.repo}/blob/{gh.branch}/{rel_p}"
            except Exception:
                pass

            return {
                "exists": True,
                "surah_id": surah_id,
                "reciter_id": reciter_id,
                "moshaf_id": moshaf_id,
                "source_file": os.path.basename(target_path),
                "total_duration_sec": dur_sec,
                "reviewed": review_status.get("reviewed", False),
                "review_info": review_status,
                "pushed_to_github": is_pushed,
                "github_url": gh_url,
                "entries": entries
            }
        else:
            return {
                "exists": False,
                "surah_id": surah_id,
                "reciter_id": reciter_id,
                "moshaf_id": moshaf_id,
                "reviewed": False,
                "review_info": review_status,
                "entries": []
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save-timing")
def save_timing(req: SaveTimingRequest):
    """Save clean timing JSON to disk in local staging with Moshaf isolation and review status."""
    try:
        timing_clean_dir = os.path.join(DATA_MIRROR, "timing_clean")
        timing_surah_dir = os.path.join(DATA_MIRROR, "timing", "surah")
        os.makedirs(timing_clean_dir, exist_ok=True)
        os.makedirs(timing_surah_dir, exist_ok=True)

        clean_entries = []
        for e in req.entries:
            clean_entries.append({
                "ayah": e["ayah"],
                "start_time": e["start_time"],
                "end_time": e["end_time"]
            })

        max_end = max([e["end_time"] for e in clean_entries] + [0])
        dur_sec = round(max_end / 1000.0, 2)

        # Save only to canonical slug folder: timing_clean/{slug}/{surah_id}.json
        if req.slug:
            slug_clean_dir = os.path.join(timing_clean_dir, req.slug)
            os.makedirs(slug_clean_dir, exist_ok=True)
            with open(os.path.join(slug_clean_dir, f"{req.surah_id}.json"), "w", encoding="utf-8") as f:
                json.dump(clean_entries, f, indent=2)
        else:
            # Fallback only if no slug provided
            m_id = req.moshaf_id or req.read_id
            filename = f"{req.read_id}_{m_id}_{req.surah_id}.json" if (m_id and m_id != req.read_id) else f"{req.read_id}_{req.surah_id}.json"
            file_clean_path = os.path.join(timing_clean_dir, filename)
            with open(file_clean_path, "w", encoding="utf-8") as f:
                json.dump(clean_entries, f, indent=2)

        # Update review status
        rec_id = req.reciter_id or req.read_id
        review_info = set_timing_review_status(
            reciter_id=rec_id,
            moshaf_id=req.moshaf_id,
            surah_id=req.surah_id,
            reviewed=req.reviewed,
            slug=req.slug,
            ayah_count=len(clean_entries),
            total_duration_sec=dur_sec
        )

        return {
            "success": True,
            "filename": filename,
            "count": len(clean_entries),
            "reviewed": req.reviewed,
            "review_info": review_info
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/timing/publish-single")
def publish_single_timing(req: SingleTimingPublishRequest):
    """
    Save and publish timing for a specific surah & mushaf directly to GitHub.
    Marks timing as reviewed, updates reads/soar metadata, and pushes via GitHub Git Data API.
    """
    try:
        gh = GitHubAdapter()
        if not gh.is_configured:
            raise HTTPException(status_code=400, detail="GitHub token or repository not configured in .env")

        timing_clean_dir = os.path.join(DATA_MIRROR, "timing_clean")
        timing_surah_dir = os.path.join(DATA_MIRROR, "timing", "surah")
        soar_dir = os.path.join(DATA_MIRROR, "timing", "soar")
        os.makedirs(timing_clean_dir, exist_ok=True)
        os.makedirs(timing_surah_dir, exist_ok=True)
        os.makedirs(soar_dir, exist_ok=True)

        # Pure flat number array: [ayah, start_time, end_time, ...]
        flat_numbers = []
        for e in req.entries:
            flat_numbers.extend([int(e["ayah"]), int(e["start_time"]), int(e["end_time"])])

        max_end = max([e["end_time"] for e in req.entries] + [0])
        dur_sec = round(max_end / 1000.0, 2)

        compact_content_str = json.dumps(flat_numbers, separators=(",", ":"))

        # Save directly to canonical timing_clean/<slug>/<surah>.json
        slug_clean_path = None
        if req.slug:
            slug_dir = os.path.join(timing_clean_dir, req.slug)
            os.makedirs(slug_dir, exist_ok=True)
            slug_clean_path = os.path.join(slug_dir, f"{req.surah_id}.json")
            with open(slug_clean_path, "w", encoding="utf-8") as f:
                f.write(compact_content_str)

        # 2. Update reviews.json
        review_info = set_timing_review_status(
            reciter_id=req.reciter_id,
            moshaf_id=req.moshaf_id,
            surah_id=req.surah_id,
            reviewed=req.reviewed,
            slug=req.slug,
            ayah_count=len(req.entries),
            total_duration_sec=dur_sec
        )

        # 3. Ensure reads.json & soar metadata (update or create slug)
        reads_file = os.path.join(DATA_MIRROR, "timing", "reads.json")
        soar_file = os.path.join(soar_dir, f"{req.read_id}.json")
        if os.path.exists(reads_file):
            try:
                with open(reads_file, "r", encoding="utf-8") as f:
                    reads_list = json.load(f)
                
                updated = False
                for r in reads_list:
                    if r.get("id") == req.read_id:
                        if req.slug:
                            r["slug"] = req.slug
                        updated = True
                        break
                
                if not updated and req.reciter_name:
                    reads_list.append({
                        "id": req.read_id,
                        "name": req.reciter_name,
                        "rewaya": req.moshaf_name or "حفص عن عاصم",
                        "folder_url": f"https://archive.org/download/{req.slug}/" if req.slug else "",
                        "soar_count": 114,
                        "soar_link": f"https://www.mp3quran.net/api/v3/ayat_timing/soar?read={req.read_id}",
                        "slug": req.slug
                    })
                
                with open(reads_file, "w", encoding="utf-8") as f:
                    json.dump(reads_list, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print("Reads update warning:", e)

        # 4. Regenerate timing_index.json so GitHub always has the complete up-to-date index
        generate_timing_index_data()
        timing_index_file = os.path.join(DATA_MIRROR, "timing_index.json")

        # 5. Prepare files to commit for GitHub
        files_to_commit = []
        target_local_files = [REVIEWS_FILE, reads_file, timing_index_file]
        
        if slug_clean_path:
            target_local_files.append(slug_clean_path)
        else:
            # Fallback only if no slug
            m_id = req.moshaf_id or req.read_id
            filename = f"{req.read_id}_{m_id}_{req.surah_id}.json" if (m_id and m_id != req.read_id) else f"{req.read_id}_{req.surah_id}.json"
            file_clean_path = os.path.join(timing_clean_dir, filename)
            with open(file_clean_path, "w", encoding="utf-8") as f:
                f.write(compact_content_str)
            target_local_files.append(file_clean_path)

        if os.path.exists(soar_file):
            target_local_files.append(soar_file)

        for lp in target_local_files:
            if lp and os.path.exists(lp):
                rel_p = os.path.relpath(lp, ROOT_DIR).replace("\\", "/")
                with open(lp, "r", encoding="utf-8") as f:
                    content = f.read()
                files_to_commit.append((rel_p, content))

        reciter_lbl = req.reciter_name or f"Reciter #{req.reciter_id}"
        moshaf_lbl = req.moshaf_name or f"Moshaf #{req.moshaf_id}"
        commit_msg = req.commit_message or f"feat(timing): publish reviewed timing for {reciter_lbl} - {moshaf_lbl} - Surah {req.surah_id:03d} ({len(req.entries)} ayahs)"

        res = gh.commit_and_push_files(files_to_commit, commit_msg)

        return {
            "success": True,
            "commit_sha": res["commit_sha"],
            "commit_url": res["commit_url"],
            "files_count": len(files_to_commit),
            "files_pushed": [f[0] for f in files_to_commit],
            "reviewed": req.reviewed,
            "review_info": review_info,
            "surah_id": req.surah_id,
            "moshaf_id": req.moshaf_id
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

def generate_timing_index_data() -> Dict[str, Any]:
    """Generates a fast O(1) timing index mapping server URLs to reads, surahs, and cleanliness."""
    index = {
        "version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "servers": {}
    }
    reads_file = os.path.join(DATA_MIRROR, "timing", "reads.json")
    if not os.path.exists(reads_file):
        return index

    with open(reads_file, "r", encoding="utf-8") as f:
        reads = json.load(f)

    # Scan available surahs for each read
    for r in reads:
        read_id = r.get("id")
        folder_url = r.get("folder_url", "").strip().rstrip("/") + "/"
        if not folder_url or folder_url == "/":
            continue

        # Scan available surahs for each read from REAL existing files
        surahs = []
        slug = r.get("slug")
        if not slug and "archive.org/download/" in folder_url:
            slug = folder_url.split("archive.org/download/")[1].split("/")[0].strip()

        if slug and os.path.exists(os.path.join(DATA_MIRROR, "timing_clean", slug)):
            surahs = [int(f[:-5]) for f in os.listdir(os.path.join(DATA_MIRROR, "timing_clean", slug)) if f.endswith(".json")]

        if surahs:
            sorted_surahs = sorted(list(set(surahs)))
            is_full = (len(sorted_surahs) == 114 and sorted_surahs[0] == 1 and sorted_surahs[-1] == 114)
            index["servers"][folder_url] = {
                "read_id": read_id,
                "slug": slug,
                "surahs": "all" if is_full else sorted_surahs,
                "clean": True
            }

    # Save to DATA_MIRROR/timing_index.json
    index_path = os.path.join(DATA_MIRROR, "timing_index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    return index

@app.get("/api/timing/generate-index")
def api_generate_timing_index():
    """Regenerate and return timing_index.json."""
    try:
        idx = generate_timing_index_data()
        return {"success": True, "servers_count": len(idx["servers"]), "index": idx}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class BatchTimingPublishRequest(BaseModel):
    reciter_id: int
    moshaf_id: Optional[int] = None
    slug: Optional[str] = None
    reciter_name: Optional[str] = None
    moshaf_name: Optional[str] = None
    surahs: Optional[List[int]] = None
    reviewed: bool = True
    commit_message: Optional[str] = None

@app.post("/api/timing/publish-mushaf")
def publish_mushaf_timings(req: BatchTimingPublishRequest):
    """
    Publish all reviewed timings for an entire mushaf/recitation directly to GitHub in a single commit.
    """
    try:
        gh = GitHubAdapter()
        if not gh.is_configured:
            raise HTTPException(status_code=400, detail="GitHub token or repository not configured in .env")

        timing_clean_dir = os.path.join(DATA_MIRROR, "timing_clean")
        timing_surah_dir = os.path.join(DATA_MIRROR, "timing", "surah")
        reads_file = os.path.join(DATA_MIRROR, "timing", "reads.json")
        catalog_ar_path = os.path.join(DATA_MIRROR, "catalog", "reciters_ar.json")
        catalog_en_path = os.path.join(DATA_MIRROR, "catalog", "reciters_en.json")

        target_surahs = req.surahs or list(range(1, 115))
        m_id = req.moshaf_id or req.reciter_id

        os.makedirs(timing_clean_dir, exist_ok=True)

        files_to_commit = []
        published_surahs = []

        for s in target_surahs:
            local_info = get_existing_timing(req.reciter_id, s, req.moshaf_id)
            if local_info.get("exists") and local_info.get("entries"):
                flat_numbers = []
                for e in local_info["entries"]:
                    flat_numbers.extend([int(e["ayah"]), int(e["start_time"]), int(e["end_time"])])

                max_end = max([e["end_time"] for e in local_info["entries"]] + [0])
                dur_sec = round(max_end / 1000.0, 2)

                content_str = json.dumps(flat_numbers, separators=(",", ":"))

                if req.slug:
                    # Dedicated slug folder for this reading
                    slug_clean_dir = os.path.join(timing_clean_dir, req.slug)
                    os.makedirs(slug_clean_dir, exist_ok=True)

                    folder_clean_file = os.path.join(slug_clean_dir, f"{s}.json")
                    with open(folder_clean_file, "w", encoding="utf-8") as f:
                        f.write(content_str)

                    files_to_commit.append((os.path.relpath(folder_clean_file, ROOT_DIR).replace("\\", "/"), content_str))

                # Update review status
                set_timing_review_status(
                    reciter_id=req.reciter_id,
                    moshaf_id=req.moshaf_id,
                    surah_id=s,
                    reviewed=req.reviewed,
                    slug=req.slug,
                    ayah_count=len(local_info["entries"]),
                    total_duration_sec=dur_sec
                )
                published_surahs.append(s)

        if not published_surahs:
            raise HTTPException(status_code=400, detail="No timed surahs found to publish for this recitation")

        # Update reads.json with slug
        if req.slug and os.path.exists(reads_file):
            try:
                with open(reads_file, "r", encoding="utf-8") as f:
                    reads_list = json.load(f)
                r_id = req.reciter_id
                folder_url = f"https://archive.org/download/{req.slug}/"
                
                updated = False
                for r in reads_list:
                    if r.get("id") == r_id or r.get("folder_url", "").rstrip("/") == folder_url.rstrip("/"):
                        r["slug"] = req.slug
                        updated = True
                        break
                
                if not updated and req.reciter_name:
                    reads_list.append({
                        "id": r_id,
                        "name": req.reciter_name,
                        "rewaya": req.moshaf_name or "حفص عن عاصم",
                        "folder_url": folder_url,
                        "soar_count": len(published_surahs),
                        "soar_link": f"https://www.mp3quran.net/api/v3/ayat_timing/soar?read={r_id}",
                        "slug": req.slug
                    })
                
                with open(reads_file, "w", encoding="utf-8") as f:
                    json.dump(reads_list, f, ensure_ascii=False, indent=2)
                
                rel_reads = os.path.relpath(reads_file, ROOT_DIR).replace("\\", "/")
                files_to_commit.append((rel_reads, json.dumps(reads_list, ensure_ascii=False, indent=2)))
            except Exception as e:
                print("Reads update warning:", e)

        # Regenerate timing_index.json
        generate_timing_index_data()
        timing_index_file = os.path.join(DATA_MIRROR, "timing_index.json")

        # Add reviews.json, reads.json, catalogs, and timing_index.json
        if os.path.exists(REVIEWS_FILE):
            with open(REVIEWS_FILE, "r", encoding="utf-8") as f:
                files_to_commit.append((os.path.relpath(REVIEWS_FILE, ROOT_DIR).replace("\\", "/"), f.read()))
        if os.path.exists(reads_file):
            with open(reads_file, "r", encoding="utf-8") as f:
                files_to_commit.append((os.path.relpath(reads_file, ROOT_DIR).replace("\\", "/"), f.read()))
        if os.path.exists(timing_index_file):
            with open(timing_index_file, "r", encoding="utf-8") as f:
                files_to_commit.append((os.path.relpath(timing_index_file, ROOT_DIR).replace("\\", "/"), f.read()))
        if os.path.exists(catalog_ar_path):
            with open(catalog_ar_path, "r", encoding="utf-8") as f:
                files_to_commit.append((os.path.relpath(catalog_ar_path, ROOT_DIR).replace("\\", "/"), f.read()))
        if os.path.exists(catalog_en_path):
            with open(catalog_en_path, "r", encoding="utf-8") as f:
                files_to_commit.append((os.path.relpath(catalog_en_path, ROOT_DIR).replace("\\", "/"), f.read()))

        reciter_lbl = req.reciter_name or f"Reciter #{req.reciter_id}"
        moshaf_lbl = req.moshaf_name or f"Moshaf #{req.moshaf_id}"
        commit_msg = req.commit_message or f"feat(timing): publish full mushaf timing for {reciter_lbl} - {moshaf_lbl} ({len(published_surahs)} surahs)"

        res = gh.commit_and_push_files(files_to_commit, commit_msg)

        return {
            "success": True,
            "commit_sha": res["commit_sha"],
            "commit_url": res["commit_url"],
            "published_surahs_count": len(published_surahs),
            "published_surahs": published_surahs,
            "files_count": len(files_to_commit),
            "files_pushed": [f[0] for f in files_to_commit]
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/timing/mushaf-status")
def get_mushaf_timing_status(reciter_id: int, moshaf_id: Optional[int] = None, server_url: Optional[str] = None):
    """
    Returns full status matrix across all 114 surahs in <2ms.
    """
    try:
        read_id = find_mp3quran_read_id(reciter_id, server_url)
        surah_statuses = []
        timed_count = 0
        reviewed_count = 0

        # Load reviews index once
        reviews_map = {}
        if os.path.exists(REVIEWS_FILE):
            try:
                with open(REVIEWS_FILE, "r", encoding="utf-8") as f:
                    reviews_map = json.load(f)
            except Exception:
                pass

        local_files = {}
        for folder in [os.path.join(DATA_MIRROR, "timing_clean"), os.path.join(DATA_MIRROR, "timing", "surah")]:
            if os.path.exists(folder):
                for f in os.listdir(folder):
                    if f.endswith(".json"):
                        local_files[f] = os.path.join(folder, f)

        m_id = moshaf_id or reciter_id
        is_default_moshaf = (not moshaf_id or moshaf_id == reciter_id)

        # Resolve slug for this recitation from reads.json or timing_index.json
        slug = None
        reads_file = os.path.join(DATA_MIRROR, "timing", "reads.json")
        if os.path.exists(reads_file):
            try:
                with open(reads_file, "r", encoding="utf-8") as rf:
                    r_list = json.load(rf)
                    for r in r_list:
                        if (read_id and r.get("id") == read_id) or (server_url and r.get("folder_url", "").rstrip("/") == server_url.rstrip("/")):
                            slug = r.get("slug")
                            break
            except Exception:
                pass

        slug_dir = os.path.join(DATA_MIRROR, "timing_clean", slug) if slug else None

        for s in range(1, 115):
            target_path = None
            if slug_dir and os.path.exists(os.path.join(slug_dir, f"{s}.json")):
                target_path = os.path.join(slug_dir, f"{s}.json")
            elif is_default_moshaf:
                # Default moshaf: check 2-part filename first, then 3-part
                fname1 = f"{reciter_id}_{s}.json"
                fname2 = f"{reciter_id}_{m_id}_{s}.json"
                target_path = local_files.get(fname1) or local_files.get(fname2)
            else:
                # Specific non-default moshaf: only use 3-part filename
                fname1 = f"{reciter_id}_{m_id}_{s}.json"
                target_path = local_files.get(fname1)

            has_local = target_path is not None

            rev_key1 = f"{reciter_id}_{m_id}_{s}" if (m_id and m_id != reciter_id) else f"{reciter_id}_{s}"
            rev_key2 = f"{reciter_id}_{s}"
            rev_info = reviews_map.get(rev_key1) or reviews_map.get(rev_key2) or {}
            is_rev = rev_info.get("reviewed", False) if isinstance(rev_info, dict) else bool(rev_info)
            count = rev_info.get("ayah_count", 0) if isinstance(rev_info, dict) else 0
            dur = rev_info.get("total_duration_sec", 0.0) if isinstance(rev_info, dict) else 0.0

            if has_local:
                timed_count += 1
                if is_rev:
                    reviewed_count += 1

            surah_statuses.append({
                "surah_id": s,
                "has_timing": has_local,
                "is_reviewed": is_rev,
                "entries_count": count,
                "duration_sec": dur,
                "source_file": os.path.basename(target_path) if target_path else None
            })

        return {
            "reciter_id": reciter_id,
            "moshaf_id": moshaf_id,
            "read_id": read_id,
            "total_surahs": 114,
            "timed_count": timed_count,
            "reviewed_count": reviewed_count,
            "untimed_count": 114 - timed_count,
            "completion_percent": round((timed_count / 114.0) * 100, 1),
            "surahs": surah_statuses
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/timing/catalog-filter-summary")
def get_catalog_filter_summary():
    """
    Returns timing completion overview for all reciters and their moshafs in sub-millisecond time.
    """
    try:
        catalog_ar_path = os.path.join(DATA_MIRROR, "catalog", "reciters_ar.json")
        if not os.path.exists(catalog_ar_path):
            return {"reciters": []}

        with open(catalog_ar_path, "r", encoding="utf-8") as f:
            reciters = json.load(f).get("reciters", [])

        # Fast scan of local timing files in memory
        timed_pairs = set()
        for folder in [os.path.join(DATA_MIRROR, "timing_clean"), os.path.join(DATA_MIRROR, "timing", "surah")]:
            if os.path.exists(folder):
                for f in os.listdir(folder):
                    if f.endswith(".json"):
                        base = f[:-5]
                        parts = base.split("_")
                        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                            timed_pairs.add((int(parts[0]), None, int(parts[1])))
                            timed_pairs.add((int(parts[0]), int(parts[0]), int(parts[1])))
                        elif len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit() and parts[2].isdigit():
                            timed_pairs.add((int(parts[0]), int(parts[1]), int(parts[2])))

        summary = []
        for r in reciters:
            r_id = r["id"]
            moshafs_summary = []
            reciter_total_timed = 0

            for m in r.get("moshaf", []):
                m_id = m.get("id")
                timed_s = 0
                for s in range(1, 115):
                    if (r_id, m_id, s) in timed_pairs or (r_id, None, s) in timed_pairs:
                        timed_s += 1
                
                reciter_total_timed += timed_s
                moshafs_summary.append({
                    "id": m_id,
                    "name": m.get("name"),
                    "server": m.get("server"),
                    "timed_count": timed_s,
                    "total_surahs": m.get("surah_total", 114),
                    "is_complete": timed_s >= 114,
                    "has_timing": timed_s > 0
                })

            summary.append({
                "id": r_id,
                "name_ar": r.get("name"),
                "name_en": r.get("name_en") or r.get("name"),
                "total_moshafs": len(moshafs_summary),
                "total_timed_surahs": reciter_total_timed,
                "has_timing": reciter_total_timed > 0,
                "is_complete": any(m["is_complete"] for m in moshafs_summary),
                "moshafs": moshafs_summary
            })

        return {
            "total_reciters": len(summary),
            "complete_count": sum(1 for r in summary if r["is_complete"]),
            "partial_count": sum(1 for r in summary if r["has_timing"] and not r["is_complete"]),
            "untimed_count": sum(1 for r in summary if not r["has_timing"]),
            "reciters": summary
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- Batch Processing Endpoints -----------------

@app.post("/api/batch/start")
def start_batch(req: BatchStartRequest):
    """Start batch STT timing for a full or partial mushaf."""
    surah_list = req.surahs or list(range(1, 115))
    job_id = start_batch_in_background(
        reciter_name=req.reciter_name,
        moshaf_name=req.moshaf_name,
        server_url=req.server_url,
        surah_list=surah_list,
        model_size=req.model_size
    )
    return {"success": True, "job_id": job_id, "total_surahs": len(surah_list)}

@app.get("/api/batch/status/{job_id}")
def get_batch_status(job_id: str):
    """Check live status of a batch job."""
    job = active_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return {
        "job_id": job.job_id,
        "status": job.status,
        "reciter_name": job.reciter_name,
        "moshaf_name": job.moshaf_name,
        "read_id": job.read_id,
        "current_surah": job.current_surah,
        "completed_count": len(job.completed_surahs),
        "total_surahs": job.total_surahs,
        "percent": round((len(job.completed_surahs) / max(1, job.total_surahs)) * 100, 1),
        "current_step": job.current_step,
        "logs": job.logs[-20:],
        "error": job.error
    }

@app.post("/api/batch/cancel/{job_id}")
def cancel_batch(job_id: str):
    """Cancel a running batch job."""
    job = active_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.cancel()
    return {"success": True, "status": "cancelled"}

# ----------------- GitHub Sync & Admin Approval Endpoints -----------------

@app.get("/api/github/staged-changes")
def get_staged_changes():
    """
    List local dataset files grouped by category (Catalogs, Timing Clean, Reads, etc.)
    ready for admin review prior to GitHub publishing.
    """
    try:
        staged_files = []
        categories_count = {}
        
        for root, _, files in os.walk(DATA_MIRROR):
            for file in files:
                if file.endswith(".json") or file.endswith(".txt"):
                    full_p = os.path.join(root, file)
                    rel_to_repo = os.path.relpath(full_p, ROOT_DIR).replace("\\", "/")
                    size = os.path.getsize(full_p)
                    mtime = os.path.getmtime(full_p)
                    parts = rel_to_repo.split("/")
                    cat = parts[2] if len(parts) > 2 else "root"
                    
                    categories_count[cat] = categories_count.get(cat, 0) + 1
                    
                    # For UI listing, include all files from catalogs, timing_clean, and manifest, plus sample from large dirs
                    staged_files.append({
                        "path": rel_to_repo,
                        "size_bytes": size,
                        "mtime": mtime,
                        "category": cat
                    })

        return {
            "total_files": len(staged_files),
            "categories": categories_count,
            "files": staged_files[:100]  # First 100 for UI table display
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- External API Importing & Auto-Detection -----------------

class TimingImportRequest(BaseModel):
    source: str = "mp3quran"  # "mp3quran" | "quran_com" | "custom_url" | "raw_json"
    reciter_id: int
    moshaf_id: Optional[int] = None
    surah_id: int
    read_id: Optional[int] = None
    custom_url: Optional[str] = None
    raw_json: Optional[str] = None
    slug: Optional[str] = None
    reviewed: bool = True

class BatchTimingImportRequest(BaseModel):
    source: str = "mp3quran"
    reciter_id: int
    moshaf_id: Optional[int] = None
    read_id: int
    slug: Optional[str] = None
    surahs: Optional[List[int]] = None
    reviewed: bool = True

class ReciterImportRequest(BaseModel):
    remote_id: int
    name_ar: str
    name_en: Optional[str] = None
    letter: Optional[str] = None
    moshafs: List[Dict[str, Any]]

def find_mp3quran_read_id(reciter_id: int, server_url: Optional[str] = None, reciter_name: Optional[str] = None, moshaf_id: Optional[int] = None) -> Optional[int]:
    """Helper to match a local reciter/moshaf to an mp3quran ayat_timing read ID."""
    reads_file = os.path.join(DATA_MIRROR, "timing", "reads.json")
    if not os.path.exists(reads_file):
        return None
    try:
        with open(reads_file, "r", encoding="utf-8") as f:
            reads = json.load(f)
        
        # 1. Match by exact folder URL (most reliable for distinct recitations/moshafs)
        if server_url:
            clean_s = server_url.rstrip("/") + "/"
            for r in reads:
                if r.get("folder_url", "").rstrip("/") + "/" == clean_s:
                    return r["id"]
        
        # 2. Match by moshaf_id directly (in mp3quran API, moshaf.id often equals read.id)
        if moshaf_id:
            for r in reads:
                if r.get("id") == moshaf_id:
                    return r["id"]

        # 3. Match by reciter id directly ONLY IF no specific moshaf_id or server_url was requested
        if not moshaf_id and not server_url:
            for r in reads:
                if r.get("id") == reciter_id:
                    return r["id"]
                
        # 4. Match by name ONLY IF no specific moshaf_id or server_url was requested
        if reciter_name and not moshaf_id and not server_url:
            for r in reads:
                if r.get("name") == reciter_name or reciter_name in r.get("name", ""):
                    return r["id"]
    except Exception:
        pass
    return None

@app.get("/api/import/external-timing/check")
def check_external_timing(
    reciter_id: int,
    surah_id: int,
    moshaf_id: Optional[int] = None,
    server_url: Optional[str] = None,
    slug: Optional[str] = None
):
    """
    Check if external timing exists on mp3quran.net, in local dataset mirror, or pushed to GitHub.
    Returns read_id, source URL, availability, and pushed_to_github status.
    """
    try:
        # Find read_id
        read_id = find_mp3quran_read_id(reciter_id, server_url=server_url, moshaf_id=moshaf_id)
        
        # Check local timing first
        local_check = get_existing_timing(reciter_id, surah_id, moshaf_id, slug=slug)
        if local_check.get("exists"):
            return {
                "available": True,
                "is_local": True,
                "read_id": read_id or reciter_id,
                "source": "local_mirror",
                "source_file": local_check.get("source_file"),
                "entries_count": len(local_check.get("entries", [])),
                "reviewed": local_check.get("reviewed", False),
                "pushed_to_github": False
            }

        # Check if already pushed on GitHub repository
        gh = GitHubAdapter()
        if gh.is_configured:
            m_id = moshaf_id or reciter_id
            github_candidates = []
            if slug:
                github_candidates.append(f"web/data-mirror/timing_clean/{slug}/{surah_id}.json")
                github_candidates.append(f"web/data-mirror/timing/{slug}/{surah_id}.json")
                github_candidates.append(f"web/data-mirror/timing_clean/{slug}_{surah_id}.json")
                github_candidates.append(f"web/data-mirror/timing/surah/{slug}_{surah_id}.json")
            if moshaf_id and moshaf_id != reciter_id:
                github_candidates.append(f"web/data-mirror/timing_clean/{reciter_id}_{moshaf_id}_{surah_id}.json")
                github_candidates.append(f"web/data-mirror/timing/surah/{reciter_id}_{moshaf_id}_{surah_id}.json")
            github_candidates.append(f"web/data-mirror/timing_clean/{reciter_id}_{surah_id}.json")
            github_candidates.append(f"web/data-mirror/timing/surah/{reciter_id}_{surah_id}.json")

            for rel_gh_path in github_candidates:
                if gh.check_file_exists(rel_gh_path):
                    return {
                        "available": True,
                        "pushed_to_github": True,
                        "is_local": False,
                        "read_id": read_id or reciter_id,
                        "source": "github_repo",
                        "source_file": rel_gh_path,
                        "github_url": f"https://github.com/{gh.repo}/blob/{gh.branch}/{rel_gh_path}",
                        "message": f"توقيت السورة منشور ومعتمد مسبقاً على مستودع GitHub"
                    }

        # Check mp3quran.net API if read_id known
        if read_id:
            api_url = f"https://www.mp3quran.net/api/v3/ayat_timing?read={read_id}&surah={surah_id}"
            headers = {"User-Agent": "Mozilla/5.0"}
            with httpx.Client(timeout=6.0) as client:
                res = client.get(api_url, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    if isinstance(data, list) and len(data) > 0:
                        return {
                            "available": True,
                            "is_local": False,
                            "pushed_to_github": False,
                            "read_id": read_id,
                            "source": "mp3quran",
                            "api_url": api_url,
                            "entries_count": len(data),
                            "message": f"توقيت متوفر على mp3quran.net API ({len(data)} آية)"
                        }

        return {
            "available": False,
            "pushed_to_github": False,
            "read_id": read_id,
            "message": "لم يتم العثور على توقيت جاهز في الـ API"
        }
    except Exception as e:
        return {
            "available": False,
            "pushed_to_github": False,
            "error": str(e)
        }

@app.post("/api/import/timing-from-api")
def import_timing_from_api(req: TimingImportRequest):
    """
    Import verse-by-verse timing from external API (mp3quran, Quran.com, custom URL, or raw JSON).
    Aligns with Tanzil Uthmani verses and saves directly to timing_clean/ and timing/surah/.
    """
    try:
        raw_items = []
        source_desc = req.source

        if req.source == "mp3quran":
            read_id = req.read_id or find_mp3quran_read_id(req.reciter_id, moshaf_id=req.moshaf_id)
            if not read_id:
                raise RuntimeError(f"Could not determine a valid mp3quran read_id for reciter #{req.reciter_id} / moshaf #{req.moshaf_id}")
            api_url = f"https://www.mp3quran.net/api/v3/ayat_timing?read={read_id}&surah={req.surah_id}"
            headers = {"User-Agent": "Mozilla/5.0"}
            with httpx.Client(timeout=15.0) as client:
                res = client.get(api_url, headers=headers)
                if res.status_code != 200:
                    raise RuntimeError(f"mp3quran API returned HTTP {res.status_code}: {res.text[:200]}")
                raw_items = res.json()
            source_desc = f"mp3quran.net (Read #{read_id})"

        elif req.source == "custom_url" and req.custom_url:
            headers = {"User-Agent": "Mozilla/5.0"}
            with httpx.Client(timeout=20.0) as client:
                res = client.get(req.custom_url, headers=headers)
                if res.status_code != 200:
                    raise RuntimeError(f"Custom URL returned HTTP {res.status_code}")
                raw_items = res.json()
            source_desc = req.custom_url

        elif req.source == "raw_json" and req.raw_json:
            raw_items = json.loads(req.raw_json)
            source_desc = "Raw JSON Paste"

        elif req.source == "quran_com":
            # Quran.com recitations API
            api_url = f"https://api.quran.com/api/v4/chapter_recitations/{req.reciter_id}/{req.surah_id}"
            headers = {"User-Agent": "Mozilla/5.0"}
            with httpx.Client(timeout=15.0) as client:
                res = client.get(api_url, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    raw_items = data.get("audio_file", {}).get("verse_timings", [])
                else:
                    raise RuntimeError(f"Quran.com API returned HTTP {res.status_code}")
            source_desc = f"Quran.com API (Reciter #{req.reciter_id})"

        if not isinstance(raw_items, list) or len(raw_items) == 0:
            raise ValueError(f"No valid timing entries received from {source_desc}")

        # Normalize entries
        verses = load_tanzil_surah(req.surah_id)
        verse_map = {v["ayah"]: v["text_uthmani"] for v in verses}

        clean_entries = []
        for idx, item in enumerate(raw_items):
            ayah = item.get("ayah")
            if ayah is None:
                # Try parsing verse_key or fallback to 1-indexed
                vk = item.get("verse_key")
                if vk and ":" in vk:
                    ayah = int(vk.split(":")[1])
                else:
                    ayah = idx + 1

            start_ms = item.get("start_time") or item.get("start") or item.get("timestamp_from", 0)
            end_ms = item.get("end_time") or item.get("end") or item.get("timestamp_to", 0)

            # Convert floating seconds to ms if values are small (< 1000 and total duration looks like seconds)
            if isinstance(start_ms, float) and start_ms < 5000 and isinstance(end_ms, float) and end_ms < 5000:
                start_ms = int(start_ms * 1000)
                end_ms = int(end_ms * 1000)
            else:
                start_ms = int(start_ms)
                end_ms = int(end_ms)

            text = BASMALA_CANONICAL if ayah == 0 else verse_map.get(ayah, "")
            clean_entries.append({
                "ayah": ayah,
                "start_time": start_ms,
                "end_time": end_ms,
                "duration_ms": end_ms - start_ms,
                "text": text
            })

        # Save to disk
        timing_clean_dir = os.path.join(DATA_MIRROR, "timing_clean")
        timing_surah_dir = os.path.join(DATA_MIRROR, "timing", "surah")
        os.makedirs(timing_clean_dir, exist_ok=True)
        os.makedirs(timing_surah_dir, exist_ok=True)

        m_id = req.moshaf_id or req.read_id
        if m_id and m_id != req.reciter_id:
            filename = f"{req.reciter_id}_{m_id}_{req.surah_id}.json"
        else:
            filename = f"{req.reciter_id}_{req.surah_id}.json"

        file_clean_path = os.path.join(timing_clean_dir, filename)
        file_surah_path = os.path.join(timing_surah_dir, filename)

        save_items = [{"ayah": e["ayah"], "start_time": e["start_time"], "end_time": e["end_time"]} for e in clean_entries]

        with open(file_clean_path, "w", encoding="utf-8") as f:
            json.dump(save_items, f, indent=2)
        with open(file_surah_path, "w", encoding="utf-8") as f:
            json.dump(save_items, f, indent=2)

        if req.slug:
            # 1. Save into dedicated reading folder: timing_clean/{slug}/{surah_id}.json & timing/{slug}/{surah_id}.json
            slug_clean_dir = os.path.join(timing_clean_dir, req.slug)
            slug_timing_dir = os.path.join(DATA_MIRROR, "timing", req.slug)
            os.makedirs(slug_clean_dir, exist_ok=True)
            os.makedirs(slug_timing_dir, exist_ok=True)

            with open(os.path.join(slug_clean_dir, f"{req.surah_id}.json"), "w", encoding="utf-8") as f:
                json.dump(save_items, f, indent=2)
            with open(os.path.join(slug_timing_dir, f"{req.surah_id}.json"), "w", encoding="utf-8") as f:
                json.dump(save_items, f, indent=2)

            # 2. Maintain flat slug filenames for backwards compatibility
            slug_clean_path = os.path.join(timing_clean_dir, f"{req.slug}_{req.surah_id}.json")
            slug_surah_path = os.path.join(timing_surah_dir, f"{req.slug}_{req.surah_id}.json")
            with open(slug_clean_path, "w", encoding="utf-8") as f:
                json.dump(save_items, f, indent=2)
            with open(slug_surah_path, "w", encoding="utf-8") as f:
                json.dump(save_items, f, indent=2)

        max_end = max([e["end_time"] for e in clean_entries] + [0])
        dur_sec = round(max_end / 1000.0, 2)

        # Update reviews.json
        review_info = set_timing_review_status(
            reciter_id=req.reciter_id,
            moshaf_id=req.moshaf_id,
            surah_id=req.surah_id,
            reviewed=req.reviewed,
            slug=req.slug,
            ayah_count=len(clean_entries),
            total_duration_sec=dur_sec
        )

        return {
            "success": True,
            "source": source_desc,
            "filename": filename,
            "surah_id": req.surah_id,
            "total_duration_sec": dur_sec,
            "count": len(clean_entries),
            "reviewed": req.reviewed,
            "review_info": review_info,
            "entries": clean_entries
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/import/batch-timing-from-api")
def import_batch_timing_from_api(req: BatchTimingImportRequest):
    """
    Batch import all available surah timings for a reciter/read from mp3quran.net API.
    """
    try:
        surah_list = req.surahs or list(range(1, 115))
        imported_surahs = []
        failed_surahs = []

        headers = {"User-Agent": "Mozilla/5.0"}
        with httpx.Client(timeout=20.0) as client:
            for s_id in surah_list:
                try:
                    api_url = f"https://www.mp3quran.net/api/v3/ayat_timing?read={req.read_id}&surah={s_id}"
                    res = client.get(api_url, headers=headers)
                    if res.status_code == 200:
                        raw_items = res.json()
                        if isinstance(raw_items, list) and len(raw_items) > 0:
                            save_items = [{"ayah": e["ayah"], "start_time": int(e["start_time"]), "end_time": int(e["end_time"])} for e in raw_items]

                            # Save to disk
                            timing_clean_dir = os.path.join(DATA_MIRROR, "timing_clean")
                            timing_surah_dir = os.path.join(DATA_MIRROR, "timing", "surah")
                            os.makedirs(timing_clean_dir, exist_ok=True)
                            os.makedirs(timing_surah_dir, exist_ok=True)

                            m_id = req.moshaf_id or req.read_id
                            if m_id and m_id != req.reciter_id:
                                filename = f"{req.reciter_id}_{m_id}_{s_id}.json"
                            else:
                                filename = f"{req.reciter_id}_{s_id}.json"

                            file_clean_path = os.path.join(timing_clean_dir, filename)
                            file_surah_path = os.path.join(timing_surah_dir, filename)

                            with open(file_clean_path, "w", encoding="utf-8") as f:
                                json.dump(save_items, f, indent=2)
                            with open(file_surah_path, "w", encoding="utf-8") as f:
                                json.dump(save_items, f, indent=2)

                            if req.slug:
                                # 1. Save into dedicated reading folder: timing_clean/{slug}/{s_id}.json & timing/{slug}/{s_id}.json
                                slug_clean_dir = os.path.join(timing_clean_dir, req.slug)
                                slug_timing_dir = os.path.join(DATA_MIRROR, "timing", req.slug)
                                os.makedirs(slug_clean_dir, exist_ok=True)
                                os.makedirs(slug_timing_dir, exist_ok=True)

                                with open(os.path.join(slug_clean_dir, f"{s_id}.json"), "w", encoding="utf-8") as f:
                                    json.dump(save_items, f, indent=2)
                                with open(os.path.join(slug_timing_dir, f"{s_id}.json"), "w", encoding="utf-8") as f:
                                    json.dump(save_items, f, indent=2)

                                # 2. Maintain flat slug filenames for backwards compatibility
                                slug_clean_path = os.path.join(timing_clean_dir, f"{req.slug}_{s_id}.json")
                                slug_surah_path = os.path.join(timing_surah_dir, f"{req.slug}_{s_id}.json")
                                with open(slug_clean_path, "w", encoding="utf-8") as f:
                                    json.dump(save_items, f, indent=2)
                                with open(slug_surah_path, "w", encoding="utf-8") as f:
                                    json.dump(save_items, f, indent=2)

                            max_end = max([e["end_time"] for e in save_items] + [0])
                            set_timing_review_status(
                                reciter_id=req.reciter_id,
                                moshaf_id=req.moshaf_id,
                                surah_id=s_id,
                                reviewed=req.reviewed,
                                slug=req.slug,
                                ayah_count=len(save_items),
                                total_duration_sec=round(max_end / 1000.0, 2)
                            )
                            imported_surahs.append(s_id)
                        else:
                            failed_surahs.append({"surah_id": s_id, "reason": "Empty timing list from API"})
                    else:
                        failed_surahs.append({"surah_id": s_id, "reason": f"HTTP {res.status_code}"})
                except Exception as ex:
                    failed_surahs.append({"surah_id": s_id, "reason": str(ex)})

        return {
            "success": True,
            "read_id": req.read_id,
            "reciter_id": req.reciter_id,
            "imported_count": len(imported_surahs),
            "imported_surahs": imported_surahs,
            "failed_count": len(failed_surahs),
            "failed_surahs": failed_surahs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# In-memory cached remote reciters for fast live search
_remote_reciters_cache = None

def normalize_search_str(s: str) -> str:
    if not s:
        return ""
    import re
    s = s.lower().strip()
    # Arabic normalizations
    s = re.sub(r'[أإآٱ]', 'ا', s)
    s = re.sub(r'[ة]', 'ه', s)
    s = re.sub(r'[ى]', 'ي', s)
    s = re.sub(r'[\u064B-\u065F\u0670]', '', s)  # diacritics
    # English transliteration common variants
    s = s.replace("al-", "").replace("el-", "").replace("al ", "").replace("el ", "")
    s = s.replace("mohammed", "mohammad").replace("muhammad", "mohammad").replace("mohamed", "mohammad").replace("muhammed", "mohammad")
    s = s.replace("tablawy", "tablaw").replace("tablaway", "tablaw").replace("tablawi", "tablaw").replace("tablawey", "tablaw")
    s = s.replace("husary", "husr").replace("hussary", "husr").replace("hossary", "husr").replace("hosary", "husr")
    s = s.replace("minshawi", "minshaw").replace("menshawy", "minshaw").replace("menshawi", "minshaw").replace("minshawy", "minshaw")
    s = s.replace("abdulbasit", "abdulsamad").replace("abdelbasset", "abdulsamad").replace("abdulbaset", "abdulsamad")
    s = s.replace("afasy", "afas").replace("alafasy", "afas").replace("alafasi", "afas").replace("afasi", "afas")
    s = s.replace("ajamy", "ajm").replace("ajmi", "ajm").replace("ajami", "ajm").replace("ajmy", "ajm")
    s = s.replace("-", "").replace(" ", "").replace("_", "")
    return s

@app.get("/api/import/remote-reciters/search")
def search_remote_reciters(q: Optional[str] = None):
    """
    Search 240+ reciters live from mp3quran.net API with smart fuzzy and transliteration matching.
    Cached in-memory with instant response.
    """
    global _remote_reciters_cache
    try:
        if _remote_reciters_cache is None:
            headers = {"User-Agent": "Mozilla/5.0"}
            with httpx.Client(timeout=25.0) as client:
                res_ar = client.get("https://www.mp3quran.net/api/v3/reciters?language=ar", headers=headers)
                res_en = client.get("https://www.mp3quran.net/api/v3/reciters?language=en", headers=headers)
                
                ar_data = res_ar.json().get("reciters", []) if res_ar.status_code == 200 else []
                en_data = res_en.json().get("reciters", []) if res_en.status_code == 200 else []

                en_map = {r["id"]: r.get("name") for r in en_data}
                
                # Check which ones have timing reads
                reads_file = os.path.join(DATA_MIRROR, "timing", "reads.json")
                timed_servers = set()
                if os.path.exists(reads_file):
                    with open(reads_file, "r", encoding="utf-8") as f:
                        for rd in json.load(f):
                            if "folder_url" in rd:
                                timed_servers.add(rd["folder_url"].rstrip("/") + "/")

                combined = []
                for r in ar_data:
                    moshafs = []
                    has_timing = False
                    for m in r.get("moshaf", []):
                        srv = m.get("server", "").rstrip("/") + "/"
                        is_timed = srv in timed_servers
                        if is_timed:
                            has_timing = True
                        moshafs.append({
                            "id": m["id"],
                            "name": m["name"],
                            "server": srv,
                            "rewaya_id": m.get("rewaya_id", 1),
                            "moshaf_type": m.get("moshaf_type", 11),
                            "surah_total": m.get("surah_total", 114),
                            "surah_list": m.get("surah_list"),
                            "is_timed": is_timed
                        })

                    combined.append({
                        "id": r["id"],
                        "name_ar": r["name"],
                        "name_en": en_map.get(r["id"], r["name"]),
                        "letter": r.get("letter", ""),
                        "moshafs_count": len(moshafs),
                        "has_timing": has_timing,
                        "moshaf": moshafs
                    })

                _remote_reciters_cache = combined

        # Check existing catalog to mark already added and compute timing/GitHub status
        catalog_ar_path = os.path.join(DATA_MIRROR, "catalog", "reciters_ar.json")
        existing_ids = set()
        if os.path.exists(catalog_ar_path):
            with open(catalog_ar_path, "r", encoding="utf-8") as f:
                existing_ids = {r["id"] for r in json.load(f).get("reciters", [])}

        # Load reads.json mapping
        reads_file = os.path.join(DATA_MIRROR, "timing", "reads.json")
        reads_map_by_server = {}
        if os.path.exists(reads_file):
            try:
                with open(reads_file, "r", encoding="utf-8") as rf:
                    for rd in json.load(rf):
                        if "folder_url" in rd:
                            norm = rd["folder_url"].rstrip("/") + "/"
                            reads_map_by_server[norm] = rd
            except Exception:
                pass

        # Scan local timing_clean directories for slug folders and their surah counts
        slug_surah_counts = {}
        timing_clean_dir = os.path.join(DATA_MIRROR, "timing_clean")
        if os.path.exists(timing_clean_dir):
            for entry in os.listdir(timing_clean_dir):
                entry_p = os.path.join(timing_clean_dir, entry)
                if os.path.isdir(entry_p):
                    count = len([f for f in os.listdir(entry_p) if f.endswith(".json")])
                    if count > 0:
                        slug_surah_counts[entry] = count

        gh = GitHubAdapter()

        results = []
        raw_query = (q or "").strip()
        norm_q = normalize_search_str(raw_query)

        for r in _remote_reciters_cache:
            r_id = r["id"]

            if not raw_query:
                results.append(r)
            else:
                # Direct check
                direct_ar = raw_query.lower() in r["name_ar"].lower()
                direct_en = raw_query.lower() in (r.get("name_en") or "").lower()
                direct_id = raw_query == str(r["id"])
                
                # Normalized check
                norm_name_ar = normalize_search_str(r["name_ar"])
                norm_name_en = normalize_search_str(r.get("name_en") or "")
                norm_match = norm_q in norm_name_ar or norm_q in norm_name_en

                matches_moshaf = any(raw_query.lower() in m["name"].lower() for m in r.get("moshaf", []))
                
                if direct_ar or direct_en or direct_id or norm_match or matches_moshaf:
                    results.append(r)

        # Load timing_index.json for quick lookup
        timing_index_servers = {}
        timing_index_file = os.path.join(DATA_MIRROR, "timing_index.json")
        if os.path.exists(timing_index_file):
            try:
                with open(timing_index_file, "r", encoding="utf-8") as tif:
                    timing_index_servers = json.load(tif).get("servers", {})
            except Exception:
                pass

        decorated_results = []
        for r in results:
            r_copy = dict(r)
            r_id = r["id"]
            r_copy["in_local_catalog"] = r_id in existing_ids
            
            # Decorate moshafs with local timing & GitHub pushed status
            reciter_local_count = 0
            moshafs_copy = []
            reciter_has_pushed = False
            reciter_has_timed = False

            for m in r.get("moshaf", []):
                m_copy = dict(m)
                srv = m.get("server", "").rstrip("/") + "/"
                m_id = m.get("id")
                read_info = reads_map_by_server.get(srv)
                slug = read_info.get("slug") if read_info else None
                m_copy["slug"] = slug
                
                # Check timing_index.json
                idx_entry = timing_index_servers.get(srv)
                
                # Timed count from slug folder
                m_timed_count = slug_surah_counts.get(slug, 0) if slug else 0
                
                # Fallback: check flat files by reciter_id & moshaf_id (e.g. {r_id}_{m_id}_{surah_id}.json)
                if m_timed_count == 0 and os.path.exists(timing_clean_dir):
                    prefix = f"{r_id}_{m_id}_" if m_id else f"{r_id}_"
                    flat_count = len([f for f in os.listdir(timing_clean_dir) if f.startswith(prefix) and f.endswith(".json")])
                    if flat_count > 0:
                        m_timed_count = flat_count
                
                # If index says "all" or has surah list, use that as confirmation
                if idx_entry:
                    surahs_val = idx_entry.get("surahs")
                    if surahs_val == "all":
                        m_timed_count = max(m_timed_count, m.get("surah_total", 114))
                    elif isinstance(surahs_val, list):
                        m_timed_count = max(m_timed_count, len(surahs_val))

                m_copy["local_timed_count"] = m_timed_count
                m_copy["is_local_complete"] = m_timed_count >= m.get("surah_total", 114)
                if m_timed_count > 0:
                    m_copy["is_timed"] = True
                    reciter_has_timed = True
                    reciter_local_count += m_timed_count

                # Pushed status: if timing files exist in slug folder / flat clean files / indexed in timing_index.json
                is_pushed = bool(m_timed_count > 0 or (idx_entry and idx_entry.get("clean")))
                if is_pushed:
                    reciter_has_pushed = True
                
                m_copy["pushed_to_github"] = is_pushed
                moshafs_copy.append(m_copy)

            r_copy["moshaf"] = moshafs_copy
            r_copy["local_timed_count"] = reciter_local_count
            r_copy["has_timing"] = reciter_has_timed or r.get("has_timing", False)
            r_copy["pushed_to_github"] = reciter_has_pushed
            decorated_results.append(r_copy)

        return {
            "total_remote": len(_remote_reciters_cache),
            "results_count": len(decorated_results),
            "reciters": decorated_results
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/import/reciter-from-api")
def import_reciter_from_api(req: ReciterImportRequest):
    """
    Import a reciter and all their moshafs from mp3quran.net into local catalog.
    """
    try:
        catalog_ar_path = os.path.join(DATA_MIRROR, "catalog", "reciters_ar.json")
        catalog_en_path = os.path.join(DATA_MIRROR, "catalog", "reciters_en.json")

        with open(catalog_ar_path, "r", encoding="utf-8") as f:
            data_ar = json.load(f)
        with open(catalog_en_path, "r", encoding="utf-8") as f:
            data_en = json.load(f)

        reciters_ar = data_ar.get("reciters", [])
        reciters_en = data_en.get("reciters", [])

        # Format moshafs
        moshafs_formatted = []
        for m in req.moshafs:
            moshafs_formatted.append({
                "id": m["id"],
                "name": m["name"],
                "server": m["server"].rstrip("/") + "/",
                "rewaya_id": m.get("rewaya_id", 1),
                "moshaf_type": m.get("moshaf_type", 11),
                "surah_total": m.get("surah_total", 114),
                "surah_list": m.get("surah_list", ",".join(str(i) for i in range(1, 115)))
            })

        # Insert or update in AR catalog
        found_ar = False
        for r in reciters_ar:
            if r["id"] == req.remote_id:
                r["name"] = req.name_ar
                r["letter"] = req.letter or req.name_ar[0]
                r["moshaf"] = moshafs_formatted
                found_ar = True
                break
        if not found_ar:
            reciters_ar.append({
                "id": req.remote_id,
                "name": req.name_ar,
                "letter": req.letter or req.name_ar[0],
                "date": "2026-08-22T00:00:00.000000Z",
                "moshaf": moshafs_formatted
            })

        # Insert or update in EN catalog
        en_name = req.name_en or req.name_ar
        found_en = False
        for r in reciters_en:
            if r["id"] == req.remote_id:
                r["name"] = en_name
                r["letter"] = req.letter or en_name[0].upper()
                r["moshaf"] = moshafs_formatted
                found_en = True
                break
        if not found_en:
            reciters_en.append({
                "id": req.remote_id,
                "name": en_name,
                "letter": req.letter or en_name[0].upper(),
                "date": "2026-08-22T00:00:00.000000Z",
                "moshaf": moshafs_formatted
            })

        with open(catalog_ar_path, "w", encoding="utf-8") as f:
            json.dump(data_ar, f, ensure_ascii=False, indent=2)
        with open(catalog_en_path, "w", encoding="utf-8") as f:
            json.dump(data_en, f, ensure_ascii=False, indent=2)

        return {
            "success": True,
            "id": req.remote_id,
            "name_ar": req.name_ar,
            "name_en": en_name,
            "moshafs_count": len(moshafs_formatted)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/github/publish")
def publish_to_github(req: GitHubPublishRequest):
    """
    Publish staged dataset files to GitHub.
    Enforces explicit user/admin approval before publishing.
    """
    if not req.approved:
        raise HTTPException(status_code=400, detail="Admin approval required before publishing to GitHub.")

    try:
        gh = GitHubAdapter()
        if not gh.is_configured:
            raise HTTPException(status_code=400, detail="GitHub token or repo not configured in .env")

        files_to_commit: List[Tuple[str, str]] = []

        # Find files in DATA_MIRROR or specified target_files
        for root, _, files in os.walk(DATA_MIRROR):
            for file in files:
                if file.endswith(".json") or file.endswith(".txt"):
                    full_p = os.path.join(root, file)
                    rel_p = os.path.relpath(full_p, ROOT_DIR).replace("\\", "/")
                    
                    if req.target_files and rel_p not in req.target_files:
                        continue

                    # If no target_files specified, default to publishing catalogs, clean timings, reviews, reads, and manifest
                    parts = rel_p.split("/")
                    cat = parts[2] if len(parts) > 2 else "root"
                    if not req.target_files and cat not in ["catalog", "timing_clean", "root", "timing"]:
                        continue

                    with open(full_p, "r", encoding="utf-8") as f:
                        content = f.read()
                    files_to_commit.append((rel_p, content))

        if not files_to_commit:
            raise HTTPException(status_code=400, detail="No files found to commit.")

        commit_msg = req.commit_message or f"Quran TV Dataset Sync — {len(files_to_commit)} items (Admin Approved)"
        result = gh.commit_and_push_files(files_to_commit, commit_msg)

        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Mount static frontend
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "..", "public")
os.makedirs(PUBLIC_DIR, exist_ok=True)
app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="public")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
