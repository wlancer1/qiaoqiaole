# Peg Board MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based Chinese MVP for turning an uploaded reference image into an editable peg-board grid, live 3D preview, and STL export.

**Architecture:** Create a Vite React app with focused pure TypeScript modules for image/grid processing, palette editing helpers, geometry generation, and STL serialization. The UI keeps the full project state client-side, uses Canvas for image sampling, CSS for a dense tool interface, and Three.js for the live 3D preview.

**Tech Stack:** Vite, React, TypeScript, Three.js, Vitest, browser Canvas APIs.

---

## File Structure

- `package.json`: scripts and dependencies.
- `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`: Vite/TypeScript setup.
- `src/domain/types.ts`: shared project, cell, and settings types.
- `src/domain/grid.ts`: pure grid, palette, crop, fill, and history helpers.
- `src/domain/stl.ts`: pure geometry and STL serialization helpers.
- `src/domain/grid.test.ts`: tests for grid generation and editing behavior.
- `src/domain/stl.test.ts`: tests for STL output behavior.
- `src/App.tsx`: main tool shell and state wiring.
- `src/main.tsx`: React entry.
- `src/styles.css`: application styling.
- `README.md`: Chinese feature and roadmap documentation.

## Chunk 1: Foundation and Pure Domain Logic

### Task 1: Scaffold project and failing tests

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `src/domain/grid.test.ts`
- Create: `src/domain/stl.test.ts`

- [ ] Write tests that describe grid generation, bucket fill, undo-friendly edits, and STL export.
- [ ] Run `npm test -- --run` and verify it fails because domain modules are missing.
- [ ] Install dependencies with `npm install`.

### Task 2: Implement domain modules

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/grid.ts`
- Create: `src/domain/stl.ts`

- [ ] Implement the minimal pure functions required by the tests.
- [ ] Run `npm test -- --run` and verify tests pass.

## Chunk 2: React Tool UI and 3D Preview

### Task 3: Build the app shell

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`

- [ ] Implement image upload and Canvas-based grid extraction.
- [ ] Implement palette tools: brush, bucket fill, eyedropper, add/delete/update colors.
- [ ] Implement editable grid canvas with undo/redo keyboard shortcuts.
- [ ] Implement settings controls and computed dimensions/material estimate.
- [ ] Implement Three.js preview and STL download.

### Task 4: Documentation and verification

**Files:**
- Create: `README.md`

- [ ] Document completed MVP features in Chinese.
- [ ] Document pending second-stage features in Chinese.
- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Start dev server and provide the local URL.
