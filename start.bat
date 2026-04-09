@echo off
echo Starting Ollama and Ambient Server...

start "Ollama" powershell -NoExit -Command "$env:OLLAMA_ORIGINS='*'; ollama serve"
timeout /t 2 /nobreak >nul
start "Ambient Server" cmd /k "py -3.11 ambient_server.py"

echo Both services started.
