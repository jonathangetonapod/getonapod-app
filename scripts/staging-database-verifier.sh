#!/usr/bin/env bash

set +x
set -euo pipefail
umask 077

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly VERIFIER='supabase/tests/20260720_invite_only_workspace_verification.sql'
readonly -a RELEASE_INPUTS=(
  'docs/invite-only-edge-manifest.json'
  'scripts/run-subagency-workspace-foundation-behavior.sh'
  'scripts/run-workspace-guest-resources-behavior.sh'
  'scripts/staging-database-verifier.sh'
  'supabase/migrations/20260720000100_invite_only_workspace_core.sql'
  'supabase/migrations/20260720000200_invite_only_workspace_rls.sql'
  'supabase/migrations/20260720000300_client_portal_security.sql'
  'supabase/migrations/20260720000400_resend_webhook_idempotency.sql'
  'supabase/migrations/20260720000500_client_prospect_link_normalization.sql'
  'supabase/migrations/20260720000600_trigger_function_privileges.sql'
  'supabase/migrations/20260721000100_manual_workspace_accounts.sql'
  'supabase/migrations/20260721000200_workspace_guest_resources.sql'
  'supabase/migrations/20260722000100_subagency_workspace_foundation.sql'
  'supabase/migrations/20260722000200_platform_owner_workspace_management.sql'
  'supabase/migrations/20260722000300_workspace_staff_temporary_passwords.sql'
  'supabase/migrations/20260722000400_workspace_branding.sql'
  'supabase/migrations/20260723000500_workspace_owner_password_management.sql'
  'supabase/migrations/20260723000600_fix_client_portal_password_management.sql'
  'supabase/migrations/20260723000700_workspace_client_branding.sql'
  'supabase/migrations/20260723000800_workspace_name_management.sql'
  'supabase/migrations/20260723000900_client_dashboard_visibility.sql'
  'supabase/tests/20260721_workspace_guest_resources_behavior.sql'
  'supabase/tests/20260722_subagency_workspace_foundation_behavior.sql'
  "${VERIFIER}"
)
readonly -a REQUIRED_ENV=(
  'PGHOST'
  'PGPORT'
  'PGDATABASE'
  'PGUSER'
  'PGPASSWORD'
  'PGSSLMODE'
  'STAGING_DB_CONFIRM'
  'STAGING_DB_EVIDENCE_PATH'
  'STAGING_DB_EXPECTED_PGHOST'
  'STAGING_DB_PRODUCTION_PGHOSTS'
)
readonly -a FORBIDDEN_CONNECTION_ENV=(
  'PGHOSTADDR'
  'PGPASSFILE'
  'PGSERVICE'
  'PGSERVICEFILE'
  'PGOPTIONS'
)

raw_dir=''
evidence_tmp=''
checksum_tmp=''
evidence_path=''
checksum_path=''
publish_complete=false

refuse() {
  printf '%s\n' 'Staging database verifier refused: configuration or source-integrity check failed.' >&2
  exit 1
}

cleanup() {
  if [[ "${publish_complete}" != true ]]; then
    if same_inode "${checksum_tmp}" "${checksum_path}"; then
      rm -f -- "${checksum_path}"
    fi
    if same_inode "${evidence_tmp}" "${evidence_path}"; then
      rm -f -- "${evidence_path}"
    fi
  fi
  if [[ -n "${raw_dir}" && -d "${raw_dir}" ]]; then
    rm -rf -- "${raw_dir}"
  fi
  if [[ -n "${evidence_tmp}" && -f "${evidence_tmp}" ]]; then
    rm -f -- "${evidence_tmp}"
  fi
  if [[ -n "${checksum_tmp}" && -f "${checksum_tmp}" ]]; then
    rm -f -- "${checksum_tmp}"
  fi
}

same_inode() {
  local source_path="$1"
  local target_path="$2"
  local source_inode=''
  local target_inode=''
  [[ -n "${source_path}" && -n "${target_path}" ]] || return 1
  [[ -f "${source_path}" && -f "${target_path}" ]] || return 1
  source_inode="$(stat -Lc '%d:%i' -- "${source_path}" 2>/dev/null)" || return 1
  target_inode="$(stat -Lc '%d:%i' -- "${target_path}" 2>/dev/null)" || return 1
  [[ "${source_inode}" == "${target_inode}" ]]
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

path_is_within() {
  local parent="${1%/}"
  local candidate="${2%/}"
  [[ "${candidate}" == "${parent}" || "${candidate}" == "${parent}/"* ]]
}

compute_release_digest() {
  {
    local release_input
    for release_input in "${RELEASE_INPUTS[@]}"; do
      printf '%s\0' "${release_input}"
      sha256sum -- "${release_input}"
    done
  } | sha256sum | cut -d' ' -f1
}

for command_name in git jq ln mktemp psql realpath sha256sum stat timeout; do
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
    STAGING_DB_CONFIRM|STAGING_DB_EVIDENCE_PATH|STAGING_DB_EXPECTED_PGHOST|STAGING_DB_PRODUCTION_PGHOSTS)
      ;;
    STAGING_DB_*)
      refuse
      ;;
  esac
done < <(env)

validate_hostname "${PGHOST}" || refuse
validate_hostname "${STAGING_DB_EXPECTED_PGHOST}" || refuse
readonly canonical_pg_host="${PGHOST,,}"
readonly canonical_expected_host="${STAGING_DB_EXPECTED_PGHOST,,}"
[[ "${canonical_pg_host}" == "${canonical_expected_host}" ]] || refuse
[[ "${PGPORT}" =~ ^[0-9]{1,5}$ ]] || refuse
(( 10#${PGPORT} >= 1 && 10#${PGPORT} <= 65535 )) || refuse
[[ "${PGDATABASE}" =~ ^[A-Za-z0-9_.-]+$ ]] || refuse
[[ "${PGUSER}" =~ ^[A-Za-z0-9_.-]+$ ]] || refuse
[[ "${PGSSLMODE}" == 'verify-full' ]] || refuse
PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"
[[ "${PGCONNECT_TIMEOUT}" =~ ^[0-9]{1,2}$ ]] || refuse
(( 10#${PGCONNECT_TIMEOUT} >= 1 && 10#${PGCONNECT_TIMEOUT} <= 60 )) || refuse
export PGCONNECT_TIMEOUT

production_host_count=0
IFS=',' read -r -a production_hosts <<< "${STAGING_DB_PRODUCTION_PGHOSTS}"
for production_host in "${production_hosts[@]}"; do
  production_host="${production_host#"${production_host%%[![:space:]]*}"}"
  production_host="${production_host%"${production_host##*[![:space:]]}"}"
  validate_hostname "${production_host}" || refuse
  ((production_host_count += 1))
  [[ "${canonical_pg_host}" != "${production_host,,}" ]] || refuse
done
(( production_host_count > 0 )) || refuse

[[ "${STAGING_DB_EVIDENCE_PATH}" = /* ]] || refuse
evidence_parent="$(realpath -- "$(dirname -- "${STAGING_DB_EVIDENCE_PATH}")" 2>/dev/null)" || refuse
readonly evidence_parent
readonly evidence_name="$(basename -- "${STAGING_DB_EVIDENCE_PATH}")"
[[ "${evidence_name}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.ndjson$ ]] || refuse
evidence_path="${evidence_parent}/${evidence_name}"
checksum_path="${evidence_path}.sha256"
[[ ! -e "${evidence_path}" && ! -L "${evidence_path}" ]] || refuse
[[ ! -e "${checksum_path}" && ! -L "${checksum_path}" ]] || refuse
readonly evidence_parent_uid="$(stat -Lc '%u' -- "${evidence_parent}" 2>/dev/null)" || refuse
readonly evidence_parent_mode="$(stat -Lc '%a' -- "${evidence_parent}" 2>/dev/null)" || refuse
[[ "${evidence_parent_uid}" == "${EUID}" ]] || refuse
[[ "${evidence_parent_mode}" =~ ^[0-7]{3,4}$ ]] || refuse
(( (8#${evidence_parent_mode} & 0022) == 0 )) || refuse

cd -- "${REPO_ROOT}"
discovered_root="$(git rev-parse --show-toplevel 2>/dev/null)" || refuse
readonly discovered_root
[[ "$(realpath -- "${discovered_root}")" == "${REPO_ROOT}" ]] || refuse
current_branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" || refuse
readonly current_branch
[[ "${current_branch}" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$ ]] || refuse
[[ "${current_branch}" != *..* && "${current_branch}" != *//* && "${current_branch}" != */ ]] || refuse
release_commit="$(git rev-parse --verify 'HEAD^{commit}' 2>/dev/null)" || refuse
readonly release_commit
[[ "${release_commit}" =~ ^[0-9a-f]{40,64}$ ]] || refuse
[[ -z "$(git status --porcelain=v1 --untracked-files=all --ignore-submodules=none)" ]] || refuse
git ls-files --error-unmatch -- "${RELEASE_INPUTS[@]}" >/dev/null 2>&1 || refuse

worktree_blob=''
committed_blob=''
for release_input in "${RELEASE_INPUTS[@]}"; do
  [[ -f "${release_input}" && ! -L "${release_input}" ]] || refuse
  worktree_blob="$(git hash-object --path="${release_input}" -- "${release_input}" 2>/dev/null)" || refuse
  committed_blob="$(git rev-parse "${release_commit}:${release_input}" 2>/dev/null)" || refuse
  [[ "${worktree_blob}" == "${committed_blob}" ]] || refuse
done

release_inputs_sha256="$(compute_release_digest)" || refuse
readonly release_inputs_sha256
[[ "${release_inputs_sha256}" =~ ^[0-9a-f]{64}$ ]] || refuse
[[ -z "$(git status --porcelain=v1 --untracked-files=all --ignore-submodules=none)" ]] || refuse
[[ "$(git rev-parse --verify 'HEAD^{commit}' 2>/dev/null)" == "${release_commit}" ]] || refuse

git_common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || refuse
git_dir="$(git rev-parse --path-format=absolute --git-dir 2>/dev/null)" || refuse
readonly git_common_dir="$(realpath -- "${git_common_dir}")"
readonly git_dir="$(realpath -- "${git_dir}")"
path_is_within "${REPO_ROOT}" "${evidence_parent}" && refuse
path_is_within "${git_common_dir}" "${evidence_parent}" && refuse
path_is_within "${git_dir}" "${evidence_parent}" && refuse
worktree_inventory="$(git worktree list --porcelain 2>/dev/null)" || refuse
while IFS= read -r inventory_line; do
  case "${inventory_line}" in
    'worktree '*)
      inventory_path="${inventory_line#worktree }"
      inventory_path="$(realpath -- "${inventory_path}" 2>/dev/null)" || refuse
      path_is_within "${inventory_path}" "${evidence_parent}" && refuse
      ;;
  esac
done <<< "${worktree_inventory}"

readonly expected_confirmation="RUN_SQL_VERIFIER_ON_${canonical_pg_host}:${PGPORT}/${PGDATABASE}?user=${PGUSER}@${release_commit}"
[[ "${STAGING_DB_CONFIRM}" == "${expected_confirmation}" ]] || refuse
target_sha256="$({
  printf '%s\0' 'goap-staging-database-target-v1'
  printf '%s' "${canonical_pg_host}:${PGPORT}/${PGDATABASE}?user=${PGUSER}"
} | sha256sum | cut -d' ' -f1)" || refuse
readonly target_sha256
[[ "${target_sha256}" =~ ^[0-9a-f]{64}$ ]] || refuse

raw_dir="$(mktemp -d --tmpdir="${evidence_parent}" '.goap-db-raw.XXXXXXXX')" || refuse
chmod 0700 -- "${raw_dir}"
git show "${release_commit}:${VERIFIER}" > "${raw_dir}/verifier.sql" 2>/dev/null || refuse
chmod 0600 -- "${raw_dir}/verifier.sql"
snapshot_blob="$(git hash-object --path="${VERIFIER}" -- "${raw_dir}/verifier.sql" 2>/dev/null)" || refuse
[[ "${snapshot_blob}" == "$(git rev-parse "${release_commit}:${VERIFIER}" 2>/dev/null)" ]] || refuse

evidence_tmp="$(mktemp --tmpdir="${evidence_parent}" '.goap-db-evidence.XXXXXXXX')" || refuse
checksum_tmp="$(mktemp --tmpdir="${evidence_parent}" '.goap-db-checksum.XXXXXXXX')" || refuse
chmod 0600 -- "${evidence_tmp}" "${checksum_tmp}"

set +e
PGOPTIONS='-c default_transaction_read_only=on -c default_transaction_isolation=serializable -c statement_timeout=840000 -c lock_timeout=30000' \
timeout --signal=TERM --kill-after=10s 15m psql \
  -X \
  --no-psqlrc \
  --no-password \
  --quiet \
  --single-transaction \
  --set=ON_ERROR_STOP=1 \
  --file="${raw_dir}/verifier.sql" \
  >"${raw_dir}/verifier.stdout" \
  2>"${raw_dir}/verifier.stderr"
verifier_exit=$?
set -e

source_stable=true
source_status_after=''
source_commit_after=''
source_digest_after=''
if ! source_status_after="$(git status --porcelain=v1 --untracked-files=all --ignore-submodules=none 2>/dev/null)"; then
  source_stable=false
elif [[ -n "${source_status_after}" ]]; then
  source_stable=false
fi
if ! source_commit_after="$(git rev-parse --verify 'HEAD^{commit}' 2>/dev/null)"; then
  source_stable=false
elif [[ "${source_commit_after}" != "${release_commit}" ]]; then
  source_stable=false
fi
if ! source_digest_after="$(compute_release_digest 2>/dev/null)"; then
  source_stable=false
elif [[ "${source_digest_after}" != "${release_inputs_sha256}" ]]; then
  source_stable=false
fi
if [[ "${source_stable}" != true && "${verifier_exit}" -eq 0 ]]; then
  verifier_exit=125
fi

if (( verifier_exit == 0 )); then
  verifier_status='pass'
else
  verifier_status='fail'
fi
jq -cn \
  --arg commit "${release_commit}" \
  --arg digest "${release_inputs_sha256}" \
  --arg target "${target_sha256}" \
  --arg status "${verifier_status}" \
  --argjson exit_code "${verifier_exit}" \
  '{release_commit:$commit,release_inputs_sha256:$digest,target_sha256:$target,status:$status,exit_code:$exit_code}' \
  > "${evidence_tmp}"

evidence_sha256="$(sha256sum -- "${evidence_tmp}" | cut -d' ' -f1)" || refuse
[[ "${evidence_sha256}" =~ ^[0-9a-f]{64}$ ]] || refuse
printf '%s\n' "${evidence_sha256}" > "${checksum_tmp}"
[[ ! -e "${evidence_path}" && ! -L "${evidence_path}" ]] || refuse
[[ ! -e "${checksum_path}" && ! -L "${checksum_path}" ]] || refuse
ln -- "${evidence_tmp}" "${evidence_path}" 2>/dev/null || refuse
ln -- "${checksum_tmp}" "${checksum_path}" 2>/dev/null || refuse
[[ "$(stat -Lc '%d:%i' -- "${evidence_tmp}")" == "$(stat -Lc '%d:%i' -- "${evidence_path}")" ]] || refuse
[[ "$(stat -Lc '%d:%i' -- "${checksum_tmp}")" == "$(stat -Lc '%d:%i' -- "${checksum_path}")" ]] || refuse
publish_complete=true

if (( verifier_exit != 0 )); then
  printf '%s\n' 'Staging database verifier: FAILED (raw database output was discarded).' >&2
  exit 1
fi

printf '%s\n' 'Staging database verifier: PASS (sanitized evidence written).'
