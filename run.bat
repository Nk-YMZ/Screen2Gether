@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: Screen2Gether Windows 启动脚本
:: 注意：Windows 需要手动安装虚拟音频设备

title Screen2Gether

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║         Screen2Gether Windows 启动                        ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Node.js 未安装
    echo 请从 https://nodejs.org 下载安装
    pause
    exit /b 1
)

:: 检查 npm 依赖
if not exist "node_modules" (
    echo [信息] 正在安装 npm 依赖...
    call npm install --silent
)

:: 获取本机 IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set LOCAL_IP=%%a
    set LOCAL_IP=!LOCAL_IP: =!
    goto :got_ip
)
:got_ip

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║            Screen2Gether 已启动！                          ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo   ► 本地访问:   http://localhost:3000
if defined LOCAL_IP (
    echo   ► 局域网访问: http://!LOCAL_IP!:3000
)
echo.
echo ┌────────────────────────────────────────────────────────────┐
echo │  Windows 音频配置说明                                      │
echo ├────────────────────────────────────────────────────────────┤
echo │                                                            │
echo │  Windows 不支持自动配置虚拟音频设备，需要手动安装：        │
echo │                                                            │
echo │  1. 下载安装 VB-Cable:                                     │
echo │     https://vb-audio.com/Cable/                           │
echo │                                                            │
echo │  2. 配置音频：                                             │
echo │     - 打开「声音设置」→「更多声音设置」                    │
echo │     - 将「播放」默认设备设为「CABLE Input」                │
echo │     - 这样所有音频会输出到虚拟设备                         │
echo │                                                            │
echo │  3. 在浏览器中共享屏幕时：                                 │
echo │     - 选择「共享音频」                                     │
echo │     - 或选择「CABLE Output」作为音频源                     │
echo │                                                            │
echo │  4. 如果你想同时听到声音：                                 │
echo │     - 打开「声音设置」→「录制」                            │
echo │     - 右键「CABLE Output」→「属性」→「侦听」               │
echo │     - 勾选「侦听此设备」→ 选择你的扬声器/耳机              │
echo │                                                            │
echo ├────────────────────────────────────────────────────────────┤
echo │  按 Ctrl+C 停止服务器                                      │
echo └────────────────────────────────────────────────────────────┘
echo.

:: 启动服务器
node server/index.js
