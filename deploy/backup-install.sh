#!/bin/bash
# Ежедневный бэкап базы с VPS на этот мак (deploy/backup.sh) — задача launchd, планировщика macOS.
# В отличие от cron, launchd не пропускает запуск, если мак спал: выполнит его сразу после пробуждения.
#   deploy/backup-install.sh            — установить или обновить (каждый день в HR_BACKUP_AT, по умолчанию 04:00)
#   deploy/backup-install.sh --remove   — убрать задачу (сами бэкапы остаются)
#   launchctl kickstart gui/$(id -u)/xyz.spill-the-tea.heated-rivalry.backup — запустить сейчас
# Журнал: ~/Library/Logs/heated-rivalry-backup.log
set -euo pipefail
LABEL=xyz.spill-the-tea.heated-rivalry.backup
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT="$(cd "$(dirname "$0")" && pwd)/backup.sh"
LOG="$HOME/Library/Logs/heated-rivalry-backup.log"
AT="${HR_BACKUP_AT:-04:00}"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
if [ "${1:-}" = "--remove" ]; then
  rm -f "$PLIST"
  echo "Задача $LABEL удалена. Бэкапы в ${HR_BACKUP_DIR:-$HOME/Backups/heated-rivalry} не тронуты."
  exit 0
fi

hour=$((10#${AT%%:*}))
minute=$((10#${AT##*:}))
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
xml() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' <<<"$1"; }
cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$(xml "$SCRIPT")</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$hour</integer>
    <key>Minute</key><integer>$minute</integer>
  </dict>
  <key>StandardOutPath</key><string>$(xml "$LOG")</string>
  <key>StandardErrorPath</key><string>$(xml "$LOG")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin</string>
  </dict>
</dict>
</plist>
EOF
plutil -lint "$PLIST" >/dev/null
launchctl bootstrap "$DOMAIN" "$PLIST"
printf 'Установлено: каждый день в %02d:%02d → %s\nЖурнал: %s\n' "$hour" "$minute" "${HR_BACKUP_DIR:-$HOME/Backups/heated-rivalry}" "$LOG"
