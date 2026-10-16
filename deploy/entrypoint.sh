#!/usr/bin/env bash
# Root-owned stable launcher. Only trusted repository artifacts may be deployed.
set -euo pipefail
[[ $(id -u) == 0 ]] || exit 1
if [[ ${1:-} == --check ]]; then exit 0; fi
if [[ ${1:-} == --inspect-routing ]]; then
 exec /bin/bash /opt/th-app/current/deploy/install.sh --inspect-routing
fi
source_dir=$(realpath "${1:?Artifact directory is required}")
release_id=${2:?Release ID is required}
[[ $source_dir == /home/thadmin/actions-runner/_work/_temp/th-release-*/unpacked ]] || { echo 'Artifact must come from the runner release directory'; exit 1; }
[[ $release_id =~ ^[a-zA-Z0-9_-]+$ ]] || exit 1
[[ -f $source_dir/deploy/install.sh ]] || exit 1
exec /bin/bash "$source_dir/deploy/install.sh" "$source_dir" "$release_id"
