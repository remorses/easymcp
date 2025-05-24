# Modelcontext Monorepo

This repository is structured as a [pnpm workspace](https://pnpm.io/workspaces), following a modular monorepo pattern.

## Structure

- `website/`  
  The main application. All user-facing code and configuration resides here.
- `ai/`  
  Excluded from the workspace (internal or external dependencies/code).
- `openapis/`  
  Excluded from the workspace (API specs, external dependencies, or vendor code).

## Workspace

The `pnpm-workspace.yaml` at the root configures the workspace to **only include the `website` folder**.  
Projects in `ai` and `openapis` are _not_ managed by the workspace and should be handled separately if needed.

## Getting Started

Navigate to the `website/` directory for all development, install, and build tasks:

```sh
cd website
pnpm install
pnpm run dev
```

## For maintainers

- Do not move `ai` and `openapis` into the workspace unless requirements change.
- All dependencies and scripts for the main app live under `website/`.
- For global scripts or tools, prefer keeping them under `website/scripts` for clarity.

---

This approach keeps the primary app isolated and workspace installs clean, ensuring that only intended packages are managed by pnpm.