#!/bin/sh
set -eu

if [ "${1:-}" = "" ]; then
	echo "usage: $0 /path/to/strom-agent" >&2
	exit 1
fi

BIN_SOURCE=$1
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)

if [ ! -f "$BIN_SOURCE" ]; then
	echo "binary not found: $BIN_SOURCE" >&2
	exit 1
fi

install -d /usr/local/bin /usr/local/libexec /etc/systemd/system /etc/udev/rules.d
install -d /etc/systemd/system.conf.d /etc/systemd/journald.conf.d /etc/default
install -m 0755 "$BIN_SOURCE" /usr/local/libexec/strom-agent-recovery
install -m 0755 "$SCRIPT_DIR/strom-agent-launcher.sh" /usr/local/bin/strom-agent
install -m 0644 "$SCRIPT_DIR/strom-agent.service" /etc/systemd/system/strom-agent.service
install -m 0644 "$SCRIPT_DIR/strom-ssh-access.service" /etc/systemd/system/strom-ssh-access.service
install -m 0644 "$SCRIPT_DIR/strom-update-check.service" /etc/systemd/system/strom-update-check.service
install -m 0644 "$SCRIPT_DIR/strom-update-check.timer" /etc/systemd/system/strom-update-check.timer
install -m 0644 "$SCRIPT_DIR/99-strom-agent.rules" /etc/udev/rules.d/99-strom-agent.rules
install -m 0644 "$SCRIPT_DIR/strom-watchdog.conf" /etc/systemd/system.conf.d/strom-watchdog.conf
install -m 0644 "$SCRIPT_DIR/strom-journald.conf" /etc/systemd/journald.conf.d/strom-journald.conf
install -m 0644 "$SCRIPT_DIR/strom-zramswap.conf" /etc/default/zramswap

systemctl daemon-reload
udevadm control --reload
systemctl enable strom-ssh-access.service
systemctl enable --now strom-update-check.timer
systemctl enable --now strom-agent.service
if systemctl list-unit-files zramswap.service >/dev/null 2>&1; then
	systemctl enable --now zramswap.service
fi
