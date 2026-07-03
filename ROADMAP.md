# Wattkeeper — Roadmap

Distributed UPS monitoring and management. UniFi-style controller/adopt model:
cheap Pi Zero 2 W nodes run NUT and auto-configure any USB UPS plugged into them,
a central controller discovers/adopts nodes, aggregates metrics, and bridges
everything to Home Assistant.

> Project name is `wattkeeper`. It appears in module paths, binary names,
> systemd unit names, and the mDNS service type.

## Repo layout (monorepo)

```
wattkeeper/
├── ROADMAP.md
├── PROMPTS.md                  # copilot prompts for each phase
├── Makefile                    # top-level build/test/image targets
├── agent/                      # Go node agent (runs on the Pi)
│   ├── cmd/agent/
│   └── internal/
│       ├── hotplug/            # udev event watching
│       ├── nutconf/            # nut-scanner parsing + ups.conf generation
│       ├── discovery/          # mDNS advertisement
│       └── api/                # local HTTP API (adoption target, later)
├── controller/                 # Go backend + React UI (Phase 3+)
│   ├── cmd/controller/
│   ├── internal/
│   └── web/
├── image/                      # pi-gen based SD card image build
│   ├── stage-wattkeeper/         # custom pi-gen stage
│   └── config                  # pi-gen config
├── sim/                        # virtual UPS + node simulation (stretch)
│   ├── dummy-ups/              # NUT dummy-ups driver configs + .dev files
│   └── docker-compose.yml      # simulated node(s) in containers
└── deploy/                     # systemd units, udev rules, install scripts
```

## Phase 0 — Repo scaffold

- [x] Init repo, Go workspace (`go.work`) covering `agent/` and `controller/`
- [x] Top-level Makefile: `make agent`, `make image`, `make sim-up`, `make test`
- [ ] CI stub (GitHub Actions): lint + test on push, cross-compile agent for
      `linux/arm64` (Zero 2 W is 64-bit capable) and `linux/arm` (fallback)
- [x] `.editorconfig`, `gofmt`/`golangci-lint` config

## Phase 1 — Node agent MVP

Goal: plug any USB UPS into a Pi running the agent and it appears as a working
NUT netserver with zero manual config, discoverable on the LAN.

- [x] **Hotplug watcher**: subscribe to udev events (netlink) for USB
      add/remove; debounce (UPSes enumerate noisily)
- [x] **Scanner**: shell out to `nut-scanner -U` on boot and on hotplug events;
      parse output into structs (driver, port, vendorid, productid, serial)
- [ ] **Config generation**: render `/etc/nut/ups.conf` from scan results.
      Stable UPS naming: derive from serial number so names survive reboots
      and port changes. Template `nut.conf` (netserver), `upsd.conf`
      (LISTEN 0.0.0.0 3493), `upsd.users` (placeholder creds for Phase 1;
      controller-provisioned in Phase 3)
- [ ] **Service management**: restart/reload `nut-server` and
      `nut-driver@` units only when generated config actually changed
      (hash compare)
- [ ] **mDNS advertise**: `_wattkeeper._tcp.local` with TXT records:
      `id=<pi-serial>`, `adopted=false`, `ups_count=N`, `version=X`
- [ ] **Agent health endpoint**: `GET /healthz` on :8080 — agent version,
      UPS list, NUT driver status, CPU temp, uptime
- [ ] Systemd unit + udev rule files in `deploy/`
- [ ] Unit tests: scanner output parsing, config rendering, name stability

**Exit criteria**: fresh Raspberry Pi OS Lite + agent installed → plug in
BE1050G3 → `upsc <name>@<pi-ip>` works from another machine within ~15s, and
the node shows up in `avahi-browse _wattkeeper._tcp`.

## Phase 2 — Flashable image

Goal: one `.img` file. Flash, boot, done.

- [ ] pi-gen custom stage: installs `nut`, agent binary, systemd units,
      udev rules; disables unneeded services; enables SSH with key-only auth
      (key injected at flash time via bootfs, same mechanism as Pi Imager)
- [ ] First-boot script: expand filesystem, generate per-device NUT runtime
      dirs, hostname = `wkeeper-node-<last4 of serial>`
- [ ] WiFi provisioning: support standard `custom.toml` / Pi Imager style
      config on the boot partition so users set WiFi creds at flash time
      without touching the rootfs
- [ ] `make image` target that runs pi-gen in Docker and drops
      `wattkeeper-node-vX.Y.Z.img.xz` in `dist/`
- [ ] CI job to build image on tag

**Exit criteria**: flash image with Pi Imager (WiFi + SSH key set in imager),
boot Pi, plug in UPS, node is discoverable and serving NUT with no SSH session
ever opened.

## Phase 3 — Controller: discovery + adoption

Goal: web UI that shows pending nodes, adopts them securely, and becomes the
single pane of glass.

- [ ] Go backend: mDNS browser tracks live nodes; SQLite registry of adopted
      nodes (id, name, location label, adopted_at, last_seen, agent version)
- [ ] **Adoption handshake**:
      1. Controller has a self-signed CA (generated on first run)
      2. Adopt click → controller calls node agent API `POST /adopt` with its
         CA cert + a freshly generated per-node NUT password + agent API token
      3. Node stores them, rewrites `upsd.users`, pins controller CA, flips
         mDNS TXT to `adopted=true`, rejects future `/adopt` calls
      4. All subsequent controller→node API traffic is TLS with the pinned CA;
         re-adoption requires factory reset (documented file to delete on the
         node, or physical button/GPIO later)
- [ ] NUT polling: controller maintains NUT client connections to every
      adopted node, snapshots all variables on an interval into SQLite
      (retention configurable)
- [ ] React UI: pending adoptions, fleet grid (status/load/runtime/battery),
      per-UPS detail with history charts, per-node health (temp, disk,
      agent version), rename UPS/node, trigger instcmds (beeper, battery test)
- [ ] Alert rules: on-battery, low-battery, node-offline → webhook + MQTT
      (notification plumbing beyond that stays in HA)

**Exit criteria**: two real nodes adopted through the UI, credentials never
hand-configured, pulling live metrics, instcmd round-trips work.

## Phase 4 — Home Assistant bridge

- [ ] MQTT publisher with HA discovery: every UPS becomes a device with
      sensors (charge, load, runtime, voltage, status) + buttons for
      supported instcmds; controller/node health as diagnostic entities
- [ ] Optional: aggregate NUT server mode — controller re-serves all
      downstream UPSes on its own :3493 for anything that speaks native NUT
- [ ] Docs: HA setup guide

**Exit criteria**: fresh HA instance + MQTT integration → all UPSes appear
automatically with correct device grouping, controls work.

## Phase 5 — Hardening & lifecycle

- [ ] Agent OTA updates pushed from controller (signed binaries)
- [ ] Node factory-reset flow (GPIO jumper or boot-partition flag file)
- [ ] Battery health trending / replace-by estimates from runtime decay
- [ ] Backup/restore of controller DB
- [ ] Read-only rootfs or overlayfs on nodes to survive SD card abuse
- [ ] Multi-UPS-per-node support verification (USB hub on a 3A+ etc.)

## Phase 6 — Documentation & roadmap closeout

- [ ] Update `README.md` so it reflects the shipped architecture, setup flow,
      operational model, and current capabilities rather than planned work
- [ ] Add or refresh end-user and operator documentation for installation,
      adoption, upgrades, backup/restore, and recovery flows
- [ ] Remove completed or superseded planning details from `ROADMAP.md` once
      the project has fully shipped and the roadmap is no longer the source of
      truth
- [ ] Delete `ROADMAP.md` after all roadmap phases are complete and its final
      documentation has been incorporated into `README.md` and any permanent
      docs

## Stretch — Virtual test rig (`sim/`)

Not required, keep it cheap:

- NUT ships a `dummy-ups` driver that replays a `.dev` file of UPS variables —
  perfect fake UPS. A container running the agent with `dummy-ups` entries
  injected (agent gets a `--simulate <dir>` flag that bypasses nut-scanner and
  treats each `.dev` file as a discovered UPS) simulates a full node without
  hardware.
- `docker-compose.yml`: N simulated nodes + controller on one bridge network.
  mDNS inside Docker needs host networking or an avahi-reflector sidecar —
  acceptable jank for a test rig.
- Scripted scenarios: edit the `.dev` file live to simulate going on-battery,
  draining, node vanishing (stop container) → verify controller alerting.

## Deliberately out of scope (for now)

- Cloud/remote access (Tailscale already solves this for you)
- Non-USB UPS transports (SNMP cards) — controller design shouldn't preclude
  it, but don't build it
- Windows/macOS nodes