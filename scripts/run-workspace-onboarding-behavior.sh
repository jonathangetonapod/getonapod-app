#!/usr/bin/env bash

set +x
set -euo pipefail
umask 077

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly BEHAVIOR_TEST='supabase/tests/20260722_workspace_onboarding_behavior.sql'
readonly PRODUCTION_PROJECT_REF='ysjwveqnwjysldpfqzov'
readonly -a SOURCE_INPUTS=(
  'scripts/run-workspace-onboarding-behavior.sh'
  'supabase/migrations/20260722000400_workspace_branding.sql'
  'supabase/migrations/20260722000500_workspace_onboarding.sql'
  'supabase/migrations/20260722000600_workspace_onboarding_white_label.sql'
  'supabase/migrations/20260723000100_workspace_onboarding_activity.sql'
  "${BEHAVIOR_TEST}"
)
readonly -a REQUIRED_ENV=(
  'PGHOST'
  'PGPORT'
  'PGDATABASE'
  'PGUSER'
  'PGPASSWORD'
  'PGSSLMODE'
  'ONBOARDING_DB_ENVIRONMENT'
  'ONBOARDING_DB_EXPECTED_PGHOST'
  'ONBOARDING_DB_EXPECTED_PROJECT_REF'
  'ONBOARDING_DB_PRODUCTION_PGHOSTS'
  'ONBOARDING_DB_CONFIRM'
)
readonly -a FORBIDDEN_CONNECTION_ENV=(
  'PGHOSTADDR'
  'PGPASSFILE'
  'PGSERVICE'
  'PGSERVICEFILE'
  'PGOPTIONS'
)

scratch_dir=''

refuse() {
  printf '%s\n' \
    'Workspace onboarding behavior runner refused: target or source-integrity check failed.' \
    >&2
  exit 1
}

cleanup() {
  if [[ -n "${scratch_dir}" && -d "${scratch_dir}" ]]; then
    rm -f -- \
      "${scratch_dir}/behavior.sql" \
      "${scratch_dir}/stdout" \
      "${scratch_dir}/stderr"
    rmdir -- "${scratch_dir}" 2>/dev/null || true
  fi
}

trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

validate_hostname() {
  local hostname="$1"
  (( ${#hostname} >= 1 && ${#hostname} <= 253 )) || return 1
  [[ "${hostname}" =~ ^[A-Za-z0-9.-]+$ ]] || return 1
  [[ "${hostname}" != .* && "${hostname}" != *. ]] || return 1
  [[ "${hostname}" != -* && "${hostname}" != *- ]] || return 1
  [[ "${hostname}" != *..* && "${hostname}" != *.-* && "${hostname}" != *-.* ]] || return 1
}

for command_name in chmod git grep mktemp psql realpath tail timeout; do
  command -v "${command_name}" >/dev/null 2>&1 || refuse
done

for variable_name in "${REQUIRED_ENV[@]}"; do
  [[ -n "${!variable_name-}" ]] || refuse
done

for variable_name in "${FORBIDDEN_CONNECTION_ENV[@]}"; do
  [[ -z "${!variable_name-}" ]] || refuse
done

while IFS='=' read -r variable_name _; do
  case "${variable_name}" in
    ONBOARDING_DB_ENVIRONMENT|ONBOARDING_DB_EXPECTED_PGHOST|ONBOARDING_DB_EXPECTED_PROJECT_REF|ONBOARDING_DB_PRODUCTION_PGHOSTS|ONBOARDING_DB_CONFIRM)
      ;;
    ONBOARDING_DB_*)
      refuse
      ;;
  esac
done < <(env)

[[ "${ONBOARDING_DB_ENVIRONMENT}" == 'local' \
  || "${ONBOARDING_DB_ENVIRONMENT}" == 'staging' ]] || refuse
validate_hostname "${PGHOST}" || refuse
validate_hostname "${ONBOARDING_DB_EXPECTED_PGHOST}" || refuse
readonly canonical_pg_host="${PGHOST,,}"
readonly canonical_expected_host="${ONBOARDING_DB_EXPECTED_PGHOST,,}"
readonly canonical_pg_user="${PGUSER,,}"
readonly canonical_pg_database="${PGDATABASE,,}"
readonly canonical_expected_project_ref="${ONBOARDING_DB_EXPECTED_PROJECT_REF,,}"
[[ "${canonical_pg_host}" == "${canonical_expected_host}" ]] || refuse
[[ "${canonical_pg_host}" != *"${PRODUCTION_PROJECT_REF}"* ]] || refuse
[[ "${canonical_pg_user}" != *"${PRODUCTION_PROJECT_REF}"* ]] || refuse
[[ "${canonical_pg_database}" != *"${PRODUCTION_PROJECT_REF}"* ]] || refuse
[[ "${canonical_expected_project_ref}" != "${PRODUCTION_PROJECT_REF}" ]] || refuse
[[ "${PGPORT}" =~ ^[0-9]{1,5}$ ]] || refuse
(( 10#${PGPORT} >= 1 && 10#${PGPORT} <= 65535 )) || refuse
[[ "${PGDATABASE}" =~ ^[A-Za-z0-9_.-]+$ ]] || refuse
[[ "${PGUSER}" =~ ^[A-Za-z0-9_.-]+$ ]] || refuse

if [[ "${ONBOARDING_DB_ENVIRONMENT}" == 'local' ]]; then
  [[ "${canonical_expected_project_ref}" == 'local' ]] || refuse
  [[ "${canonical_pg_host}" == 'localhost' \
    || "${canonical_pg_host}" == '127.0.0.1' ]] || refuse
  [[ "${PGSSLMODE}" == 'disable' || "${PGSSLMODE}" == 'prefer' ]] || refuse
else
  [[ "${canonical_expected_project_ref}" =~ ^[a-z0-9]{20}$ ]] || refuse
  [[ "${canonical_pg_host}" == *"${canonical_expected_project_ref}"* \
    || "${canonical_pg_user}" == *."${canonical_expected_project_ref}" ]] || refuse
  [[ "${PGSSLMODE}" == 'verify-full' ]] || refuse
fi

PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"
[[ "${PGCONNECT_TIMEOUT}" =~ ^[0-9]{1,2}$ ]] || refuse
(( 10#${PGCONNECT_TIMEOUT} >= 1 && 10#${PGCONNECT_TIMEOUT} <= 60 )) || refuse
export PGCONNECT_TIMEOUT

production_host_count=0
IFS=',' read -r -a production_hosts <<< "${ONBOARDING_DB_PRODUCTION_PGHOSTS}"
for production_host in "${production_hosts[@]}"; do
  production_host="${production_host#"${production_host%%[![:space:]]*}"}"
  production_host="${production_host%"${production_host##*[![:space:]]}"}"
  validate_hostname "${production_host}" || refuse
  ((production_host_count += 1))
  [[ "${canonical_pg_host}" != "${production_host,,}" ]] || refuse
done
(( production_host_count > 0 )) || refuse

cd -- "${REPO_ROOT}"
discovered_root="$(git rev-parse --show-toplevel 2>/dev/null)" || refuse
[[ "$(realpath -- "${discovered_root}")" == "${REPO_ROOT}" ]] || refuse
release_commit="$(git rev-parse --verify 'HEAD^{commit}' 2>/dev/null)" || refuse
readonly release_commit
[[ "${release_commit}" =~ ^[0-9a-f]{40,64}$ ]] || refuse
[[ -z "$(git status --porcelain=v1 --untracked-files=all --ignore-submodules=none)" ]] || refuse
git ls-files --error-unmatch -- "${SOURCE_INPUTS[@]}" >/dev/null 2>&1 || refuse

for source_input in "${SOURCE_INPUTS[@]}"; do
  [[ -f "${source_input}" && ! -L "${source_input}" ]] || refuse
  [[ "$(git hash-object --path="${source_input}" -- "${source_input}" 2>/dev/null)" \
    == "$(git rev-parse "${release_commit}:${source_input}" 2>/dev/null)" ]] || refuse
done

readonly expected_confirmation="RUN_ROLLBACK_ONBOARDING_BEHAVIOR_ON_${ONBOARDING_DB_ENVIRONMENT}_${canonical_expected_project_ref}_${canonical_pg_host}:${PGPORT}/${PGDATABASE}?user=${PGUSER}@${release_commit}"
[[ "${ONBOARDING_DB_CONFIRM}" == "${expected_confirmation}" ]] || refuse

scratch_dir="$(mktemp -d --tmpdir '.goap-onboarding-behavior.XXXXXXXX')" || refuse
chmod 0700 -- "${scratch_dir}"
git show "${release_commit}:${BEHAVIOR_TEST}" \
  > "${scratch_dir}/behavior.sql" 2>/dev/null || refuse
chmod 0600 -- "${scratch_dir}/behavior.sql"
[[ "$(git hash-object --path="${BEHAVIOR_TEST}" -- "${scratch_dir}/behavior.sql" 2>/dev/null)" \
  == "$(git rev-parse "${release_commit}:${BEHAVIOR_TEST}" 2>/dev/null)" ]] || refuse

[[ "$(grep -Eic '^[[:space:]]*BEGIN[[:space:]]*;[[:space:]]*$' "${scratch_dir}/behavior.sql")" -eq 1 ]] || refuse
[[ "$(grep -Eic '^[[:space:]]*ROLLBACK[[:space:]]*;[[:space:]]*$' "${scratch_dir}/behavior.sql")" -eq 1 ]] || refuse
! grep -Eiq '^[[:space:]]*COMMIT[[:space:]]*;' "${scratch_dir}/behavior.sql" || refuse
[[ "$(grep -E '^[[:space:]]*[^[:space:]]' "${scratch_dir}/behavior.sql" | tail -n 1)" \
  == 'ROLLBACK;' ]] || refuse
grep -Fq 'nonproduction-rollback-v1' "${scratch_dir}/behavior.sql" || refuse
grep -Fq "current_setting('goap.environment', true) NOT IN ('local', 'staging')" \
  "${scratch_dir}/behavior.sql" || refuse

set +e
PGOPTIONS="-c goap.workspace_onboarding_behavior=nonproduction-rollback-v1 -c goap.environment=${ONBOARDING_DB_ENVIRONMENT} -c default_transaction_read_only=off -c statement_timeout=1140000 -c lock_timeout=30000" \
timeout --signal=TERM --kill-after=10s 20m psql \
  -X \
  --no-psqlrc \
  --no-password \
  --quiet \
  --set=ON_ERROR_STOP=1 \
  --file="${scratch_dir}/behavior.sql" \
  >"${scratch_dir}/stdout" \
  2>"${scratch_dir}/stderr"
behavior_exit=$?
set -e

if (( behavior_exit != 0 )); then
  printf '%s\n' \
    'Workspace onboarding behavior verification: FAILED (database output discarded).' \
    >&2
  exit 1
fi

printf '%s\n' \
  'Workspace onboarding behavior verification: PASS (all mutations rolled back).'
