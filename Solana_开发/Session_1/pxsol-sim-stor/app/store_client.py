import base64
import json
import time
from pathlib import Path

import requests
from solana.rpc.api import Client
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.transaction import Transaction


RPC_URL = "https://api.devnet.solana.com"
PROGRAM_ID_STR = "Fvhhzt6hCB1NjYe9MMKU5Jxq1xzYeod8FWFh3ptsNWK7"
SYSTEM_PROGRAM_ID = "11111111111111111111111111111111"
SYSVAR_RENT_ID = "SysvarRent111111111111111111111111111111111"


def load_keypair_from_file(path: str) -> Keypair:
    secret = json.loads(Path(path).read_text())
    return Keypair.from_bytes(bytes(secret))


def get_program_id() -> Pubkey:
    return Pubkey.from_string(PROGRAM_ID_STR)


def derive_data_pda(user_pubkey: Pubkey, program_id: Pubkey | None = None) -> Pubkey:
    resolved_program_id = program_id or get_program_id()
    pda, _ = Pubkey.find_program_address([bytes(user_pubkey)], resolved_program_id)
    return pda


def rpc_post(method: str, params: list):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    }
    resp = requests.post(RPC_URL, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"RPC error: {data['error']}")
    return data["result"]


def get_account_data_base64(pubkey_str: str):
    result = rpc_post(
        "getAccountInfo",
        [
            pubkey_str,
            {
                "encoding": "base64",
                "commitment": "confirmed",
            },
        ],
    )
    value = result["value"]
    if value is None:
        return None
    return value["data"][0]


def build_write_instruction(user_pubkey: Pubkey, data_bytes: bytes) -> Instruction:
    program_id = get_program_id()
    data_pda = derive_data_pda(user_pubkey, program_id)

    accounts = [
        AccountMeta(user_pubkey, True, True),
        AccountMeta(data_pda, False, True),
        AccountMeta(Pubkey.from_string(SYSTEM_PROGRAM_ID), False, False),
        AccountMeta(Pubkey.from_string(SYSVAR_RENT_ID), False, False),
    ]

    return Instruction(program_id, data_bytes, accounts)


def send_write_transaction(wallet: Keypair, data_bytes: bytes):
    client = Client(RPC_URL)

    instruction = build_write_instruction(wallet.pubkey(), data_bytes)
    latest_blockhash = client.get_latest_blockhash().value.blockhash

    message = Message([instruction], wallet.pubkey())
    tx = Transaction([wallet], message, latest_blockhash)

    resp = client.send_transaction(tx)
    sig = str(resp.value)
    time.sleep(3)
    return sig


def read_data_for_pubkey(user_pubkey: Pubkey) -> bytes:
    data_pda = derive_data_pda(user_pubkey)
    encoded = get_account_data_base64(str(data_pda))
    if encoded is None:
        raise RuntimeError(f"PDA account does not exist yet: {data_pda}")
    return base64.b64decode(encoded)


def read_data(wallet: Keypair) -> bytes:
    return read_data_for_pubkey(wallet.pubkey())


def read_text_for_pubkey(pubkey_str: str) -> str:
    raw = read_data_for_pubkey(Pubkey.from_string(pubkey_str))
    return raw.decode("utf-8", errors="replace")


def write_text(keypair_path: str, text: str) -> dict:
    wallet = load_keypair_from_file(keypair_path)
    raw_bytes = text.encode("utf-8")
    signature = send_write_transaction(wallet, raw_bytes)
    return {
        "wallet": str(wallet.pubkey()),
        "pda": str(derive_data_pda(wallet.pubkey())),
        "signature": signature,
        "message": text,
    }


def describe_wallet(wallet: Keypair) -> dict:
    return {
        "rpc_url": RPC_URL,
        "wallet": str(wallet.pubkey()),
        "program_id": str(get_program_id()),
        "data_pda": str(derive_data_pda(wallet.pubkey())),
    }
