import os
import sys
import threading
import subprocess
import urllib.request
import re
import json
import asyncio
import tempfile
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
from shazamio import Shazam

FFMPEG_PATH = r"C:\Users\adity\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin\ffmpeg.exe"
PORT = 8080
PEER_PORT = 9000
CLOUDFLARED_EXE = "cloudflared.exe"
TUNNEL_URL = None
PEER_TUNNEL_URL = None
LAPTOP_PEER_ID = None

def download_cloudflared():
    if not os.path.exists(CLOUDFLARED_EXE):
        print("Downloading cloudflared.exe...")
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        try:
            urllib.request.urlretrieve(url, CLOUDFLARED_EXE)
            print("Download complete.")
        except Exception as e:
            print(f"Failed to download cloudflared: {e}")
            sys.exit(1)

def run_cloudflared():
    global TUNNEL_URL
    download_cloudflared()
    print("Starting Cloudflare Tunnel for HTTP server...")
    process = subprocess.Popen(
        [CLOUDFLARED_EXE, "tunnel", "--url", f"http://localhost:{PORT}"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding='utf-8',
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    )
    while True:
        line = process.stderr.readline()
        if not line: break
        print(f"[TUNNEL] {line.strip()}")
        matches = re.findall(r"(https://[a-zA-Z0-9-]+\.trycloudflare\.com)", line)
        if matches:
            TUNNEL_URL = matches[0]
            print(f">>>> HTTP Tunnel URL: {TUNNEL_URL} <<<<")

def run_peer_tunnel():
    global PEER_TUNNEL_URL
    download_cloudflared()
    print("Starting Cloudflare Tunnel for PeerJS server...")
    process = subprocess.Popen(
        [CLOUDFLARED_EXE, "tunnel", "--url", f"http://localhost:{PEER_PORT}"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding='utf-8',
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    )
    while True:
        line = process.stderr.readline()
        if not line: break
        matches = re.findall(r"(https://[a-zA-Z0-9-]+\.trycloudflare\.com)", line)
        if matches:
            PEER_TUNNEL_URL = matches[0]
            print(f">>>> PeerJS Tunnel URL: {PEER_TUNNEL_URL} <<<<")

def run_peer_server():
    print(f"Starting PeerJS server on port {PEER_PORT}...")
    subprocess.Popen(
        [r"C:\Users\adity\AppData\Roaming\npm\peerjs.cmd", "--port", str(PEER_PORT), "--path", "/"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )


def get_broadcast_html(peer_tunnel_url):
    host = peer_tunnel_url.replace("https://", "").replace("http://", "").strip("/") if peer_tunnel_url else "0.peerjs.com"
    peer_config = f"{{ host: '{host}', port: 443, path: '/', secure: true }}" if peer_tunnel_url else ""
    
    return f"""<!DOCTYPE html>
<html>
<head>
    <title>Ambient Broadcaster</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{ font-family: sans-serif; text-align: center; background: #0b0c10; color: #fff; padding: 40px 20px; }}
        h2 {{ color: #a78bfa; }}
        #status {{ margin-top: 20px; color: #aaa; font-size: 14px; }}
        .dot {{ width: 14px; height: 14px; background: #ef4444; border-radius: 50%; display: inline-block; margin-right: 8px; animation: pulse 1s infinite; }}
        @keyframes pulse {{ 0%,100%{{opacity:1}} 50%{{opacity:0.3}} }}
    </style>
</head>
<body>
    <h2>🎙️ Ambient Broadcaster</h2>
    <div id="status">Requesting microphone...</div>
    <script src="https://unpkg.com/peerjs@1.5.1/dist/peerjs.min.js"></script>
    <script>
        const LAPTOP_PEER_ID = 'doctorai-' + Math.random().toString(36).substr(2, 8);

        navigator.mediaDevices.getUserMedia({{ audio: true, video: false }}).then((stream) => {{
            const peer = new Peer(LAPTOP_PEER_ID, {peer_config});

            peer.on('open', (id) => {{
                fetch('/api/peer-id', {{
                    method: 'POST',
                    headers: {{'Content-Type':'application/json'}},
                    body: JSON.stringify({{id}})
                }}).then(() => {{
                    document.getElementById('status').innerHTML = '<span class="dot"></span>Ready! Mobile can now connect. Keep this tab open.';
                }}).catch(e => {{
                    document.getElementById('status').textContent = 'Server registration failed: ' + e.message;
                }});
            }});

            peer.on('connection', (conn) => {{
                conn.on('data', (data) => {{
                    if (data && data.action === 'callMe') {{
                        const call = peer.call(data.myId, stream);
                        document.getElementById('status').innerHTML = '<span class="dot"></span>📱 Phone connected! Streaming mic live...';
                    }}
                }});
            }});

            peer.on('call', (call) => {{
                call.answer(stream);
                document.getElementById('status').innerHTML = '<span class="dot"></span>📱 Phone connected! Streaming mic live...';
            }});

            peer.on('error', (e) => {{
                document.getElementById('status').textContent = 'Error: ' + e.type + '. Refresh to retry.';
            }});
        }}).catch((err) => {{
            document.getElementById('status').textContent = 'Mic denied: ' + err.message + '. Allow mic and refresh.';
        }});
    </script>
</body>
</html>"""


def get_mobile_html(tunnel_url, peer_tunnel_url):
    host = peer_tunnel_url.replace("https://", "").replace("http://", "").strip("/") if peer_tunnel_url else "0.peerjs.com"
    peer_config = f"{{ host: '{host}', port: 443, path: '/', secure: true }}" if peer_tunnel_url else ""
    return f"""<!DOCTYPE html>
<html>
<head>
    <title>Ambient Listener</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{ font-family: sans-serif; text-align: center; background: #0b0c10; color: #fff; padding: 40px 20px; }}
        h2 {{ color: #a78bfa; }}
        button {{ padding: 16px 32px; font-size: 18px; border-radius: 12px; background: #7c3aed; color: white; border: none; margin-top: 24px; cursor: pointer; }}
        #status {{ margin-top: 20px; color: #aaa; font-size: 14px; }}
        audio {{ margin-top: 20px; width: 100%; }}
    </style>
</head>
<body>
    <h2>🎧 Ambient Listener</h2>
    <p>Tap below to listen to the laptop mic remotely.</p>
    <button id="connectBtn">Start Listening</button>
    <div id="status">Waiting...</div>
    <audio id="remoteAudio" autoplay controls></audio>
    <script src="https://unpkg.com/peerjs@1.5.1/dist/peerjs.min.js"></script>
    <script>
        document.getElementById('connectBtn').addEventListener('click', async () => {{
            document.getElementById('status').textContent = 'Fetching broadcaster info...';

            // Poll for laptop peer ID (broadcaster tab may take a few seconds)
            let laptopId = null;
            for (let i = 0; i < 15; i++) {{
                try {{
                    const res = await fetch('/api/peer-id');
                    const data = await res.json();
                    if (data.id) {{ laptopId = data.id; break; }}
                }} catch(e) {{
                    document.getElementById('status').textContent = 'Cannot reach server: ' + e.message;
                    return;
                }}
                document.getElementById('status').textContent = 'Waiting for broadcaster... (' + (i+1) + 's)';
                await new Promise(r => setTimeout(r, 1000));
            }}

            if (!laptopId) {{
                document.getElementById('status').textContent = 'Laptop not broadcasting. Open the broadcaster tab and allow mic first.';
                return;
            }}

            document.getElementById('status').textContent = 'Connecting to laptop...';
            const peer = new Peer({peer_config});

            peer.on('open', (id) => {{
                const conn = peer.connect(laptopId);
                conn.on('open', () => {{
                    conn.send({{action: 'callMe', myId: id}});
                }});

                peer.on('call', (call) => {{
                    call.answer();
                    call.on('stream', (stream) => {{
                        const audio = document.getElementById('remoteAudio');
                        audio.srcObject = stream;
                        audio.volume = 1.0;
                        audio.play().catch(e => console.error("Play error:", e));
                        document.getElementById('status').textContent = '✅ Connected! Listening to laptop mic...';
                    }});
                    call.on('error', (e) => {{
                        document.getElementById('status').textContent = 'Call error: ' + e;
                    }});
                }});
            }});

            peer.on('error', (e) => {{
                document.getElementById('status').textContent = 'Peer error: ' + e.type + '. Try again.';
            }});
        }});
    </script>
</body>
</html>"""


class AmbientHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # suppress request logs

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass

    def send_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        try:
            if self.path == '/api/tunnel':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "url": TUNNEL_URL,
                    "peerUrl": PEER_TUNNEL_URL,
                    "ready": TUNNEL_URL is not None and PEER_TUNNEL_URL is not None
                }).encode())
                return

            if self.path == '/api/peer-id':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({"id": LAPTOP_PEER_ID}).encode())
                return

            if self.path == '/' or self.path == '/index.html':
                html = get_mobile_html(TUNNEL_URL, PEER_TUNNEL_URL)
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.end_headers()
                self.wfile.write(html.encode())
                return

            if self.path == '/broadcast':
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.end_headers()
                self.wfile.write(get_broadcast_html(PEER_TUNNEL_URL).encode())
                return

            self.send_response(404)
            self.end_headers()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass

    def do_POST(self):
        if self.path == '/api/peer-id':
            global LAPTOP_PEER_ID
            content_length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(content_length))
            LAPTOP_PEER_ID = data.get('id')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors()
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True}).encode())
            return

        if self.path == '/api/identify-music':
            content_length = int(self.headers.get('Content-Length', 0))
            audio_data = self.rfile.read(content_length)

            with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as f:
                f.write(audio_data)
                tmp_webm = f.name
            tmp_wav = tmp_webm.replace('.webm', '.wav')

            try:
                subprocess.run(
                    [FFMPEG_PATH, '-y', '-i', tmp_webm, '-ar', '44100', '-ac', '1', tmp_wav],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
                )
                shazam = Shazam()
                result = asyncio.run(shazam.recognize(tmp_wav))
                track = result.get('track')
                if track:
                    meta = track.get('sections', [{}])[0].get('metadata', [])
                    album = next((m['text'] for m in meta if m.get('title') == 'Album'), 'N/A')
                    released = next((m['text'] for m in meta if m.get('title') == 'Released'), 'N/A')
                    response = {
                        'success': True,
                        'title': track.get('title', 'Unknown'),
                        'artist': track.get('subtitle', 'Unknown'),
                        'album': album, 'released': released,
                        'coverart': track.get('images', {}).get('coverart', '')
                    }
                else:
                    response = {'success': False, 'error': 'Song not recognized'}
            except subprocess.CalledProcessError:
                response = {'success': False, 'error': 'Audio conversion failed'}
            except Exception as e:
                response = {'success': False, 'error': str(e)}
            finally:
                if os.path.exists(tmp_webm): os.unlink(tmp_webm)
                if os.path.exists(tmp_wav): os.unlink(tmp_wav)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors()
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
            return

        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    threading.Thread(target=run_peer_server, daemon=True).start()
    threading.Thread(target=run_cloudflared, daemon=True).start()
    threading.Thread(target=run_peer_tunnel, daemon=True).start()
    server = ThreadedHTTPServer(('', PORT), AmbientHandler)
    print(f"Server running on port {PORT}. Waiting for tunnel URLs...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
