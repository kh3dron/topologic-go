# TABLES 

## Users Table
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rating INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);
```

## Games Table
```sql
CREATE TABLE games (
    id SERIAL PRIMARY KEY,
    white_player_id INTEGER REFERENCES users(id),
    black_player_id INTEGER REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending', -- pending, in_progress, completed, abandoned
    result VARCHAR(20), -- white_win, black_win, draw, abandoned
    fen_position TEXT DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    move_history JSONB DEFAULT '[]',
    time_control INTEGER, -- in seconds
    white_time_remaining INTEGER,
    black_time_remaining INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE
);
```

## Game Moves Table (Optional - for detailed move history)
```sql
CREATE TABLE game_moves (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES games(id),
    move_number INTEGER NOT NULL,
    move_notation VARCHAR(10) NOT NULL,
    fen_after_move TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## User Game Statistics Table
```sql
CREATE TABLE user_game_stats (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    games_lost INTEGER DEFAULT 0,
    games_drawn INTEGER DEFAULT 0,
    highest_rating INTEGER DEFAULT 1200,
    lowest_rating INTEGER DEFAULT 1200,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## Indexes
```sql
-- Indexes for faster lookups
CREATE INDEX idx_games_white_player ON games(white_player_id);
CREATE INDEX idx_games_black_player ON games(black_player_id);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_game_moves_game_id ON game_moves(game_id);
```

## Notes on Schema Design

1. **Users Table**:
   - Stores basic user information
   - Includes rating for chess ELO system
   - Tracks user activity

2. **Games Table**:
   - Links to both players
   - Stores game state using FEN notation
   - Tracks time controls and remaining time
   - Records game status and result
   - Stores move history as JSONB for flexibility

3. **Game Moves Table** (Optional):
   - Detailed move-by-move history
   - Useful for replay functionality
   - Can be used for analysis

4. **User Game Statistics**:
   - Tracks player performance
   - Maintains rating history
   - Useful for leaderboards and matchmaking

5. **Indexes**:
   - Optimized for common queries
   - Improves performance for player lookups
   - Helps with game status filtering

## Additional Considerations

1. **Security**:
   - Passwords should be hashed using a secure algorithm (e.g., bcrypt)
   - Consider adding rate limiting for moves
   - Implement proper session management

2. **Performance**:
   - The FEN position and move history are stored as text/JSONB for flexibility
   - Consider partitioning the game_moves table for large-scale applications
   - Implement caching for frequently accessed data

3. **Extensions**:
   - Consider adding a chat system
   - Implement game invitations
   - Add tournament support
   - Include game analysis features


