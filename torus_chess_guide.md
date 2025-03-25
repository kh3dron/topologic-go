# TORUS CHESS IMPLEMENTATION & REPRESENTATION 

# REAL BOARD

8x8 standard chess board. coordinates are 0-7 for rows and columns, with 0,0 in the bottom left corner (white rook) and 7,7 in the top right corner (black rook).

# ROTATION BOARD

this is a larger area of multiple 8x8 boards. they can be arranged in any pattern as described in this game's particular rules. these "rotated boards" are populated with piecewise transformed versions of the real board.

For example, in "torus chess", the rotation is a single 8x8 board reflected above the real board. the white king starting position is 0,0 in the real board, and 0,0 in the rotation board.

The piecewise translation rules are as follows:

- for (x, y < 8) in the real board, the corresponding position in the rotation board is (x, y). as you can see, these pieces are unaltered because they are inside the REAL BOARD.
- for (x, y >= 8) in the rotation board, the contents of this cell are equal to the contents of (x, -y). each cell of the rotation board that is not inside the real board is filled in by a set of piecewise functions like this.

# TESSELATION BOARD

the TESSELLATION BOARD is a regular tessellation of the rectangular board.

this one is really easy. what the USER sees is an infinite grid of chess cells. to translate a point outisde the tessellation to a point in the rotation board, we just tmod by height and width of the rotation board.

So, every cell on the infinite plane can be represented in 3 ways:

- its globaly unique tessellation coordinate
- its rotation coordinate
- its real coordinate

Note: the COLOR of each chess cell will also be calculated according to these translation rules from real to rotational to tessellation space. this means that tessellation space will not be a perfect checkerboard pattern. (this also means that bishops can change color tiles in this game.)

# FINDING POSSIBLE MOVES

each chess piece moves normally in TESSELLATION SPACE. the set of possible moves and captures is then translated back down into ROTATION SPACE and REAL SPACE, then displayed on the board.

For example, a rook can move sideways off the right edge of one board, and enter the left edge of the next board over in TESSELLATION SPACE.

There is one interesting edge case to this game. Pawns are the only piece in chess with a sense of "direction". this direction must be stored in an internal state for each pawn. if a pawn enters a new board via TESSELLATION SPACE, its direction may change relative to all boards. preserve this information.

Pawns still promote if they enter their respective ROW in REAL BOARD SPACE.


---
That's the end of the game logic. Now, what I want you to do is take this partially working game file and complete the game. 

- I want infinite scrolling to work as it does now. 
- I want functions for translating between all coordinate systems. 
- I want possible move projections to work as they do now (grey circles for possible moves, red circles on captures). 

Please give this a shot. I know you can do it. 