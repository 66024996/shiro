@echo off
cd /d %~dp0
set "HF_HOME=%~dp0hf_cache"
set "PYTHONDONTWRITEBYTECODE=1"
set "PYTHONPATH=%~dp0.venv\Lib\site-packages;%PYTHONPATH%"
.venv_omnivoice\Scripts\python.exe omnivoice_server.py --device cuda --port 5052 %*
