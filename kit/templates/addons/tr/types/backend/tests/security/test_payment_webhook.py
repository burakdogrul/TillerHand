"""Payment notification attack test (tr addon).

A forged, altered or unsigned notification must be rejected. If the check in app/shared/payments.py is removed
or weakened, this goes red. Fake keys only; no provider account or secret is needed.
Runs with pytest, or without it: python -m unittest tests.security.test_payment_webhook
"""

import base64
import hashlib
import hmac
import unittest

from app.shared.payments import verify_iyzico, verify_paytr

SECRET = "test-secret-key"
KEY = "test-merchant-key"
SALT = "test-merchant-salt"

DIRECT = {
    "iyziEventType": "API_AUTH",
    "paymentId": "22416750",
    "paymentConversationId": "siparis-42",
    "status": "SUCCESS",
}
CHECKOUT = {
    "iyziEventType": "CHECKOUT_FORM_AUTH",
    "iyziPaymentId": "22416751",
    "token": "tok-abc",
    "paymentConversationId": "siparis-43",
    "status": "SUCCESS",
}
PAYTR = {"merchant_oid": "SIP42", "status": "success", "total_amount": "3456"}


def iyzico_sign(body, secret=SECRET):
    keys = (
        ("iyziEventType", "iyziPaymentId", "token", "paymentConversationId", "status")
        if "token" in body
        else ("iyziEventType", "paymentId", "paymentConversationId", "status")
    )
    return hmac.new(
        secret.encode(),
        (secret + "".join(body[k] for k in keys)).encode(),
        hashlib.sha256,
    ).hexdigest()


def paytr_sign(f, key=KEY, salt=SALT):
    return base64.b64encode(
        hmac.new(
            key.encode(),
            (f["merchant_oid"] + salt + f["status"] + f["total_amount"]).encode(),
            hashlib.sha256,
        ).digest()
    ).decode()


class IyzicoTest(unittest.TestCase):
    def test_correct_signature_is_accepted(self):
        self.assertTrue(verify_iyzico(DIRECT, iyzico_sign(DIRECT), SECRET))
        self.assertTrue(verify_iyzico(CHECKOUT, iyzico_sign(CHECKOUT), SECRET))
        self.assertTrue(verify_iyzico(DIRECT, iyzico_sign(DIRECT).upper(), SECRET))

    def test_forged_altered_or_unsigned_is_rejected(self):
        sig = iyzico_sign(DIRECT)
        self.assertFalse(verify_iyzico({**DIRECT, "status": "FAILURE"}, sig, SECRET))
        self.assertFalse(
            verify_iyzico(
                {**DIRECT, "paymentConversationId": "siparis-99"}, sig, SECRET
            )
        )
        self.assertFalse(
            verify_iyzico(DIRECT, iyzico_sign(DIRECT, "attacker-key"), SECRET)
        )
        self.assertFalse(verify_iyzico(DIRECT, None, SECRET))
        self.assertFalse(verify_iyzico(DIRECT, "", SECRET))
        self.assertFalse(verify_iyzico(DIRECT, sig[:10], SECRET))
        self.assertFalse(verify_iyzico(DIRECT, "ğ" * 64, SECRET))
        self.assertFalse(
            verify_iyzico(
                {k: v for k, v in DIRECT.items() if k != "status"}, sig, SECRET
            )
        )
        self.assertFalse(verify_iyzico(DIRECT, sig, ""))
        for body in (None, "x", 42, [DIRECT]):
            self.assertFalse(verify_iyzico(body, sig, SECRET))
        self.assertFalse(verify_iyzico(DIRECT, 42, SECRET))


class PaytrTest(unittest.TestCase):
    def test_correct_hash_is_accepted(self):
        self.assertTrue(verify_paytr({**PAYTR, "hash": paytr_sign(PAYTR)}, KEY, SALT))
        self.assertTrue(
            verify_paytr(
                {**PAYTR, "total_amount": 3456, "hash": paytr_sign(PAYTR)}, KEY, SALT
            )
        )

    def test_forged_altered_or_unhashed_is_rejected(self):
        h = paytr_sign(PAYTR)
        self.assertFalse(
            verify_paytr({**PAYTR, "total_amount": "1", "hash": h}, KEY, SALT)
        )
        self.assertFalse(
            verify_paytr({**PAYTR, "status": "failed", "hash": h}, KEY, SALT)
        )
        self.assertFalse(
            verify_paytr(
                {**PAYTR, "hash": paytr_sign(PAYTR, "attacker-key")}, KEY, SALT
            )
        )
        self.assertFalse(
            verify_paytr(
                {**PAYTR, "hash": paytr_sign(PAYTR, KEY, "other-salt")}, KEY, SALT
            )
        )
        self.assertFalse(verify_paytr(PAYTR, KEY, SALT))
        self.assertFalse(verify_paytr({**PAYTR, "hash": "x"}, KEY, SALT))
        self.assertFalse(verify_paytr({**PAYTR, "hash": h}, "", SALT))
        for body in (None, "x", 42):
            self.assertFalse(verify_paytr(body, KEY, SALT))


if __name__ == "__main__":
    unittest.main()
