#!/usr/bin/env bash
# Iteratively precreate every containerd dir sbx daemon complains about,
# until daemon starts or we hit a different error class.

export PATH="/c/Users/Jason W Clark/AppData/Local/DockerSandboxes/bin:$PATH"
LOG="/tmp/sbx_loop.log"
> "$LOG"

for i in $(seq 1 40); do
  echo "=== attempt $i ===" | tee -a "$LOG"
  out=$(timeout 10 sbx daemon start 2>&1 || true)
  echo "$out" | tee -a "$LOG"

  # Extract path after 'mkdir ' up to the colon
  path=$(echo "$out" | grep -oP 'mkdir [^:]+' | head -1 | sed 's/^mkdir //')
  if [ -z "$path" ]; then
    echo "no mkdir-path in output — stopping" | tee -a "$LOG"
    break
  fi

  # Convert Windows path to Git-Bash style
  unix_path=$(echo "$path" | sed 's#\\#/#g' | sed 's#^C:#/c#')
  echo "precreating: $unix_path" | tee -a "$LOG"
  mkdir -p "$unix_path" 2>&1 | tee -a "$LOG"
done

echo "=== final daemon status ==="
sbx daemon status 2>&1
