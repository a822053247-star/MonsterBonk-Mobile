@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.12 或更新版本，然后再次打开本文件。
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo 正在安装游戏依赖，请稍候...
  call npm install
  if errorlevel 1 (
    echo 依赖安装未完成，请检查网络后重试。
    pause
    exit /b 1
  )
)
echo MonsterBonk Mobile 正在启动。
echo 电脑地址: http://localhost:5173/
echo 手机请连接相同 Wi-Fi，并打开下方 WLAN 对应的 Network 地址。
echo 游玩时请保持本窗口打开。停止服务器请按 Ctrl+C。
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:5173/'"
call npm run dev
if errorlevel 1 (
  echo 如果提示端口 5173 已占用，请先尝试直接打开 http://localhost:5173/
  pause
)
