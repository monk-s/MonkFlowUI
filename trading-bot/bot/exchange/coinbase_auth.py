"""HMAC-SHA256 request signing for Coinbase Advanced API v3."""

import hashlib
import hmac
import time
from typing import Optional


class CoinbaseAuth:
    """
    Signs requests for the Coinbase Advanced Trade API.

    Coinbase uses HMAC-SHA256 with:
    - timestamp + method + path + body as the message
    - API secret as the key
    """

    def __init__(self, api_key: str, api_secret: str):
        self.api_key = api_key
        self.api_secret = api_secret

    def get_headers(
        self,
        method: str,
        path: str,
        body: str = "",
    ) -> dict[str, str]:
        """
        Generate authenticated headers for a Coinbase API request.

        Args:
            method: HTTP method (GET, POST, DELETE)
            path: Request path (e.g., /api/v3/brokerage/orders)
            body: Request body as string (empty string for GET)

        Returns:
            Dict of headers to include in the request.
        """
        timestamp = str(int(time.time()))
        message = timestamp + method.upper() + path + body

        signature = hmac.new(
            self.api_secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        return {
            "CB-ACCESS-KEY": self.api_key,
            "CB-ACCESS-SIGN": signature,
            "CB-ACCESS-TIMESTAMP": timestamp,
            "Content-Type": "application/json",
        }
