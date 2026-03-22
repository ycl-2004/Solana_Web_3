import os
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.store_client import describe_wallet, load_keypair_from_file, read_data, write_text


DEFAULT_KEYPAIR_PATH = "/Users/yichenlin/second-wallet.json"
SOLANA_CONFIG_PATH = Path.home() / ".config" / "solana" / "cli" / "config.yml"


def parse_args(argv: list[str]):
    keypair_path = None
    args = []
    index = 0

    while index < len(argv):
        arg = argv[index]
        if arg == "--keypair":
            if index + 1 >= len(argv):
                raise ValueError("--keypair requires a file path.")
            keypair_path = argv[index + 1]
            index += 2
            continue
        args.append(arg)
        index += 1

    return keypair_path, args


def keypair_from_solana_config() -> str | None:
    if not SOLANA_CONFIG_PATH.exists():
        return None

    for line in SOLANA_CONFIG_PATH.read_text().splitlines():
        if line.startswith("keypair_path:"):
            return line.split(":", 1)[1].strip()
    return None


def resolve_keypair_path(cli_keypair_path: str | None) -> str:
    if cli_keypair_path:
        return cli_keypair_path

    env_keypair_path = os.environ.get("SOLANA_KEYPAIR_PATH")
    if env_keypair_path:
        return env_keypair_path

    config_keypair_path = keypair_from_solana_config()
    if config_keypair_path:
        return config_keypair_path

    return DEFAULT_KEYPAIR_PATH


def load_wallet_and_path(cli_keypair_path: str | None):
    keypair_path = resolve_keypair_path(cli_keypair_path)
    wallet = load_keypair_from_file(keypair_path)
    return wallet, keypair_path


def print_addresses(wallet, keypair_path: str):
    info = describe_wallet(wallet)
    print("RPC URL      :", info["rpc_url"])
    print("Keypair Path :", keypair_path)
    print("Wallet       :", info["wallet"])
    print("Program ID   :", info["program_id"])
    print("Data PDA     :", info["data_pda"])


def cmd_write(text: str, cli_keypair_path: str | None):
    wallet, keypair_path = load_wallet_and_path(cli_keypair_path)
    print_addresses(wallet, keypair_path)
    result = write_text(keypair_path, text)
    print(f"Transaction signature: {result['signature']}")
    print("Write done.")


def cmd_read(cli_keypair_path: str | None):
    wallet, keypair_path = load_wallet_and_path(cli_keypair_path)
    print_addresses(wallet, keypair_path)
    raw = read_data(wallet)
    print("Raw bytes    :", raw)
    try:
        print("Decoded text :", raw.decode("utf-8"))
    except UnicodeDecodeError:
        print("Decoded text : <not valid UTF-8>")


def cmd_update(text: str, cli_keypair_path: str | None):
    wallet, keypair_path = load_wallet_and_path(cli_keypair_path)
    print_addresses(wallet, keypair_path)
    result = write_text(keypair_path, text)
    print(f"Transaction signature: {result['signature']}")
    print("Update done.")


def cmd_roundtrip(text1: str, text2: str, cli_keypair_path: str | None):
    wallet, keypair_path = load_wallet_and_path(cli_keypair_path)
    print_addresses(wallet, keypair_path)

    print("\n--- Step 1: write initial data ---")
    result1 = write_text(keypair_path, text1)
    print(f"Transaction signature: {result1['signature']}")
    raw1 = read_data(wallet)
    print("After write  :", raw1.decode("utf-8", errors="replace"))

    print("\n--- Step 2: update existing data ---")
    result2 = write_text(keypair_path, text2)
    print(f"Transaction signature: {result2['signature']}")
    raw2 = read_data(wallet)
    print("After update :", raw2.decode("utf-8", errors="replace"))


def usage():
    print(
        """
Usage:
  python3 scripts/test_store.py [--keypair /path/to/id.json] write "hello world"
  python3 scripts/test_store.py [--keypair /path/to/id.json] read
  python3 scripts/test_store.py [--keypair /path/to/id.json] update "new text"
  python3 scripts/test_store.py [--keypair /path/to/id.json] roundtrip "first text" "second text"

Keypair resolution order:
  1. --keypair /path/to/id.json
  2. SOLANA_KEYPAIR_PATH environment variable
  3. ~/.config/solana/cli/config.yml
  4. built-in fallback path
"""
    )


if __name__ == "__main__":
    try:
        cli_keypair_path, args = parse_args(sys.argv[1:])
    except Exception as exc:
        print(f"ERROR: {exc}")
        usage()
        sys.exit(1)

    if len(args) < 1:
        usage()
        sys.exit(1)

    cmd = args[0].lower()

    try:
        if cmd == "write":
            if len(args) != 2:
                usage()
                sys.exit(1)
            cmd_write(args[1], cli_keypair_path)
        elif cmd == "read":
            if len(args) != 1:
                usage()
                sys.exit(1)
            cmd_read(cli_keypair_path)
        elif cmd == "update":
            if len(args) != 2:
                usage()
                sys.exit(1)
            cmd_update(args[1], cli_keypair_path)
        elif cmd == "roundtrip":
            if len(args) != 3:
                usage()
                sys.exit(1)
            cmd_roundtrip(args[1], args[2], cli_keypair_path)
        else:
            usage()
            sys.exit(1)
    except Exception as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
