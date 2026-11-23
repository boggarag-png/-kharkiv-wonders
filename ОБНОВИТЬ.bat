@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Отправляю изменения сайта на GitHub...
git add -A
git commit -m "Оновлення сайту %date% %time%"
git push -u origin main
echo.
echo Готово! Сайт обновится через 1-2 минуты:
echo https://boggarag-png.github.io/-kharkiv-wonders/
pause
