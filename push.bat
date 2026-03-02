@echo off
git add .
git commit -m "Auto Update %date% %time%" || echo No changes to commit, skipping...
git pull --rebase origin main
git push origin main
echo ✅ Done! Everything is on GitHub.
pause