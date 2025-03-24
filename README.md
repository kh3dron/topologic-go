# topologic-go

# Torus Go 

# Torus Chess 

# Spherical Chess 

Chess 

- The tesselation space will be 4 chessboards. These boards will be "pointing" clockwise: the bottom left board has white pieces at the bottom, black pieces at the top. The top left board is rotated to have white pieces against the left edge and black against the right edge, and so on. 
- this pattern creates a "windmill" shape of white pieces in the middle.

This creates the "rotation space" for the game. 
![rotation space](./screenshots/spherical_chess/rotation_space.png)


This 4-board group is then tesselated across the infinite plane. 
![tesselation space](./screenshots/spherical_chess/tessellation_space.png)


Pieces can move continuously (as in, according to their standard movement rules) through the rotation space (the 4-board rotational space) AND the teseslation space (the infinite repetitions of the 4-board group). It's important to remember that there's only one of each piece. these tesselation and rotation views are just to make it simpler to see where the pieces can reach at any given moment (yes, this really is the simplet way to see that - according to some definitions of simpler!)

Implement this game system with multiple sets of coordintes: 
ROTATION COORDINATES, ranging from 0 to 15 for X and Y. 
TESSELATION COORDINATES, beginning at (0,0) for the grid in the middle and moving by +-1 as the user drags the game board around. 

TO calculate where a piece can move, do the following: 
    - for that piece, on it's "true" (unrotated, untessellated) board, calculate each the coordinates for where that piece could move. 
    - If any of these coordinates extend off the side of the board, continue the pathfinding into the adjacent board. implement this with wraparound math for the base board. do NOT involve the rotated or tesselated boards. 
    - Now, you should have a set of coordinates on the base board of where this piece can move, including those that wrap around the edges. Fill those spaces in with grey and red circles as per usual. 
    - rotate and tesselate this board across the entire screen as per the rotation and tessellation rules. 