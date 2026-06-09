"""PDF 瀏覽器啟動器：啟動本機 HTTP server 並開啟瀏覽器。

打包後（PyInstaller --onefile）：靜態檔（index.html / style.css / script.js）
從 sys._MEIPASS 提供；pdfs/ 從執行檔旁邊的資料夾讀取。
"""

import http.server
import socket
import socketserver
import sys
import threading
import webbrowser
from pathlib import Path
from urllib.parse import unquote, urlparse


def find_free_port(start: int = 8000) -> int:
    for port in range(start, start + 100):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    raise RuntimeError("找不到可用的 port")


def get_paths() -> tuple[Path, Path]:
    """回傳 (靜態檔目錄, 執行檔所在目錄)。"""
    if getattr(sys, "frozen", False):
        static_dir = Path(sys._MEIPASS)  # type: ignore[attr-defined]
        exe = Path(sys.executable).resolve()
        # 在 .app bundle 內：/path/Foo.app/Contents/MacOS/Foo
        if ".app/Contents/MacOS" in str(exe):
            app_dir = exe.parents[2].parent  # .app 旁邊
        else:
            app_dir = exe.parent
    else:
        here = Path(__file__).resolve().parent
        static_dir = here
        app_dir = here
    return static_dir, app_dir


STATIC_DIR: Path
APP_DIR: Path


class Handler(http.server.SimpleHTTPRequestHandler):
    """/pdfs/* 來自 APP_DIR/pdfs；其他靜態資源來自 STATIC_DIR。"""

    def translate_path(self, path: str) -> str:
        parsed = urlparse(path)
        clean = unquote(parsed.path).lstrip("/")
        parts = [p for p in clean.split("/") if p not in ("", ".", "..")]
        clean = "/".join(parts)

        if clean.startswith("pdfs/") or clean == "pdfs":
            return str(APP_DIR / clean)
        if clean == "":
            return str(STATIC_DIR / "index.html")
        return str(STATIC_DIR / clean)


def main() -> None:
    global STATIC_DIR, APP_DIR
    STATIC_DIR, APP_DIR = get_paths()
    pdfs_dir = APP_DIR / "pdfs"
    pdfs_dir.mkdir(exist_ok=True)

    port = find_free_port()
    url = f"http://localhost:{port}/"

    print("=" * 50)
    print("📄 PDF 瀏覽器")
    print("=" * 50)
    print(f"PDF 資料夾：{pdfs_dir}")
    print(f"開啟網址：  {url}")
    print()
    print("瀏覽器將自動開啟。要停止伺服器請按 Ctrl+C 或關閉此視窗。")
    print()

    threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n伺服器已停止。")


if __name__ == "__main__":
    main()
