@echo off
setlocal
set "ROOT=%~dp0"

echo ============================================
echo   eduverse-local  dev launcher
echo ============================================
echo   web      : http://localhost:3000
echo   socket   : http://localhost:4000/health
echo   livekit  : ws://localhost:7880
echo ============================================
echo.

if not exist "%ROOT%apps\server\node_modules\.bin\tsx.cmd" (
  echo [ERROR] server dependencies are missing. Run: pnpm install
  pause
  exit /b 1
)
if not exist "%ROOT%apps\web\node_modules\.bin\next.cmd" (
  echo [ERROR] web dependencies are missing. Run: pnpm install
  pause
  exit /b 1
)

if exist "%ROOT%apps\infra\media\bin\livekit-server.exe" (
  echo [1/3] starting livekit media server on :7880 ...
  start "eduverse-livekit" cmd /k "cd /d "%ROOT%apps\infra\media" && bin\livekit-server.exe --config livekit.local.yaml"
) else (
  echo [1/3] SKIPPED: livekit-server.exe not found - audio/video will report "not configured".
  echo       Get it with:
  echo         curl -L -o lk.zip https://gh-proxy.com/https://github.com/livekit/livekit/releases/download/v1.13.7/livekit_1.13.7_windows_amd64.zip
  echo       then unzip livekit-server.exe into apps\infra\media\bin\
)

echo [2/3] starting socket.io server on :4000 ...
start "eduverse-server" cmd /k "cd /d "%ROOT%apps\server" && node_modules\.bin\tsx.cmd watch --env-file=.env src\index.ts"

echo [3/3] starting next.js web on :3000 ...
start "eduverse-web" cmd /k "cd /d "%ROOT%apps\web" && node_modules\.bin\next.cmd dev -p 3000"

echo.
echo Three windows opened. Close them to stop the services.
echo.
echo IMPORTANT - open the app at http://localhost:3000, NOT at a LAN address
echo   (e.g. http://192.168.x.x:3000).  Browsers only expose the camera and
echo   microphone on a secure origin, and only localhost counts; over a LAN IP
echo   navigator.mediaDevices is undefined, so 开启摄像头 / 开启麦克风 can never work.
echo.
echo Notes:
echo   - No Redis on this machine: the socket server runs with REDIS_URL=memory://
echo     (in-process state, single instance only).
echo   - LiveKit runs single-node with no Redis.
echo   - Classroom recording runs in the teacher's browser (not Egress) and is
echo     uploaded to data/uploads/recordings. Keep the classroom tab open while
echo     recording; leaving the page stops and saves the recording automatically.
echo   - Students are subscribe-only (canPublish=false): they can watch and listen
echo     but cannot publish camera or microphone. Only the teacher publishes.
timeout /t 10 >nul
