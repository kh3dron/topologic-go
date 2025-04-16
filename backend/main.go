package main

import (
	"encoding/json"
	"log"
	"net/http"

	"backend/auth"
	"backend/db"

	"github.com/joho/godotenv"
)

type HealthResponse struct {
	Status string `json:"status"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type RegisterRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token string `json:"token"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	response := HealthResponse{
		Status: "ok",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func sendError(w http.ResponseWriter, status int, message string) {
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(ErrorResponse{Error: message})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Login request received")
	if r.Method != http.MethodPost {
		log.Println("Invalid method:", r.Method)
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Println("Error decoding request body:", err)
		sendError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	log.Printf("Login attempt for user: %s", req.Username)

	user, err := db.GetUserByUsername(req.Username)
	if err != nil {
		log.Printf("Error finding user %s: %v", req.Username, err)
		sendError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	if !auth.CheckPasswordHash(req.Password, user.Password) {
		log.Printf("Invalid password for user %s", req.Username)
		sendError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	token, err := auth.GenerateToken(user.ID)
	if err != nil {
		log.Printf("Error generating token for user %s: %v", req.Username, err)
		sendError(w, http.StatusInternalServerError, "Error generating token")
		return
	}

	log.Printf("Successful login for user %s", req.Username)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{Token: token})
}

func registerHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Register request received")
	if r.Method != http.MethodPost {
		log.Println("Invalid method:", r.Method)
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Println("Error decoding request body:", err)
		sendError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	log.Printf("Registration attempt for user: %s", req.Username)

	hashedPassword, err := auth.HashPassword(req.Password)
	if err != nil {
		log.Printf("Error hashing password for user %s: %v", req.Username, err)
		sendError(w, http.StatusInternalServerError, "Error processing password")
		return
	}

	user, err := db.CreateUser(req.Username, hashedPassword)
	if err != nil {
		log.Printf("Error creating user %s: %v", req.Username, err)
		if err.Error() == "pq: duplicate key value violates unique constraint \"users_username_key\"" {
			sendError(w, http.StatusBadRequest, "Username already exists")
		} else {
			sendError(w, http.StatusInternalServerError, "Error creating user")
		}
		return
	}

	token, err := auth.GenerateToken(user.ID)
	if err != nil {
		log.Printf("Error generating token for user %s: %v", req.Username, err)
		sendError(w, http.StatusInternalServerError, "Error generating token")
		return
	}

	log.Printf("Successful registration for user %s", req.Username)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{Token: token})
}

func userStatsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, err := auth.GetUserIDFromToken(r.Header.Get("Authorization"))
	if err != nil {
		sendError(w, http.StatusUnauthorized, "Invalid token")
		return
	}

	stats, err := db.GetUserStats(userID)
	if err != nil {
		log.Printf("Error getting user stats: %v", err)
		sendError(w, http.StatusInternalServerError, "Error getting user stats")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func userGamesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, err := auth.GetUserIDFromToken(r.Header.Get("Authorization"))
	if err != nil {
		sendError(w, http.StatusUnauthorized, "Invalid token")
		return
	}

	games, err := db.GetUserGames(userID)
	if err != nil {
		log.Printf("Error getting user games: %v", err)
		sendError(w, http.StatusInternalServerError, "Error getting user games")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(games)
}

func main() {
	log.Println("Starting server...")

	if err := godotenv.Load(); err != nil {
		log.Fatal("Error loading .env file:", err)
	}
	log.Println("Environment variables loaded")

	if err := db.InitDB(); err != nil {
		log.Fatal("Error initializing database:", err)
	}
	log.Println("Database initialized successfully")

	// Apply CORS middleware to all handlers
	http.HandleFunc("/health", corsMiddleware(healthHandler))
	http.HandleFunc("/api/login", corsMiddleware(loginHandler))
	http.HandleFunc("/api/register", corsMiddleware(registerHandler))
	http.HandleFunc("/api/user/stats", corsMiddleware(userStatsHandler))
	http.HandleFunc("/api/user/games", corsMiddleware(userGamesHandler))

	log.Println("Server starting on port 3001...")
	if err := http.ListenAndServe(":3001", nil); err != nil {
		log.Fatal("Error starting server:", err)
	}
}
