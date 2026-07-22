#!/usr/bin/env python3

from __future__ import annotations

import copy
import importlib.util
import io
import json
import pathlib
import unittest
from unittest import mock


MODULE_PATH = pathlib.Path(__file__).with_name("hosted_auth_password_policy.py")
SPEC = importlib.util.spec_from_file_location("hosted_auth_password_policy", MODULE_PATH)
assert SPEC and SPEC.loader
policy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(policy)

PROJECT_REF = "abcdefghijklmnopqrst"
TOKEN = "sbp_test_token_that_is_never_logged"


def target_config(**extra):
    return {
        "site_url": "https://example.test",
        "password_min_length": policy.PASSWORD_MIN_LENGTH,
        "password_required_characters": policy.PASSWORD_REQUIRED_CHARACTERS,
        **extra,
    }


class FakeTransport:
    def __init__(self, gets, *, patch_error=False):
        self.gets = [copy.deepcopy(value) for value in gets]
        self.patch_error = patch_error
        self.calls = []

    def request(self, method, url, token, payload=None):
        self.calls.append((method, url, token, copy.deepcopy(payload)))
        if method == "GET":
            if not self.gets:
                raise AssertionError("unexpected GET")
            return self.gets.pop(0)
        if method == "PATCH":
            if self.patch_error:
                raise policy.PolicyError("sanitized transport failure")
            return {}
        raise AssertionError("unexpected method")


class HostedAuthPolicyTests(unittest.TestCase):
    def run_policy(self, transport, *, apply=False, confirmation=""):
        output = []
        policy.enforce_policy(
            PROJECT_REF,
            TOKEN,
            apply=apply,
            transport=transport,
            confirm=lambda _prompt: confirmation,
            emit=output.append,
        )
        return output

    def test_read_only_verification_does_not_patch(self):
        transport = FakeTransport([target_config()])
        output = self.run_policy(transport)
        self.assertEqual([call[0] for call in transport.calls], ["GET"])
        self.assertIn("hosted_auth_password_policy=verified", output)
        self.assertNotIn(TOKEN, "\n".join(output))

    def test_read_only_drift_fails(self):
        transport = FakeTransport([target_config(password_min_length=8)])
        with self.assertRaisesRegex(policy.PolicyError, "does not match"):
            self.run_policy(transport)
        self.assertEqual([call[0] for call in transport.calls], ["GET"])

    def test_target_policy_requires_exact_json_types(self):
        self.assertFalse(
            policy._target_matches(
                target_config(password_min_length=float(policy.PASSWORD_MIN_LENGTH))
            )
        )
        self.assertFalse(
            policy._target_matches(target_config(password_min_length=True))
        )

    def test_apply_uses_exact_two_field_patch(self):
        before = target_config(password_min_length=8)
        after = target_config()
        transport = FakeTransport([before, after])
        confirmation = f"PATCH PASSWORD POLICY {PROJECT_REF}"
        output = self.run_policy(
            transport,
            apply=True,
            confirmation=confirmation,
        )
        self.assertEqual([call[0] for call in transport.calls], ["GET", "PATCH", "GET"])
        self.assertEqual(
            transport.calls[1][3],
            {
                "password_min_length": 12,
                "password_required_characters": policy.PASSWORD_REQUIRED_CHARACTERS,
            },
        )
        self.assertIn("hosted_auth_password_policy=updated", output)

    def test_wrong_confirmation_never_patches(self):
        transport = FakeTransport([target_config(password_min_length=8)])
        with self.assertRaisesRegex(policy.PolicyError, "Confirmation did not match"):
            self.run_policy(transport, apply=True, confirmation="no")
        self.assertEqual([call[0] for call in transport.calls], ["GET"])

    def test_unrelated_change_fails_closed(self):
        before = target_config(password_min_length=8)
        after = target_config(site_url="https://changed.example.test")
        transport = FakeTransport([before, after])
        confirmation = f"PATCH PASSWORD POLICY {PROJECT_REF}"
        with self.assertRaisesRegex(policy.PolicyError, "unrelated"):
            self.run_policy(transport, apply=True, confirmation=confirmation)

    def test_ambiguous_patch_is_reconciled_by_get(self):
        before = target_config(password_min_length=8)
        transport = FakeTransport([before, target_config()], patch_error=True)
        confirmation = f"PATCH PASSWORD POLICY {PROJECT_REF}"
        output = self.run_policy(
            transport,
            apply=True,
            confirmation=confirmation,
        )
        self.assertIn("hosted_auth_password_policy=reconciled", output)

    def test_decoder_rejects_redirect_non_json_invalid_and_oversize(self):
        valid = json.dumps(target_config()).encode()
        with self.assertRaisesRegex(policy.PolicyError, "HTTP 302"):
            policy._decode_config(302, "application/json", valid)
        with self.assertRaisesRegex(policy.PolicyError, "non-JSON"):
            policy._decode_config(200, "text/html", valid)
        with self.assertRaisesRegex(policy.PolicyError, "invalid JSON"):
            policy._decode_config(200, "application/json", b"not-json")
        with self.assertRaisesRegex(policy.PolicyError, "safety limit"):
            policy._decode_config(
                200,
                "application/json",
                b"x" * (policy.MAX_RESPONSE_BYTES + 1),
            )

    def test_policy_output_contains_no_unrelated_values(self):
        secret = "smtp-secret-that-must-not-appear"
        transport = FakeTransport([target_config(smtp_pass=secret)])
        output = self.run_policy(transport)
        rendered = "\n".join(output)
        self.assertNotIn(secret, rendered)
        self.assertNotIn("smtp_pass", rendered)

    def test_project_ref_and_pat_are_strict(self):
        transport = FakeTransport([target_config()])
        with self.assertRaisesRegex(policy.PolicyError, "Project ref"):
            policy.enforce_policy(
                "wrong-project",
                TOKEN,
                apply=False,
                transport=transport,
            )
        with self.assertRaisesRegex(policy.PolicyError, "PAT"):
            policy.enforce_policy(
                PROJECT_REF,
                "short",
                apply=False,
                transport=transport,
            )

    def test_strongest_enum_contains_two_literal_backslashes_before_colon(self):
        self.assertIn("\\\\:", policy.PASSWORD_REQUIRED_CHARACTERS)
        self.assertEqual(policy.PASSWORD_REQUIRED_CHARACTERS.count("\\"), 2)

    def test_main_sanitizes_unexpected_failures_after_pat_entry(self):
        stderr = io.StringIO()
        with (
            mock.patch.object(policy.sys.stdin, "isatty", return_value=True),
            mock.patch.object(policy.getpass, "getpass", return_value=TOKEN),
            mock.patch.object(
                policy,
                "enforce_policy",
                side_effect=RuntimeError(f"unexpected {TOKEN}"),
            ),
            mock.patch.object(policy.sys, "stderr", stderr),
        ):
            result = policy.main(["--project-ref", PROJECT_REF])

        self.assertEqual(result, 1)
        self.assertIn("unexpected sanitized failure", stderr.getvalue())
        self.assertNotIn(TOKEN, stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
