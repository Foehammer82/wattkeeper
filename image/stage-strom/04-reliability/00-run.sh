#!/bin/bash -e

install -d "${ROOTFS_DIR}/etc/systemd/system.conf.d"
install -d "${ROOTFS_DIR}/etc/systemd/journald.conf.d"
install -d "${ROOTFS_DIR}/etc/default"

install -m 0644 files/etc/systemd/system.conf.d/strom-watchdog.conf "${ROOTFS_DIR}/etc/systemd/system.conf.d/strom-watchdog.conf"
install -m 0644 files/etc/systemd/journald.conf.d/strom-journald.conf "${ROOTFS_DIR}/etc/systemd/journald.conf.d/strom-journald.conf"
install -m 0644 files/etc/default/zramswap "${ROOTFS_DIR}/etc/default/zramswap"
