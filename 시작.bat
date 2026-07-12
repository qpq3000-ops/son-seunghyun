@echo off
chcp 65001 > nul
cd /d "%~dp0"
if not exist node_modules (
  echo [설치] 처음 실행이라 패키지를 설치합니다. 몇 분 걸릴 수 있어요...
  call npm install
)
call npm start
pause
