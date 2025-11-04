@echo off
chcp 65001 >nul
echo ========================================
echo    海外爆款短剧AI平台 - 开发服务器
echo ========================================
echo.

echo [1/3] 正在检查并关闭占用端口3005的进程...
for /f "tokens=5" %%a in ('netstat -aon ^| find "3005" ^| find "LISTENING"') do (
    echo 发现进程 PID: %%a，正在关闭...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [2/3] 正在启动开发服务器...
echo 服务器地址: http://localhost:3005
echo.
echo 提示: 按 Ctrl+C 可停止服务器
echo ========================================
echo.

start /B npm run dev

timeout /t 3 /nobreak >nul

echo [3/3] 正在打开浏览器...
start http://localhost:3005

echo.
echo 开发服务器已启动！
echo 浏览器将自动打开，或手动访问: http://localhost:3005
echo.
pause

