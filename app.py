import http.server
import socketserver
import webbrowser
import json
import random

PORT = 8000

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api"):
            self.handle_api()
        else:
            super().do_GET()

    def handle_api(self):
        # Simulate API failure randomly (50% chance of failure)
        if random.random() > 0.5:
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "API is unavailable, please try again."}).encode())
        else:
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"message": "Success", "data": "Sample API response"}).encode())

# Start the web server
with socketserver.TCPServer(("", PORT), MyHandler) as httpd:
    print(f"Server running at http://127.0.0.1:{PORT}")
    webbrowser.open(f"http://127.0.0.1:{PORT}")  # Open the browser automatically
    httpd.serve_forever()
