# vite-plugin-playground-picker

Vite dev-server plugin that injects the Moloco Inspect **Playground picker runtime** into the sandbox app. The runtime opens a nonce-authenticated `postMessage` channel back to the parent playground-app and supplies:

1. **Element identification** — fiber / testId / selector / debugSource in priority order ([v3 plan §14 E4](../../docs/superpowers/plans/2026-04-22-playground-architecture-v3.md), [spike A4](../../docs/spikes/2026-04-22-playground-feasibility.md)).
2. **SPA route tracking** — patches `history.pushState` / `replaceState` + listens for `popstate`, forwards changes so the parent can filter pins per route.
3. **Pick / Pin integration** — emits `playground.picked` events the parent consumes to attach semantic identifiers to pins.

The plugin is **dev-only** (`apply: 'serve'`) and only ships inside the sandbox image; it never runs in the playground-app itself.

## Install

Inside the sandbox container the package lives at `/workspace/plugins/vite-plugin-playground-picker` and is wired into `msm-portal-web`'s `vite.config` at image build time. See `sandbox/Dockerfile` (updated in M3 Step D).

## Usage

```ts
// msm-portal-web/vite.config.ts (inside sandbox)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import playgroundPicker from 'vite-plugin-playground-picker';

export default defineConfig({
  plugins: [
    react(),
    playgroundPicker({ debug: false }),
  ],
});
```

## Handshake protocol

The parent playground-app mounts the iframe with the following query params:

```
http://127.0.0.1:<vitePort>/?__playground_nonce=<uuid>&__playground_origin=<parent_origin>
```

On load the runtime sends:

```json
{
  "source": "playground-picker",
  "type": "playground.ready",
  "nonce": "<uuid>",
  "seq": 1,
  "timestamp": 1776842239092,
  "runtimeVersion": "0.1.0",
  "route": "/creative-review"
}
```

All subsequent child → parent messages carry the same `nonce`. The parent validates `event.origin` against a loopback/LAN allowlist **and** the nonce before accepting.

See `src/types.ts` for the full message catalog.

## Build

```bash
pnpm install
pnpm build   # tsc -p . → dist/
```

## Status

**v0.1.0 — M3 Step A** (this commit): handshake + route tracking + click capture wired end-to-end; fiber walker and overlay UI are stubs that land in Step B.
