#!/usr/bin/env python3
"""Verify or narrowly patch the hosted Supabase Auth password policy."""

from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import re
import socket
import sys
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any


API_BASE = "https://api.supabase.com"
MAX_RESPONSE_BYTES = 1_048_576
PASSWORD_MIN_LENGTH = 12
PASSWORD_REQUIRED_CHARACTERS = (
    "abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789:"
    "!@#$%^&*()_+-=[]{};'\\\\:\"|<>?,./`~"
)
PROJECT_REF_PATTERN = re.compile(r"^[a-z]{20}$")
TARGET_KEYS = frozenset({"password_min_length", "password_required_characters"})


class PolicyError(RuntimeError):
    """An intentionally sanitized operator-facing failure."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def _decode_config(status: int, content_type: str, payload: bytes) -> dict[str, Any]:
    if status != 200:
        raise PolicyError(f"Management API request failed with HTTP {status}")
    if "application/json" not in content_type.lower():
        raise PolicyError("Management API returned a non-JSON response")
    if len(payload) > MAX_RESPONSE_BYTES:
        raise PolicyError("Management API response exceeded the safety limit")
    try:
        decoded = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PolicyError("Management API returned invalid JSON") from error
    if not isinstance(decoded, dict):
        raise PolicyError("Management API returned an invalid Auth configuration")
    return decoded


class HttpTransport:
    def __init__(self, timeout_seconds: float = 20.0) -> None:
        self.timeout_seconds = timeout_seconds
        self.opener = urllib.request.build_opener(_NoRedirect())

    def request(
        self,
        method: str,
        url: str,
        token: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body = None
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "goap-hosted-auth-policy/1",
        }
        if payload is not None:
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = urllib.request.Request(
            url,
            data=body,
            headers=headers,
            method=method,
        )
        try:
            response = self.opener.open(request, timeout=self.timeout_seconds)
            with response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                return _decode_config(
                    int(response.status),
                    response.headers.get("Content-Type", ""),
                    raw,
                )
        except urllib.error.HTTPError as error:
            if 300 <= error.code < 400:
                raise PolicyError("Management API redirect was refused") from None
            raise PolicyError(
                f"Management API {method} failed with HTTP {error.code}"
            ) from None
        except (urllib.error.URLError, TimeoutError, socket.timeout):
            raise PolicyError(f"Management API {method} transport failed") from None


def _validate_project_ref(project_ref: str) -> str:
    if not PROJECT_REF_PATTERN.fullmatch(project_ref):
        raise PolicyError("Project ref must be exactly 20 lowercase letters")
    return project_ref


def _validate_token(token: str) -> str:
    if not 20 <= len(token) <= 512 or any(character.isspace() for character in token):
        raise PolicyError("The Management API PAT is invalid")
    return token


def _policy_view(config: dict[str, Any]) -> dict[str, Any]:
    minimum = config.get("password_min_length")
    characters = config.get("password_required_characters")
    return {
        "password_min_length": minimum if isinstance(minimum, int) else None,
        "password_required_characters": (
            characters if isinstance(characters, str) and len(characters) <= 256 else None
        ),
    }


def _target_matches(config: dict[str, Any]) -> bool:
    minimum = config.get("password_min_length")
    characters = config.get("password_required_characters")
    return (
        type(minimum) is int
        and minimum == PASSWORD_MIN_LENGTH
        and type(characters) is str
        and characters == PASSWORD_REQUIRED_CHARACTERS
    )


def _without_target(config: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in config.items() if key not in TARGET_KEYS}


def _auth_url(project_ref: str) -> str:
    return f"{API_BASE}/v1/projects/{project_ref}/config/auth"


def enforce_policy(
    project_ref: str,
    token: str,
    *,
    apply: bool,
    transport: Any,
    confirm: Callable[[str], str] = input,
    emit: Callable[[str], None] = print,
) -> None:
    project_ref = _validate_project_ref(project_ref)
    token = _validate_token(token)
    url = _auth_url(project_ref)
    before = transport.request("GET", url, token)
    emit("current_policy=" + json.dumps(_policy_view(before), sort_keys=True))

    if _target_matches(before):
        emit("hosted_auth_password_policy=verified")
        return
    if not apply:
        raise PolicyError("Hosted Auth password policy does not match the release contract")

    confirmation = f"PATCH PASSWORD POLICY {project_ref}"
    if confirm(f"Type {confirmation}: ") != confirmation:
        raise PolicyError("Confirmation did not match; no change was made")

    patch = {
        "password_min_length": PASSWORD_MIN_LENGTH,
        "password_required_characters": PASSWORD_REQUIRED_CHARACTERS,
    }
    patch_uncertain = False
    try:
        transport.request("PATCH", url, token, patch)
    except PolicyError:
        patch_uncertain = True

    try:
        after = transport.request("GET", url, token)
    except PolicyError:
        if patch_uncertain:
            raise PolicyError("PATCH outcome could not be safely reconciled") from None
        raise

    if not _target_matches(after):
        if patch_uncertain:
            raise PolicyError("PATCH outcome could not be safely reconciled")
        raise PolicyError("Hosted Auth password policy did not persist")
    if _without_target(before) != _without_target(after):
        raise PolicyError("An unrelated hosted Auth setting changed; stop the release")

    emit("verified_policy=" + json.dumps(_policy_view(after), sort_keys=True))
    emit(
        "hosted_auth_password_policy="
        + ("reconciled" if patch_uncertain else "updated")
    )


def _arguments(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Verify the hosted Supabase Auth password policy. --apply performs "
            "one exact two-field PATCH after typed confirmation."
        )
    )
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--apply", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _arguments(sys.argv[1:] if argv is None else argv)
    if not sys.stdin.isatty():
        print(
            "hosted_auth_password_policy=failed; reason=interactive terminal required",
            file=sys.stderr,
        )
        return 1

    try:
        token = getpass.getpass("Supabase Management API PAT: ")
        enforce_policy(
            args.project_ref,
            token,
            apply=args.apply,
            transport=HttpTransport(),
        )
    except PolicyError as error:
        print(
            f"hosted_auth_password_policy=failed; reason={error}",
            file=sys.stderr,
        )
        return 1
    except Exception:
        print(
            "hosted_auth_password_policy=failed; reason=unexpected sanitized failure",
            file=sys.stderr,
        )
        return 1

    project_hash = hashlib.sha256(args.project_ref.encode("ascii")).hexdigest()
    print(f"project_ref_sha256={project_hash}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
