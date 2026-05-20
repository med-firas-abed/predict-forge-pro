# Relay PC Setup

This is the canonical relay-PC wording for the client-side live bridge.

The detailed checklist remains in [BOSS_SETUP_SIMPLE.md](./BOSS_SETUP_SIMPLE.md).  
The filename is historical, but the content now describes the real target architecture:

`LabVIEW / PLC -> client-side relay PC -> MQTT or HTTP -> PrediTeq backend -> frontend`

Use this file as the clean entry point when you want the generic naming first, then open [BOSS_SETUP_SIMPLE.md](./BOSS_SETUP_SIMPLE.md) for the full step-by-step setup.

For the smooth jury/local path with the real machine already visible in the app, also use:

- [scripts/setup_real_machine_demo.py](./scripts/setup_real_machine_demo.py)

This helper creates or updates `ARO-01`, then preloads recent runtime history so HI, calendar context, and RUL can appear before the live CSV relay continues.
