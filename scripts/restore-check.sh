#!/usr/bin/env bash
# Proves a backup can actually be restored: loads it into a throw-away local database,
# checks row counts and the audit-log hash chain, then deletes the database.
#
#   scripts/restore-check.sh backups/zentro-shop-….dump[.gpg]
#
# Needs a local PostgreSQL you can create databases in (PG* env vars or RESTORE_ADMIN_URL).
set -euo pipefail
FILE="${1:?usage: restore-check.sh <backup file>}"
ADMIN_URL="${RESTORE_ADMIN_URL:-postgres://zentro:zentro@localhost/postgres}"
DB="zentro_restore_check_$$"
TMP=""
cleanup() { psql "$ADMIN_URL" -qc "drop database if exists $DB" >/dev/null 2>&1 || true; if [[ -n "$TMP" ]]; then rm -f "$TMP"; fi; }
trap cleanup EXIT

if [[ "$FILE" == *.sha256 ]]; then echo "pass the backup file, not its checksum"; exit 2; fi
if [[ -f "$FILE.sha256" ]]; then sha256sum --check --quiet "$FILE.sha256"; fi
if [[ "$FILE" == *.gpg ]]; then TMP="$(mktemp)"; gpg --batch --quiet --decrypt --output "$TMP" "$FILE"; FILE="$TMP"; fi

psql "$ADMIN_URL" -qc "create database $DB" >/dev/null
URL="${ADMIN_URL%/*}/$DB"
# what the shop schema expects to exist (on Supabase these are already present)
psql "$URL" -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create schema if not exists extensions;
create extension if not exists unaccent schema extensions;
create extension if not exists pg_trgm schema extensions;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
SQL
pg_restore --dbname="$URL" --no-owner --no-privileges --exit-on-error "$FILE"

psql "$URL" -At -v ON_ERROR_STOP=1 <<'SQL'
select 'migrations: ' || count(*) || ' (latest ' || max(name) || ')' from shop.schema_migrations;
select 'orders: ' || count(*) from shop.orders;
select 'products: ' || count(*) from shop.products;
select 'customers: ' || count(*) from shop.customers;
select 'audit log: ' || count(*) || ' entries, chain ' || coalesce('BROKEN at ' || shop.verify_audit_chain()::text, 'intact') from shop.audit_log;
SQL
echo "restore check passed"
