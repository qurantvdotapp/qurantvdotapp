#!/usr/bin/env python3
"""
Launcher for Quran Ayah Timing Studio.
Starts the FastAPI backend and opens the dashboard in your default browser.
"""

import os
import sys
import webbrowser
import subprocess
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VENV_PYTHON = os.path.join(ROOT, ".venv", "Scripts", "python.exe")
if not os.path.exists(VENV_PYTHON):
    VENV_PYTHON = sys.executable

SERVER_SCRIPT = os.path.join(ROOT, "timing-studio", "backend", "server.py")

def main():
    print("=" * 60)
    print("   Quran Ayah Timing Studio Dashboard")
    print("=" * 60)
    print(f"[*] Starting backend on http://localhost:8765 ...")
    
    # Open browser after short delay
    def open_browser():
        time.sleep(1.5)
        webbrowser.open("http://localhost:8765")
        
    import threading
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run uvicorn server
    cmd = [VENV_PYTHON, "-m", "uvicorn", "timing-studio.backend.server:app", "--host", "0.0.0.0", "--port", "8765", "--reload"]
    subprocess.run(cmd, cwd=ROOT)

if __name__ == "__main__":
    main()
