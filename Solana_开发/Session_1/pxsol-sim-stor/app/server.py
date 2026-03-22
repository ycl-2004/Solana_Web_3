import json
import sys
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.store_client import (
    PROGRAM_ID_STR,
    RPC_URL,
    derive_data_pda,
    load_keypair_from_file,
    read_text_for_pubkey,
    write_text,
)


ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "web"
DATA_DIR = ROOT / "data"
BOARD_FILE = DATA_DIR / "board_users.json"


def ensure_data_dir():
    DATA_DIR.mkdir(exist_ok=True)
    if not BOARD_FILE.exists():
        BOARD_FILE.write_text("[]\n")


def load_board_users() -> list[dict]:
    ensure_data_dir()
    return json.loads(BOARD_FILE.read_text())


def save_board_users(users: list[dict]):
    ensure_data_dir()
    BOARD_FILE.write_text(json.dumps(users, ensure_ascii=False, indent=2) + "\n")


def upsert_board_user(name: str, keypair_path: str, wallet: str, pda: str, signature: str):
    users = load_board_users()
    updated_at = datetime.now(timezone.utc).isoformat()
    new_entry = {
        "name": name,
        "keypair_path": keypair_path,
        "wallet": wallet,
        "pda": pda,
        "last_signature": signature,
        "updated_at": updated_at,
    }

    for index, user in enumerate(users):
        if user["wallet"] == wallet:
            users[index] = {**user, **new_entry}
            save_board_users(users)
            return

    users.append(new_entry)
    save_board_users(users)


def build_board_view() -> dict:
    entries = []
    for user in load_board_users():
        try:
            message = read_text_for_pubkey(user["wallet"])
            status = "ok"
        except Exception as exc:
            message = ""
            status = f"error: {exc}"

        entries.append(
            {
                "name": user["name"],
                "wallet": user["wallet"],
                "pda": user["pda"],
                "message": message,
                "status": status,
                "updated_at": user.get("updated_at"),
                "last_signature": user.get("last_signature"),
            }
        )

    return {
        "rpc_url": RPC_URL,
        "program_id": PROGRAM_ID_STR,
        "entries": entries,
        "note": "Current on-chain program supports one latest message per wallet.",
    }


class MessageBoardHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/":
            return self.serve_file("index.html", "text/html; charset=utf-8")
        if parsed.path == "/app.js":
            return self.serve_file("app.js", "application/javascript; charset=utf-8")
        if parsed.path == "/styles.css":
            return self.serve_file("styles.css", "text/css; charset=utf-8")
        if parsed.path == "/api/board":
            return self.send_json(build_board_view())
        if parsed.path == "/api/wallet-info":
            params = parse_qs(parsed.query)
            return self.handle_wallet_info(params.get("keypairPath", [""])[0])
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self):
        if self.path != "/api/post":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        try:
            payload = self.read_json_body()
            name = payload.get("name", "").strip()
            keypair_path = payload.get("keypairPath", "").strip()
            message = payload.get("message", "").strip()

            if not name:
                raise ValueError("Name is required.")
            if not keypair_path:
                raise ValueError("Keypair path is required.")
            if not message:
                raise ValueError("Message is required.")

            result = write_text(keypair_path, message)
            upsert_board_user(name, keypair_path, result["wallet"], result["pda"], result["signature"])

            self.send_json(
                {
                    "ok": True,
                    "result": result,
                    "board": build_board_view(),
                }
            )
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def handle_wallet_info(self, keypair_path: str):
        try:
            if not keypair_path.strip():
                raise ValueError("Keypair path is required.")
            wallet = load_keypair_from_file(keypair_path.strip())
            self.send_json(
                {
                    "ok": True,
                    "wallet": str(wallet.pubkey()),
                    "pda": str(derive_data_pda(wallet.pubkey())),
                }
            )
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8")
        return json.loads(body) if body else {}

    def serve_file(self, filename: str, content_type: str):
        path = STATIC_DIR / filename
        if not path.exists():
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        content = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK):
        content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, fmt: str, *args):
        return


def run_server(host: str = "127.0.0.1", port: int = 8000):
    ensure_data_dir()
    server = ThreadingHTTPServer((host, port), MessageBoardHandler)
    print(f"Message board running at http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
