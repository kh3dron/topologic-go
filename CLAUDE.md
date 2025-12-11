# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Topologic Games is a collection of interactive browser-based board games (Chess and Go) reimplemented on non-Euclidean surfaces and topological spaces. The project serves as both entertainment and mathematical visualization, demonstrating how familiar games behave differently on alternative geometric surfaces like toruses and spheres.

## Running the Project

This is a static web application with no build step required.

To run locally:

```bash
# Serve with any static file server, e.g.:
python -m http.server 8000
# Or:
npx serve
```

Then open `http://localhost:8000` in a browser.

Game URLs:

- Main menu: `index.html`
- Games:
  - `games/torus-chess/torus-chess.html`
  - `games/torus-reflected-chess/torus-reflected-chess.html`
  - `games/spherical-chess/spherical-chess.html`
  - `games/torus-go/torus-go.html`

## Code Architecture

### Module Structure

Each game is completely self-contained with no shared code between games:

```txt
games/{game-name}/
├── {game-name}.html    # HTML entry point with UI elements
├── {game-name}.js      # Game logic (1,200-1,400 lines each)
└── {game-name}.md      # Optional game-specific notes
```

### Coordinate System Architecture

Games use multiple coordinate spaces to handle topological transformations. Most have a version of the same components:

Movement coordinates are the heart of this application's logic. In some games, pieces maintain an internal "state", indicating their direction at the beginning of the game. Moves off the sides of the board may alter this state, such as rotating the directio a pawn moves.

### Rendering

2D Canvas (Primary):

- Main game rendering uses HTML5 Canvas 2D context
- Responsive sizing (adapts to window dimensions)
- Supports pan (click-drag), zoom (mousewheel), and piece selection
- Draws tessellated/repeated views for topological surfaces

## Key Implementation Details

### Edge Wrapping (Torus Games)

For torus-based games, when calculating moves that go off the board edge:

- Coordinates wrap around using modulo arithmetic
- Example: position (9, 3) on 8×8 board becomes (1, 3)

### Piece Movement Calculation

Movement calculation is always done on the true board first:

1. Calculate possible moves using standard chess/Go rules
2. Apply edge overflow rules if moves extend beyond board boundaries
3. Transform these moves to rotation/tessellation space for display
4. Render all possibilities across the visible tessellated view

## Dependencies

Assets:

- Chess piece SVGs in `/chess_icons/`. Chess games are drawn by placing these icons on the grid. The grid itself is drawn with simple canvas elements.
- Background: `escher.jpg`
- Shared CSS: `style.css`

### When Modifying Games

- Each game file is ~1,200-1,400 lines of code
- Games do not share code - changes to one don't affect others
- Canvas rendering happens in `drawBoard()` method
- Game logic lives in `getPossibleMoves()` and related methods
- All coordinate transformations should happen through the established coordinate space system (true → rotation → tessellation)
