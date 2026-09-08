#!/data/data/com.termux/files/usr/bin/bash
set -e

REMOTE="${1:?Usage: ./push-to-github.sh https://github.com/USERNAME/Cloud-Zen.git}"

git init
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"
git add .
git commit -m "Cloud-Zen initial backup foundation" || true
git push -u origin main

echo "Cloud-Zen pushed to GitHub."
