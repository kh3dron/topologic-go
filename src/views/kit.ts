// Client-side view adapters: the DOM/render counterpart to the pure engine's
// GameModule. One GameView per game encapsulates everything the render shell
// needs that is game-specific (sizing, cell/board DOM, status text, info-panel
// copy), so render.ts / play.ts dispatch through viewFor(id) instead of
// currentGame === '...' branches. Views may touch the DOM and read the stateful
// engine wrappers (chess.ts / go.ts / hexchess.ts); they never import render.ts
// (render -> views -> wrappers stays one-directional).

import { Topology } from '../topology';
import { Color } from '../engine/core';

export interface Extent {
  w: number;
  h: number;
}

// Online integration handed to a game wrapper. When engaged, the wrapper only
// applies moves for `lockColor` on its turn (null = spectator, no moves) and
// calls `onCommit` with the engine-format move it just applied (for submission).
export interface OnlineOpts {
  engaged: boolean;
  lockColor: Color | null;
  onCommit: (move: unknown) => void;
}

export interface CellOpts {
  light: boolean; // square parity, used by grid games with coloured cells
  walls: { top: boolean; bottom: boolean; left: boolean; right: boolean }; // off-board neighbours
}

// Hooks render.ts passes into view methods so views can trigger a re-render /
// status refresh and read live shell state without importing render.ts.
export interface RenderDeps {
  rerender(): void;
  refreshStatus(): void;
  tessellated(): boolean;      // current topology tiles the plane (square-grid only)
  hoverSuppressed(): boolean;  // a drag is in progress; skip hover sync
}

export interface InfoPanel {
  description: string;
  article: string;
  spec: string[];
  links: { label: string; url: string }[];
}

export interface GameView {
  id: string;
  name: string;       // full title (info panel / page)
  shortName: string;  // compact label (game selector button)
  // 'square-grid' games render through the shared tessellated CSS-grid path and
  // use the topology overlay + pan; 'custom' games render themselves (hex SVG).
  family: 'square-grid' | 'custom';
  usesTopology: boolean;
  showsPassButton: boolean;
  cellBase: number;   // base cell px (pre-zoom)
  size: number;       // canonical board size for square-grid; 0 for custom

  reset(): void;
  status(): string;
  infoPanel(topo: Topology): InfoPanel;

  // Online play: load the server's authoritative state, and engage/disengage
  // move gating + commit reporting.
  loadState(serialized: unknown): void;
  setOnline(opts: OnlineOpts): void;

  // True when a piece/cell is selected, so the shell locks board panning.
  selectionActive?(): boolean;

  // square-grid hooks
  prepareRender?(): void;                                                   // reset per-render caches
  createCell?(row: number, col: number, opts: CellOpts, deps: RenderDeps): HTMLElement;

  // custom-render hook; returns the on-screen extent so pan/centering works
  renderCustom?(boardEl: HTMLElement, cellPx: number, deps: RenderDeps): Extent;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
