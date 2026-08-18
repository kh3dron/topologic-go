// Undo history + localStorage persistence for local hotseat games.
//
// A history entry is the engine-serialized state (GameModule.serialize via the
// view's saveState hook). The engines copy-on-write, so entries share structure
// with each other and the in-memory stack stays cheap; localStorage gets only
// the current state, because a persisted full stack would grow quadratically
// (Go snapshots embed the whole superko `seen` list). Restores hand loadState
// a structuredClone so stack entries never alias live engine state.
//
// Disarmed until play.ts arms it for an offline variant. Online games are
// server-authoritative and never arm; games without a saveState hook (snake:
// real-time, nothing meaningful to undo or restore) leave it disarmed too.

import { currentGame } from './state';
import { viewFor } from './views';

const STORAGE_VERSION = 1;
const MAX_DEPTH = 400; // plies kept for undo; the oldest fall off

let storageKey: string | null = null;
let stack: unknown[] = [];
let topJson: string | null = null;

function syncUndoButton(): void {
  const btn = document.getElementById('undo-btn') as HTMLButtonElement | null;
  if (btn) btn.disabled = !canUndo();
}

function persist(): void {
  if (!storageKey || topJson === null) return;
  try {
    localStorage.setItem(storageKey, `{"v":${STORAGE_VERSION},"state":${topJson}}`);
  } catch {
    // Quota exceeded or storage disabled: play on without persistence.
  }
}

export function armHistory(key: string): void {
  storageKey = viewFor(currentGame).saveState ? key : null;
  stack = [];
  topJson = null;
  syncUndoButton();
}

export function canUndo(): boolean {
  return storageKey !== null && stack.length >= 2;
}

// Called by updateStatus() after every state change. Serialized-state dedup
// filters the refreshes that change nothing (selection clicks, zoom refits).
export function historyOnStateChange(): void {
  if (!storageKey) return;
  const snap = viewFor(currentGame).saveState!();
  const json = JSON.stringify(snap);
  if (json === topJson) return;
  stack.push(snap);
  if (stack.length > MAX_DEPTH) stack.shift();
  topJson = json;
  persist();
  syncUndoButton();
}

// Revert to the previous ply. The caller re-renders.
export function undoMove(): boolean {
  if (!canUndo()) return false;
  stack.pop();
  const top = stack[stack.length - 1];
  topJson = JSON.stringify(top);
  viewFor(currentGame).loadState(structuredClone(top));
  persist();
  syncUndoButton();
  return true;
}

// New Game: drop the stack and the saved game.
export function clearHistory(): void {
  stack = [];
  topJson = null;
  if (storageKey) {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }
  syncUndoButton();
}

// Boot: load the saved game for the armed key, if any. Returns true when a
// state was restored (the caller still re-renders). Unreadable or
// wrong-version data is discarded and the game starts fresh.
export function restoreSavedGame(): boolean {
  if (!storageKey) return false;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;
    const data = JSON.parse(raw) as { v?: number; state?: unknown };
    if (data.v !== STORAGE_VERSION || data.state === undefined) throw new Error('stale save');
    viewFor(currentGame).loadState(structuredClone(data.state));
    stack = [data.state];
    topJson = JSON.stringify(data.state);
    syncUndoButton();
    return true;
  } catch {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    stack = [];
    topJson = null;
    return false;
  }
}
