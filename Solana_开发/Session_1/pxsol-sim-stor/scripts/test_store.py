import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.store_client import describe_wallet, load_keypair_from_file, read_data, write_text


KEYPAIR_PATH = "/Users/yichenlin/second-wallet.json"


def print_addresses(wallet):
    info = describe_wallet(wallet)
    print("RPC URL      :", info["rpc_url"])
    print("Wallet       :", info["wallet"])
    print("Program ID   :", info["program_id"])
    print("Data PDA     :", info["data_pda"])


def cmd_write(text: str):
    wallet = load_keypair_from_file(KEYPAIR_PATH)
    print_addresses(wallet)
    result = write_text(KEYPAIR_PATH, text)
    print(f"Transaction signature: {result['signature']}")
    print("Write done.")


def cmd_read():
    wallet = load_keypair_from_file(KEYPAIR_PATH)
    print_addresses(wallet)
    raw = read_data(wallet)
    print("Raw bytes    :", raw)
    try:
        print("Decoded text :", raw.decode("utf-8"))
    except UnicodeDecodeError:
        print("Decoded text : <not valid UTF-8>")


def cmd_update(text: str):
    wallet = load_keypair_from_file(KEYPAIR_PATH)
    print_addresses(wallet)
    result = write_text(KEYPAIR_PATH, text)
    print(f"Transaction signature: {result['signature']}")
    print("Update done.")


def cmd_roundtrip(text1: str, text2: str):
    wallet = load_keypair_from_file(KEYPAIR_PATH)
    print_addresses(wallet)

    print("\n--- Step 1: write initial data ---")
    result1 = write_text(KEYPAIR_PATH, text1)
    print(f"Transaction signature: {result1['signature']}")
    raw1 = read_data(wallet)
    print("After write  :", raw1.decode("utf-8", errors="replace"))

    print("\n--- Step 2: update existing data ---")
    result2 = write_text(KEYPAIR_PATH, text2)
    print(f"Transaction signature: {result2['signature']}")
    raw2 = read_data(wallet)
    print("After update :", raw2.decode("utf-8", errors="replace"))


def usage():
    print(
        """
Usage:
  python3 scripts/test_store.py write "hello world"
  python3 scripts/test_store.py read
  python3 scripts/test_store.py update "new text"
  python3 scripts/test_store.py roundtrip "first text" "second text"
"""
    )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        usage()
        sys.exit(1)

    cmd = sys.argv[1].lower()

    try:
        if cmd == "write":
            if len(sys.argv) != 3:
                usage()
                sys.exit(1)
            cmd_write(sys.argv[2])
        elif cmd == "read":
            cmd_read()
        elif cmd == "update":
            if len(sys.argv) != 3:
                usage()
                sys.exit(1)
            cmd_update(sys.argv[2])
        elif cmd == "roundtrip":
            if len(sys.argv) != 4:
                usage()
                sys.exit(1)
            cmd_roundtrip(sys.argv[2], sys.argv[3])
        else:
            usage()
            sys.exit(1)
    except Exception as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
