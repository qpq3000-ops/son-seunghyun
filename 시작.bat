@echo off
chcp 65001 > nul
cd /d "%~dp0"
if not exist node_modules (
  echo [설치] 처음 실행이라 패키지를 설치합니다. 몇 분 걸릴 수 있어요...
  call npm install
)
:loop
call npm start
echo.
echo [알림] 서버가 종료되었습니다. 3초 후 자동으로 다시 시작합니다...
echo        (완전히 끄려면 이 창을 닫으세요)
timeout /t 3 > nul
goto loop
