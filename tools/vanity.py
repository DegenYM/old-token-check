"""Generate a vanity EVM address locally. The private key is written straight to .env (mode 600)
and never printed. Every candidate uses fresh OS randomness (secrets.token_bytes), not a seeded
or incrementing scheme, so the result is as strong as any normal wallet key.
Usage: python3 tools/vanity.py <hex-suffix> [.env path]"""
import os, sys, secrets, multiprocessing as mp
from coincurve import PrivateKey
from eth_hash.auto import keccak

def worker(suffix, found, q):
    while not found.is_set():
        for _ in range(5000):
            raw = secrets.token_bytes(32)
            try: pk = PrivateKey(raw)
            except Exception: continue
            addr = keccak(pk.public_key.format(compressed=False)[1:])[-20:].hex()
            if addr.endswith(suffix):
                found.set(); q.put(raw); return

def checksum(a):
    h = keccak(a.encode()).hex()
    return "0x" + "".join(c.upper() if c.isalpha() and int(h[i], 16) >= 8 else c for i, c in enumerate(a))

if __name__ == "__main__":
    suffix = sys.argv[1].lower()
    out = sys.argv[2] if len(sys.argv) > 2 else ".env"
    if os.path.exists(out) and "TIP_PRIVATE_KEY" in open(out).read():
        sys.exit(f"{out} already has TIP_PRIVATE_KEY; refusing to overwrite")
    found, q = mp.Event(), mp.Queue()
    procs = [mp.Process(target=worker, args=(suffix, found, q)) for _ in range(os.cpu_count() or 4)]
    for p in procs: p.start()
    raw = q.get()
    for p in procs: p.terminate()
    # independent re-derivation with a second library
    from eth_keys import keys
    addr = keys.PrivateKey(raw).public_key.to_checksum_address()
    assert addr.lower().endswith(suffix) and addr == checksum(addr[2:].lower())
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(fd, "a") as f:
        f.write(f"# Tip wallet for oldtokencheck.com. Import into a wallet, back it up, then delete this line.\n")
        f.write(f"TIP_ADDRESS={addr}\nTIP_PRIVATE_KEY=0x{raw.hex()}\n")
    os.chmod(out, 0o600)
    print(addr)
