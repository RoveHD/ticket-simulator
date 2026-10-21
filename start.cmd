@echo off
chcp 65001 >nul
where node >nul 2>&1 || (echo Node.js fehlt. Installieren: https://nodejs.org ^(LTS^) & pause & exit /b 1)
node "%~dp0launch.js"
if errorlevel 1 pause
