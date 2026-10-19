"""Static file server for the local suites: python3 scripts/static-server.py [port]

http.server keeps a listen backlog of 5, and macOS resets the connections past it
when a page asks for many small files at once.
"""
import functools
import http.server
import os
import sys


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True

    def handle_error(self, request, client_address):
        if not isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            super().handle_error(request, client_address)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(Quiet, directory=root)
    with Server(("", port), handler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
