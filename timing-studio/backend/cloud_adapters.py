import os
import sys
import json
import base64
import httpx
from typing import Dict, Any, List, Optional, Tuple

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

def load_env(env_path: Optional[str] = None) -> Dict[str, str]:
    """Parse .env file into environment and dictionary."""
    if not env_path:
        env_path = os.path.join(ROOT_DIR, ".env")
    
    config = {}
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'\"")
                config[k] = v
                if k not in os.environ or not os.environ[k]:
                    os.environ[k] = v
    return config

# Load config on module load
load_env()

class ArchiveOrgAdapter:
    """
    Internet Archive S3 API Adapter.
    IA S3 Docs: https://archive.org/help/abouts3.txt
    Header Auth: 'Authorization: LOW <access_key>:<secret_key>'
    """
    S3_ENDPOINT = "https://s3.us.archive.org"
    DOWNLOAD_BASE = "https://archive.org/download"

    def __init__(self, access_key: Optional[str] = None, secret_key: Optional[str] = None, collection: Optional[str] = None):
        self.access_key = access_key or os.environ.get("IA_ACCESS_KEY", "").strip()
        self.secret_key = secret_key or os.environ.get("IA_SECRET_KEY", "").strip()
        self.collection = collection or os.environ.get("IA_COLLECTION", "qurantv-audio").strip()

    @property
    def is_configured(self) -> bool:
        return bool(self.access_key and self.secret_key and not self.access_key.startswith("your_"))

    def _get_headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = {
            "Authorization": f"LOW {self.access_key}:{self.secret_key}",
        }
        if extra:
            headers.update(extra)
        return headers

    def test_connection(self) -> Dict[str, Any]:
        """Test authentication by checking S3 endpoint."""
        if not self.is_configured:
            return {"ok": False, "error": "Archive.org credentials not configured in .env"}
        
        try:
            # Listing user's s3 endpoint or checking auth
            with httpx.Client(timeout=10.0) as client:
                res = client.get(self.S3_ENDPOINT, headers=self._get_headers())
                # S3 root returns 200 or XML bucket list
                if res.status_code in [200, 403]:
                    if res.status_code == 403:
                        return {"ok": False, "error": "Invalid Archive.org S3 Access Key or Secret Key"}
                    return {"ok": True, "message": "Archive.org S3 connected successfully", "collection": self.collection}
                return {"ok": True, "message": f"Connected (HTTP {res.status_code})"}
        except Exception as e:
            return {"ok": False, "error": f"Connection error: {str(e)}"}

    def upload_file(
        self,
        bucket_identifier: str,
        filename: str,
        file_bytes: bytes,
        title: Optional[str] = None,
        creator: Optional[str] = None,
        description: Optional[str] = None,
        content_type: str = "audio/mpeg"
    ) -> Dict[str, Any]:
        """
        Uploads a file to an Archive.org item.
        Automatically creates the item if it does not exist using x-archive-auto-make-bucket.
        """
        if not self.is_configured:
            raise ValueError("Archive.org credentials are not configured in .env")

        headers = self._get_headers({
            "x-archive-auto-make-bucket": "1",
            "x-archive-meta-mediatype": "audio",
            "x-archive-meta-collection": self.collection,
            "Content-Type": content_type
        })

        import urllib.parse
        def _safe_header(val: Optional[str]) -> Optional[str]:
            if not val:
                return None
            try:
                val.encode('ascii')
                return val
            except UnicodeEncodeError:
                return urllib.parse.quote(val.encode('utf-8'))

        if title:
            headers["x-archive-meta-title"] = _safe_header(title)
        if creator:
            headers["x-archive-meta-creator"] = _safe_header(creator)
        if description:
            headers["x-archive-meta-description"] = _safe_header(description)

        url = f"{self.S3_ENDPOINT}/{bucket_identifier}/{filename}"
        
        timeout_config = httpx.Timeout(600.0, connect=60.0, read=600.0, write=600.0)
        with httpx.Client(timeout=timeout_config) as client:
            res = client.put(url, headers=headers, content=file_bytes)
            if res.status_code not in [200, 201]:
                # Extract clean error message from XML response if available
                err_text = res.text
                import re
                code_match = re.search(r'<Code>(.*?)</Code>', err_text)
                msg_match = re.search(r'<Message>(.*?)</Message>', err_text)
                res_match = re.search(r'<Resource>(.*?)</Resource>', err_text)
                
                err_summary = []
                if code_match: err_summary.append(code_match.group(1))
                if msg_match: err_summary.append(msg_match.group(1))
                if res_match: err_summary.append(res_match.group(1))
                
                error_detail = " - ".join(err_summary) if err_summary else err_text[:300]
                raise RuntimeError(f"Archive.org upload failed (HTTP {res.status_code}): {error_detail}")

        direct_url = f"{self.DOWNLOAD_BASE}/{bucket_identifier}/{filename}"
        return {
            "ok": True,
            "bucket": bucket_identifier,
            "filename": filename,
            "download_url": direct_url,
            "item_url": f"https://archive.org/details/{bucket_identifier}"
        }


class GitHubAdapter:
    """
    GitHub REST API & Git Data Adapter.
    Manages repository dataset synchronization and commit approval.
    """
    API_BASE = "https://api.github.com"

    def __init__(self, token: Optional[str] = None, repo: Optional[str] = None, branch: Optional[str] = None):
        self.token = token or os.environ.get("GITHUB_TOKEN", "").strip()
        self.repo = repo or os.environ.get("GITHUB_REPO", "").strip()
        self.branch = branch or os.environ.get("GITHUB_BRANCH", "main").strip()

    @property
    def is_configured(self) -> bool:
        return bool(self.token and self.repo and not self.token.startswith("your_"))

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "QuranTV-Studio"
        }

    def test_connection(self) -> Dict[str, Any]:
        """Verify GitHub access token and target repository permissions."""
        if not self.is_configured:
            return {"ok": False, "error": "GitHub token or repository not configured in .env"}

        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.get(f"{self.API_BASE}/repos/{self.repo}", headers=self._get_headers())
                if res.status_code == 200:
                    data = res.json()
                    permissions = data.get("permissions", {})
                    can_push = permissions.get("push", False) or permissions.get("admin", False)
                    return {
                        "ok": True,
                        "repo": self.repo,
                        "branch": self.branch,
                        "default_branch": data.get("default_branch", "main"),
                        "private": data.get("private", False),
                        "can_push": can_push,
                        "message": f"Connected to {self.repo} ({'Write Access' if can_push else 'Read Only'})"
                    }
                elif res.status_code == 404:
                    return {"ok": False, "error": f"Repository '{self.repo}' not found or token lacks access"}
                elif res.status_code == 401:
                    return {"ok": False, "error": "Invalid or expired GitHub Personal Access Token"}
                else:
                    return {"ok": False, "error": f"GitHub API error (HTTP {res.status_code}): {res.text[:200]}"}
        except Exception as e:
            return {"ok": False, "error": f"GitHub connection failed: {str(e)}"}

    def check_file_exists(self, repo_relative_path: str) -> bool:
        """Check if a file exists in the target GitHub repository branch."""
        if not self.is_configured:
            return False
        try:
            clean_path = repo_relative_path.replace("\\", "/").lstrip("/")
            url = f"{self.API_BASE}/repos/{self.repo}/contents/{clean_path}?ref={self.branch}"
            with httpx.Client(timeout=8.0) as client:
                res = client.head(url, headers=self._get_headers())
                if res.status_code == 200:
                    return True
                elif res.status_code == 404:
                    return False
                # If HEAD fails or is restricted, try GET
                get_res = client.get(url, headers=self._get_headers())
                return get_res.status_code == 200
        except Exception:
            return False

    def commit_and_push_files(
        self,
        files_to_commit: List[Tuple[str, str]], # List of (repo_relative_path, file_content_str)
        commit_message: str
    ) -> Dict[str, Any]:
        """
        Multi-file commit via Git Data API:
        1. Get current commit SHA for branch.
        2. Get tree SHA for current commit.
        3. Create tree with new/modified blobs.
        4. Create new commit object.
        5. Update reference (heads/{branch}).
        """
        if not self.is_configured:
            raise ValueError("GitHub credentials not configured")

        headers = self._get_headers()

        with httpx.Client(timeout=45.0) as client:
            # 1. Get branch ref or check if repo is brand new/empty
            ref_res = client.get(f"{self.API_BASE}/repos/{self.repo}/git/ref/heads/{self.branch}", headers=headers)
            is_new_branch_or_empty = (ref_res.status_code in [404, 409])
            
            latest_commit_sha = None
            base_tree_sha = None

            if not is_new_branch_or_empty:
                if ref_res.status_code != 200:
                    raise RuntimeError(f"Could not get branch '{self.branch}' reference (HTTP {ref_res.status_code}): {ref_res.text}")
                latest_commit_sha = ref_res.json()["object"]["sha"]

                # 2. Get latest commit details to obtain base tree SHA
                commit_res = client.get(f"{self.API_BASE}/repos/{self.repo}/git/commits/{latest_commit_sha}", headers=headers)
                if commit_res.status_code == 200:
                    base_tree_sha = commit_res.json()["tree"]["sha"]

            # 3. Create tree entries
            tree_entries = []
            for rel_path, content_str in files_to_commit:
                tree_entries.append({
                    "path": rel_path.replace("\\", "/").lstrip("/"),
                    "mode": "100644",
                    "type": "blob",
                    "content": content_str
                })

            tree_payload = {"tree": tree_entries}
            if base_tree_sha:
                tree_payload["base_tree"] = base_tree_sha

            create_tree_res = client.post(f"{self.API_BASE}/repos/{self.repo}/git/trees", headers=headers, json=tree_payload)
            if create_tree_res.status_code != 201:
                raise RuntimeError(f"Failed to create git tree (HTTP {create_tree_res.status_code}): {create_tree_res.text}")
            
            new_tree_sha = create_tree_res.json()["sha"]

            # 4. Create commit
            commit_payload = {
                "message": commit_message,
                "tree": new_tree_sha,
                "parents": [latest_commit_sha] if latest_commit_sha else []
            }
            create_commit_res = client.post(f"{self.API_BASE}/repos/{self.repo}/git/commits", headers=headers, json=commit_payload)
            if create_commit_res.status_code != 201:
                raise RuntimeError(f"Failed to create commit (HTTP {create_commit_res.status_code}): {create_commit_res.text}")
            
            new_commit_sha = create_commit_res.json()["sha"]

            # 5. Update or create branch ref
            if is_new_branch_or_empty:
                create_ref_payload = {
                    "ref": f"refs/heads/{self.branch}",
                    "sha": new_commit_sha
                }
                update_ref_res = client.post(f"{self.API_BASE}/repos/{self.repo}/git/refs", headers=headers, json=create_ref_payload)
            else:
                update_ref_payload = {
                    "sha": new_commit_sha,
                    "force": False
                }
                update_ref_res = client.patch(f"{self.API_BASE}/repos/{self.repo}/git/refs/heads/{self.branch}", headers=headers, json=update_ref_payload)

            if update_ref_res.status_code not in [200, 201]:
                raise RuntimeError(f"Failed to update branch ref (HTTP {update_ref_res.status_code}): {update_ref_res.text}")

        return {
            "ok": True,
            "commit_sha": new_commit_sha,
            "commit_url": f"https://github.com/{self.repo}/commit/{new_commit_sha}",
            "files_count": len(files_to_commit),
            "message": commit_message
        }
