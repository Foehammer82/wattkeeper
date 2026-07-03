# Wattkeeper Image Build

This directory contains the Raspberry Pi OS Lite image pipeline for Wattkeeper nodes.

## Host Requirements

Builds are supported on x86_64 Linux hosts with:

- Docker
- a Linux kernel with `binfmt_misc` available
- permission to run privileged helper containers for `arm64` binfmt registration
- outbound network access to clone `github.com/RPi-Distro/pi-gen`

The build runs pi-gen through its Docker wrapper, but pi-gen still depends on host kernel features for arm64 chroots. The Wattkeeper wrapper tries to keep local setup minimal:

- if `qemu-aarch64` or `qemu-aarch64-static` already exists on the host, it reuses it
- otherwise it extracts a temporary `qemu-aarch64` helper from `multiarch/qemu-user-static`
- if `qemu-aarch64` is not registered in `binfmt_misc`, it first tries `docker run --privileged --rm tonistiigi/binfmt --install arm64`

That means a normal local build can often succeed with Docker alone, as long as the host kernel exposes `binfmt_misc` and allows privileged containers.

## Build

From the repo root:

```sh
make image VERSION=v0.1.0
```

That target:

1. cross-compiles the agent with `make agent`
2. clones the `arm64` pi-gen branch into a temporary workspace without spaces in the path
3. injects the Wattkeeper custom stage plus the `dist/wattkeeper-agent-linux-arm64` payload and deploy assets
4. runs `build-docker.sh`
5. copies the resulting image to `dist/wattkeeper-node-v0.1.0.img.xz`

The target also writes `dist/wattkeeper-node-v0.1.0.img.xz.sha256`.

## Flash Procedure

1. Build or download a tagged release image artifact.
2. Open Raspberry Pi Imager.
3. Choose `Use custom` and select the `wattkeeper-node-<version>.img.xz` file.
4. Open the Imager customization dialog and set:
   - WiFi SSID, password, and regulatory country
   - at least one SSH public key
   - the SSH authentication mode Pi Imager exposes for key-based access
5. Flash the card and boot the Pi Zero 2 W.
6. Plug in a USB UPS and wait for the node to finish first boot.

## First-Boot Behavior

The image relies on Raspberry Pi OS first boot for filesystem expansion. Wattkeeper adds a separate oneshot service that:

- sets the hostname to `wkeeper-node-<last4 serial>`
- creates `/var/lib/wattkeeper`
- records completion and disables itself

This service does not replace or overwrite Raspberry Pi Imager's boot partition customization flow. WiFi settings, SSH key injection, and other standard Imager data still flow through the usual `firstrun.sh` handling provided by Raspberry Pi OS.

## Security Constraints

- No WiFi credentials are baked into the image.
- No SSH authorized keys are baked into the image.
- No NUT passwords or controller credentials are baked into the image.
- SSH is enabled in the base image; use Pi Imager to inject keys and apply its standard SSH hardening at flash time.
