package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
)

var DB *sql.DB

type User struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Password string `json:"-"` // Password is not included in JSON responses
}

type UserStatsResponse struct {
	GamesPlayed   int `json:"games_played"`
	GamesWon      int `json:"games_won"`
	GamesLost     int `json:"games_lost"`
	GamesDrawn    int `json:"games_drawn"`
	CurrentRating int `json:"current_rating"`
	HighestRating int `json:"highest_rating"`
}

type GameHistoryResponse struct {
	ID                  int       `json:"id"`
	CreatedAt           time.Time `json:"created_at"`
	Result              string    `json:"result"`
	TimeControl         int       `json:"time_control"`
	WhitePlayerUsername string    `json:"white_player_username"`
	BlackPlayerUsername string    `json:"black_player_username"`
}

func InitDB() error {
	log.Println("Initializing database connection...")

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"),
	)
	log.Printf("Connecting to database with host: %s, port: %s", os.Getenv("DB_HOST"), os.Getenv("DB_PORT"))

	var err error
	DB, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Printf("Error opening database connection: %v", err)
		return err
	}

	// Retry connection for up to 30 seconds
	maxRetries := 30
	for i := 0; i < maxRetries; i++ {
		err = DB.Ping()
		if err == nil {
			log.Println("Successfully connected to database")
			return createTables()
		}
		log.Printf("Attempt %d: Error pinging database: %v", i+1, err)
		time.Sleep(1 * time.Second)
	}

	log.Printf("Failed to connect to database after %d attempts", maxRetries)
	return fmt.Errorf("failed to connect to database after %d attempts: %v", maxRetries, err)
}

func createTables() error {
	log.Println("Creating database tables if they don't exist...")
	query := `
	CREATE TABLE IF NOT EXISTS users (
		id SERIAL PRIMARY KEY,
		username VARCHAR(255) UNIQUE NOT NULL,
		password VARCHAR(255) NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`

	_, err := DB.Exec(query)
	if err != nil {
		log.Printf("Error creating tables: %v", err)
		return err
	}
	log.Println("Database tables created successfully")
	return nil
}

func CreateUser(username, password string) (*User, error) {
	log.Printf("Creating new user: %s", username)
	query := `INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id`
	var id int
	err := DB.QueryRow(query, username, password).Scan(&id)
	if err != nil {
		log.Printf("Error creating user %s: %v", username, err)
		return nil, err
	}
	log.Printf("Successfully created user %s with ID %d", username, id)

	return &User{
		ID:       id,
		Username: username,
	}, nil
}

func GetUserByUsername(username string) (*User, error) {
	log.Printf("Fetching user: %s", username)
	query := `SELECT id, username, password FROM users WHERE username = $1`
	user := &User{}
	err := DB.QueryRow(query, username).Scan(&user.ID, &user.Username, &user.Password)
	if err != nil {
		log.Printf("Error fetching user %s: %v", username, err)
		return nil, err
	}
	log.Printf("Successfully fetched user %s", username)
	return user, nil
}

func GetUserStats(userID int) (*UserStatsResponse, error) {
	query := `
		SELECT 
			games_played,
			games_won,
			games_lost,
			games_drawn,
			rating as current_rating,
			highest_rating
		FROM user_game_stats
		WHERE user_id = $1
	`

	var stats UserStatsResponse
	err := DB.QueryRow(query, userID).Scan(
		&stats.GamesPlayed,
		&stats.GamesWon,
		&stats.GamesLost,
		&stats.GamesDrawn,
		&stats.CurrentRating,
		&stats.HighestRating,
	)

	if err != nil {
		return nil, err
	}

	return &stats, nil
}

func GetUserGames(userID int) ([]GameHistoryResponse, error) {
	query := `
		SELECT 
			g.id,
			g.created_at,
			g.result,
			g.time_control,
			w.username as white_player_username,
			b.username as black_player_username
		FROM games g
		JOIN users w ON g.white_player_id = w.id
		JOIN users b ON g.black_player_id = b.id
		WHERE (g.white_player_id = $1 OR g.black_player_id = $1)
		AND g.status = 'completed'
		ORDER BY g.created_at DESC
		LIMIT 50
	`

	rows, err := DB.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var games []GameHistoryResponse
	for rows.Next() {
		var game GameHistoryResponse
		err := rows.Scan(
			&game.ID,
			&game.CreatedAt,
			&game.Result,
			&game.TimeControl,
			&game.WhitePlayerUsername,
			&game.BlackPlayerUsername,
		)
		if err != nil {
			return nil, err
		}
		games = append(games, game)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return games, nil
}
