"""
JWT request signing for Coinbase Advanced Trade API (CDP key format).

Coinbase migrated from HMAC-SHA256 (legacy "Advanced Trade" keys) to
JWT-based authentication with ECDSA P-256 keys generated via the
Coinbase Developer Platform. This module signs each request with a
short-lived (2-minute) JWT.

ENV VARS
--------
    CB_API_KEY      Full key name in form
                    "organizations/{ORG_UUID}/apiKeys/{KEY_UUID}"
                    OR just the bare key UUID (Coinbase accepts either
                    in many cases). Goes into JWT `kid` and `sub`.

    CB_API_SECRET   PEM-formatted private key. Either:
                      -----BEGIN EC PRIVATE KEY-----   (ECDSA SEC1)
                      ...base64...
                      -----END EC PRIVATE KEY-----
                    OR:
                      -----BEGIN PRIVATE KEY-----      (PKCS8 — Ed25519 or ECDSA)
                      ...
                      -----END PRIVATE KEY-----

                    Railway env vars handle multi-line strings, but if the
                    paste used literal "\n" escapes those get converted.

    CB_JWT_ALGORITHM  Optional. Defaults to "ES256" (matches ECDSA P-256,
                      the algorithm Coinbase recommends for Advanced Trade).
                      Set to "EdDSA" if you generated an Ed25519 key instead.

JWT FORMAT (per Coinbase CDP docs)
----------------------------------
    Header:
        alg:   <algorithm>          ES256 or EdDSA
        kid:   <api_key_name>
        nonce: <16-byte random hex>
        typ:   JWT

    Payload:
        iss:   "cdp"
        nbf:   <unix_seconds>
        exp:   <unix_seconds + 120>
        sub:   <api_key_name>
        uri:   "<METHOD> <host><path>"            e.g. "GET api.coinbase.com/api/v3/brokerage/accounts"

The signed JWT is sent as the Authorization header:
        Authorization: Bearer <jwt>

REFERENCES
----------
- https://docs.cdp.coinbase.com/api-reference/v2/authentication
- https://docs.cdp.coinbase.com/advanced-trade/docs/auth-overview
"""

from __future__ import annotations

import os
import secrets
import time
from typing import Optional
from urllib.parse import urlparse

import jwt


class CoinbaseAuth:
    """Generate JWT-signed headers for Coinbase Advanced Trade API requests."""

    def __init__(self, api_key: str, api_secret: str, base_url: str = "https://api.coinbase.com"):
        self.api_key = (api_key or "").strip()
        # Convert literal "\n" → real newlines (handles Railway pastes that
        # stringified the PEM). Strip whitespace defensively.
        self.api_secret = (api_secret or "").replace("\\n", "\n").strip()
        self.base_url = base_url.rstrip("/")
        self.host = urlparse(base_url).netloc  # e.g. "api.coinbase.com"
        self.algorithm = os.environ.get("CB_JWT_ALGORITHM", "ES256").strip()

    def _build_jwt(self, method: str, path: str) -> str:
        """Build and sign a short-lived JWT for one Coinbase request."""
        if not self.api_key:
            raise ValueError("CB_API_KEY is empty — cannot sign Coinbase requests.")
        if not self.api_secret:
            raise ValueError("CB_API_SECRET is empty — cannot sign Coinbase requests.")
        if "PRIVATE KEY" not in self.api_secret:
            raise ValueError(
                "CB_API_SECRET does not look like a PEM private key. "
                "Coinbase CDP keys must be in the form '-----BEGIN [EC ]PRIVATE KEY-----...'. "
                f"Got first 30 chars: {self.api_secret[:30]!r}"
            )

        now = int(time.time())
        uri = f"{method.upper()} {self.host}{path.split('?')[0]}"  # strip query string

        payload = {
            "iss": "cdp",
            "nbf": now,
            "exp": now + 120,  # 2-minute window (Coinbase max)
            "sub": self.api_key,
            "uri": uri,
        }
        headers = {
            "alg": self.algorithm,
            "kid": self.api_key,
            "nonce": secrets.token_hex(16),
            "typ": "JWT",
        }

        try:
            return jwt.encode(
                payload,
                self.api_secret,
                algorithm=self.algorithm,
                headers=headers,
            )
        except Exception as exc:
            raise RuntimeError(
                f"JWT encode failed (algorithm={self.algorithm}). "
                f"Common causes: key is Ed25519 but CB_JWT_ALGORITHM=ES256 (or vice versa), "
                f"PEM is malformed, or pyjwt is missing the 'crypto' extra. "
                f"Underlying error: {exc}"
            ) from exc

    def get_headers(self, method: str, path: str, body: str = "") -> dict[str, str]:
        """
        Build authenticated headers for a Coinbase API request.

        body is unused by JWT auth (the URI claim covers the request identity)
        but the signature is kept for backward compatibility with callers that
        were written for the old HMAC scheme.
        """
        token = self._build_jwt(method, path)
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
