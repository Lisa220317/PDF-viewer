#!/bin/bash
# 把 launcher.py + 靜態檔打包成 macOS .app。
# 第一次跑會自動建 Python venv 並裝 PyInstaller。
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
    echo "→ 建立 Python venv 並安裝 PyInstaller..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --quiet --upgrade pip pyinstaller
else
    source .venv/bin/activate
fi

echo "→ 清除上次 build..."
rm -rf dist build PDF-Viewer.spec

echo "→ 開始打包..."
pyinstaller --onedir --windowed --name "PDF-Viewer" \
    --add-data "index.html:." \
    --add-data "style.css:." \
    --add-data "script.js:." \
    launcher.py

echo ""
echo "✓ 完成！產生的 .app 在：dist/PDF-Viewer.app"
echo ""
echo "使用方式："
echo "  1. 複製 dist/PDF-Viewer.app 到任意位置"
echo "  2. 在 .app 旁邊建一個 pdfs/ 資料夾，丟入 PDF"
echo "  3. 雙擊 PDF-Viewer.app"
