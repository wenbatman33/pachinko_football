#!/usr/bin/env python3
# 本機開發伺服器：關閉瀏覽器快取，改完檔案重新整理就一定是最新版
# 用法：python3 tools/serve.py [port]（預設 8765，在專案根目錄執行）
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128   # 預設只有 5，遊戲一次載入上百張圖會被拒絕連線（ERR_CONNECTION_RESET）
    daemon_threads = True


if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    Server(('127.0.0.1', port), NoCacheHandler).serve_forever()
