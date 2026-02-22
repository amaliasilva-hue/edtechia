#!/usr/bin/env python3
"""
Converts .env.local into a Cloud Run-compatible YAML env-vars file.
Handles long values (e.g. base64 SA key) that would break --set-env-vars.
"""
import sys

ENV_FILE = "/workspaces/edtechia/.env.local"
OUT_FILE = "/tmp/edtechia-env.yaml"

SKIP = {"NEXTAUTH_URL", "GOOGLE_APPLICATION_CREDENTIALS"}

lines = []
for raw_line in open(ENV_FILE):
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, _, val = line.partition("=")
    key = key.strip()
    val = val.strip()
    if key in SKIP:
        continue
    # Escape single-quotes inside the value
    val_escaped = val.replace("'", "'\"'\"'")
    lines.append(f"{key}: '{val_escaped}'\n")

with open(OUT_FILE, "w") as f:
    f.writelines(lines)

print(f"✓ {len(lines)} vars written to {OUT_FILE}")
