"""
WebSocket test client: acts like a browser kitchen display.

The feed needs a staff/manager token (from POST /api/auth/login/):

  python ws_client.py "ws://127.0.0.1:8000/ws/kitchen/?token=<token>"
"""
import asyncio
import sys

import websockets

DEFAULT_URL = "ws://127.0.0.1:8000/ws/kitchen/"


async def main(url):
    while True:
        try:
            async with websockets.connect(url) as ws:
                print(f"connected to {url}", flush=True)
                async for message in ws:
                    print(message, flush=True)
            print("server closed the connection; retrying in 1s", flush=True)
        except (OSError, websockets.ConnectionClosed) as exc:
            print(f"disconnected ({exc}); retrying in 1s", flush=True)
        await asyncio.sleep(1)


if __name__ == "__main__":
    try:
        asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL))
    except KeyboardInterrupt:
        pass
