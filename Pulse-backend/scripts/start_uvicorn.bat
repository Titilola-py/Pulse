@echo off
set DATABASE_URL=sqlite+aiosqlite:///./pulse_db.sqlite
pushd %~dp0\..
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
popd
