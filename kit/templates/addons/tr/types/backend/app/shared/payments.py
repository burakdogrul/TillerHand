"""Payment provider notification signatures (iyzico, PayTR).

Verify before reading anything else from the request; an unverified notification is rejected.
Steps and sources: docs/legal/turkiye.md -> "Ödeme bildirimleri".
Sources (checked 2026-10-25): docs.iyzico.com/en/advanced/webhook · dev.paytr.com/en/iframe-api/iframe-api-2-adim
"""

import base64
import hashlib
import hmac
from collections.abc import Mapping

IYZICO_DIRECT = ("iyziEventType", "paymentId", "paymentConversationId", "status")
IYZICO_CHECKOUT = (
    "iyziEventType",
    "iyziPaymentId",
    "token",
    "paymentConversationId",
    "status",
)


def _text(value: object) -> str | None:
    # Only non-empty strings and integers are signed values; anything else fails the check.
    # json.loads keeps big integers exact, so unlike the TypeScript copy there is no 2^53 limit here.
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        return None
    return str(value) or None


def _mac(key: str, message: str) -> hmac.HMAC:
    return hmac.new(key.encode(), message.encode(), hashlib.sha256)


def _same(expected: str, received: str) -> bool:
    # Bytes, so a non-ASCII value is a mismatch, not an exception
    return hmac.compare_digest(expected.encode(), received.encode())


def verify_iyzico(body: object, signature: object, secret_key: str) -> bool:
    """iyzico X-IYZ-SIGNATURE-V3: hex HMAC-SHA256, key secret_key, over secret_key + fields.

    Checkout form / Pay with iyzico notifications carry "token". Subscription notifications are not covered.
    A valid signature only proves iyzico sent it: check the result field and the amount before confirming an order.
    """
    if (
        not secret_key
        or not isinstance(signature, str)
        or not signature
        or not isinstance(body, Mapping)
    ):
        return False
    values = [
        _text(body.get(f))
        for f in (IYZICO_CHECKOUT if "token" in body else IYZICO_DIRECT)
    ]
    if None in values:
        return False
    return _same(
        _mac(secret_key, secret_key + "".join(values)).hexdigest(), signature.lower()
    )


def verify_paytr(fields: object, merchant_key: str, merchant_salt: str) -> bool:
    """PayTR callback "hash": base64 HMAC-SHA256, key merchant_key, over merchant_oid + merchant_salt + status + total_amount.

    Reply with plain "OK" (also for repeats); apply only the first notification per merchant_oid.
    """
    if not merchant_key or not merchant_salt or not isinstance(fields, Mapping):
        return False
    oid, status, amount, received = (
        _text(fields.get(f)) for f in ("merchant_oid", "status", "total_amount", "hash")
    )
    if not (oid and status and amount and received):
        return False
    expected = base64.b64encode(
        _mac(merchant_key, oid + merchant_salt + status + amount).digest()
    ).decode()
    return _same(expected, received)
