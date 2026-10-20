@echo off
setlocal

echo === [1/2] Check (format, lint, tests) ===
call npm run check || exit /b 1

echo.
echo === [2/2] Build ===
call npm run build:fast || exit /b 1

echo.
echo === All stages passed ===
