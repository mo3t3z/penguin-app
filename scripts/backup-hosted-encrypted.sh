#!/usr/bin/env bash
# Encrypted backup of the linked Supabase project, for use right before a migration.
#
#   bash scripts/backup-hosted-encrypted.sh                # schema + data (private data!)
#   bash scripts/backup-hosted-encrypted.sh --schema-only  # structure only, no rows
#   bash scripts/backup-hosted-encrypted.sh --verify FILE  # decrypt in memory, print SHA-256
#
# What it guarantees:
#   - The dump is piped straight from the Supabase CLI into the encryption step.
#     No unencrypted copy is ever written to disk.
#   - Encryption is Windows DPAPI for the current Windows user: only this account on
#     this computer can decrypt it, and no passphrase is typed, stored or shown.
#   - Files go to %USERPROFILE%\PenguinBackups, outside the repository, with access
#     limited to the current user.
#   - It only READS from the hosted project.
#
# Limits: the backup cannot be opened on another computer or by another Windows
# account, and is lost if this Windows profile is. It is a safeguard for a
# migration, not long-term storage. Needs Docker (the CLI runs pg_dump in it).
#
# To restore, decrypt to a pipe and feed it to psql; never to a file:
#   bash scripts/backup-hosted-encrypted.sh --decrypt FILE | psql "$DATABASE_URL"
set -euo pipefail

EXPECTED_REF=utdwgmvdhghmephbvxvj
cd "$(dirname "$0")/.."
REF="$(cat supabase/.temp/project-ref 2>/dev/null || true)"
if [ "$REF" != "$EXPECTED_REF" ]; then
  echo "Linked project is '$REF', expected '$EXPECTED_REF'. Stopping." >&2
  exit 1
fi

ps() { powershell.exe -NoProfile -NonInteractive -Command "$1"; }

# Reads stdin as raw bytes, encrypts for the current user, writes the given file.
ENCRYPT='
Add-Type -AssemblyName System.Security
$in = [Console]::OpenStandardInput(); $buffer = New-Object IO.MemoryStream; $in.CopyTo($buffer)
$plain = $buffer.ToArray()
if ($plain.Length -eq 0) { [Console]::Error.WriteLine("empty dump"); exit 2 }
$hash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($plain)).Replace("-", "").ToLower()
$sealed = [Security.Cryptography.ProtectedData]::Protect($plain, $null, "CurrentUser")
[IO.File]::WriteAllBytes($env:PENGUIN_BACKUP_FILE, $sealed)
[Array]::Clear($plain, 0, $plain.Length)
Write-Output ("{0} bytes, sha256 {1}" -f $buffer.Length, $hash)
'
# Decrypts the given file in memory; prints the SHA-256 or the content.
OPEN='
Add-Type -AssemblyName System.Security
$plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($env:PENGUIN_BACKUP_FILE), $null, "CurrentUser")
if ($env:PENGUIN_BACKUP_MODE -eq "decrypt") { $out = [Console]::OpenStandardOutput(); $out.Write($plain, 0, $plain.Length); $out.Flush() }
else { Write-Output ("{0} bytes, sha256 {1}" -f $plain.Length, [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($plain)).Replace("-", "").ToLower()) }
'

if [ "${1:-}" = "--verify" ] || [ "${1:-}" = "--decrypt" ]; then
  export PENGUIN_BACKUP_FILE="$2" PENGUIN_BACKUP_MODE="${1#--}"
  ps "$OPEN"
  exit 0
fi

DIR_WIN="$(ps 'Join-Path $env:USERPROFILE PenguinBackups' | tr -d '\r')"
ps "New-Item -ItemType Directory -Force -Path '$DIR_WIN' | Out-Null; icacls '$DIR_WIN' /inheritance:r /grant:r \"\$(\$env:USERNAME):(OI)(CI)F\" | Out-Null"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

seal() { # seal <name> <supabase db dump arguments...>
  local name="$1"; shift
  export PENGUIN_BACKUP_FILE="$DIR_WIN\\penguin-$EXPECTED_REF-$STAMP-$name.sql.dpapi"
  printf '%s: ' "$name"
  npx --no-install supabase db dump --linked "$@" 2>/dev/null | ps "$ENCRYPT"
}

seal schema --schema public,auth,storage
if [ "${1:-}" != "--schema-only" ]; then
  seal data --data-only --use-copy --schema public,auth,storage
fi
echo "Encrypted backup written to $DIR_WIN (prefix penguin-$EXPECTED_REF-$STAMP)."
echo "Check a file with: bash scripts/backup-hosted-encrypted.sh --verify <file>"
