#!/usr/bin/env bash
# macOS 桌面启动器（实验性，未在真机现场验证——见 references/macos.md）。
# 仅 macOS；Windows 请用 start-desktops.ps1。
# 行为：健康的调试实例直接复用；未开端口的运行实例先优雅退出再重启；
#       当前目录有运行中的调度器（runner.lock 活跃）时默认拒绝重启。
set -euo pipefail

ENGINE="both"
ZCODE_APP="/Applications/ZCode.app"
WORKBUDDY_APP="/Applications/WorkBuddyAI.app"
GRACE=5
FORCE=0

usage() {
  cat <<'USAGE'
Usage: start-desktops.sh [--engine both|zcode|workbuddy]
                          [--zcode-path /Applications/ZCode.app]
                          [--workbuddy-path /Applications/WorkBuddyAI.app]
                          [--grace 5] [--force-restart]
环境边界与真机验证清单见 references/macos.md。
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--engine) ENGINE="${2:?缺少取值}"; shift 2 ;;
    -z|--zcode-path) ZCODE_APP="${2:?缺少取值}"; shift 2 ;;
    -w|--workbuddy-path) WORKBUDDY_APP="${2:?缺少取值}"; shift 2 ;;
    --grace) GRACE="${2:?缺少取值}"; shift 2 ;;
    --force-restart) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$ENGINE" in zcode|workbuddy|both) ;; *) echo "engine 必须为 zcode|workbuddy|both" >&2; exit 2 ;; esac

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "此脚本仅支持 macOS（当前：$(uname -s)）。Windows 请使用 start-desktops.ps1。" >&2
  exit 2
fi

port_for() { case "$1" in zcode) echo 19331 ;; workbuddy) echo 19332 ;; esac; }
app_name() { local b; b=$(basename "$1"); echo "${b%.[aA][pP][pP]}"; }
bin_for() { echo "$1/Contents/MacOS/$(app_name "$1")"; }

# 桥健康 = /json/version 可用且 /json/list 里存在带本应用名的 file: 页面。
bridge_ready() {
  local port="$1" marker
  marker=$(app_name "$2")
  curl -fsS --max-time 2 "http://127.0.0.1:$port/json/version" 2>/dev/null | grep -q 'webSocketDebuggerUrl' || return 1
  curl -fsS --max-time 2 "http://127.0.0.1:$port/json/list" 2>/dev/null | grep -qi "file:[^\"]*$marker" || return 1
}

app_running() { pgrep -f "$(bin_for "$1")" >/dev/null 2>&1; }

# 与 Windows 端 Test-WtActiveWorkflow 等价的最小保护：锁存在且 pid 存活则拒。
scheduler_alive() {
  local lock="./.work-together/runner.lock" pid=""
  [[ -f "$lock" ]] || return 1
  pid=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('pid',''))" "$lock" 2>/dev/null || true)
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

quit_app() {
  local app="$1" waited=0 label
  label=$(app_name "$app")
  osascript -e "quit app \"$label\"" >/dev/null 2>&1 || true
  while app_running "$app" && (( waited < GRACE * 4 )); do sleep 0.5; waited=$((waited + 1)); done
  if app_running "$app"; then
    echo "优雅退出超时，正在终止该应用剩余进程。"
    pkill -f "$(bin_for "$app")" 2>/dev/null || true
    sleep 1
  fi
}

launch() {
  local engine="$1" app="$2" port="$3" bin
  bin=$(bin_for "$app")
  if [[ ! -x "$bin" ]]; then
    echo "找不到可执行文件：$bin（用 --zcode-path/--workbuddy-path 指定 .app 路径）" >&2
    return 9
  fi
  if [[ "$engine" == zcode ]]; then
    nohup "$bin" --remote-debugging-address=127.0.0.1 --remote-debugging-port="$port" >/dev/null 2>&1 &
  else
    WORKBUDDY_REMOTE_DEBUGGING_PORT="$port" nohup "$bin" >/dev/null 2>&1 &
  fi
}

wait_ready() {
  local engine="$1" port="$2" marker="$3" waited=0
  while (( waited < 120 )); do
    bridge_ready "$port" "$marker" && return 0
    sleep 0.5; waited=$((waited + 1))
  done
  echo "启动超时：端口 $port 未出现 $engine 的桌面会话。" >&2
  return 1
}

ensure() {
  local engine="$1" app="$2" port marker bin
  port=$(port_for "$engine"); marker=$(app_name "$app")
  if [[ "$FORCE" -eq 0 ]] && bridge_ready "$port" "$marker"; then
    echo "$engine bridge ready ($port)，复用现有实例。"
    return 0
  fi
  bin=$(bin_for "$app")
  if [[ ! -x "$bin" ]]; then
    echo "找不到 $engine 应用：$bin（用 --zcode-path/--workbuddy-path 指定 .app 路径）" >&2
    return 9
  fi
  if app_running "$app"; then
    if [[ "$FORCE" -eq 0 ]] && scheduler_alive; then
      echo "$engine 当前项目调度器仍在运行，未重启；确认后用 --force-restart。" >&2
      return 1
    fi
    echo "$engine 正在运行，正在自动退出并以调试端口重启……"
    quit_app "$app"
  fi
  launch "$engine" "$app" "$port"
  echo "$engine 已启动，等待桌面会话就绪……"
  wait_ready "$engine" "$port" "$marker"
  echo "$engine bridge ready ($port)。"
}

case "$ENGINE" in
  zcode) ensure zcode "$ZCODE_APP" ;;
  workbuddy) ensure workbuddy "$WORKBUDDY_APP" ;;
  both) ensure zcode "$ZCODE_APP"; ensure workbuddy "$WORKBUDDY_APP" ;;
esac
