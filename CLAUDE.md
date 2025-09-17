# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Topologic Games is a web application that implements chess and Go variants played on non-Euclidean surfaces (torus, sphere). The project demonstrates mathematical concepts through interactive games with unique topological properties.

## Architecture

This is a full-stack application with:

- **Backend**: Go HTTP server with PostgreSQL database
- **Frontend**: Vanilla HTML/CSS/JavaScript served via http-server
- **Deployment**: Docker Compose for local development

### Backend Structure (`/backend`)

- `main.go`: HTTP server with CORS, authentication endpoints (`/api/login`, `/api/register`, `/api/user/stats`, `/api/user/games`)
- `auth/auth.go`: JWT token management and bcrypt password hashing
- `db/db.go`: PostgreSQL connection, user management, game statistics
- Uses Go modules with dependencies: JWT, bcrypt, PostgreSQL driver, godotenv

### Frontend Structure (`/frontend`)

- `index.html`: Main landing page with game selection
- `games/`: Individual game implementations (torus-chess, spherical-chess, torus-go, etc.)
- Each game has its own `.html` and `.js` files
- `login.html`, `signup.html`, `profile.html`: Authentication pages
- Static file server via http-server on port 3000

### Database

PostgreSQL with basic user authentication:

- `users` table: id, username, password (bcrypt), created_at
- Environment variables: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET

## Development Commands

### Full Stack Development

```bash
# Start all services (frontend, backend, database)
make compose
# or
docker compose up --build

# Start only frontend
make web
# or
cd frontend && npm start

# Run without rebuild
make run
# or
docker compose up
```

### Backend Development

```bash
cd backend
go run main.go
```

### Frontend Development

```bash
cd frontend
npm start
```

## Game Implementation Pattern

Each game follows the same structure:

- HTML file with canvas for game board
- JavaScript file with game logic
- Coordinate transformation functions for topological surfaces
- Standard chess/Go rules adapted for non-Euclidean geometry

Games use mathematical transformations to handle edge wrapping and surface topology:

- Torus: Direct wraparound (edges connect)
- Sphere: 4-board rotational system with windmill pattern
- Special coordinate systems (rotation coordinates, tessellation coordinates)

## Key Technical Concepts

- **Coordinate Systems**: Games implement multiple coordinate spaces (true board, rotation board, drawn board)
- **Edge Handling**: Special overflow rules for pieces moving off standard board edges
- **Tessellation**: Visual representation shows infinite repeated patterns
- **Authentication**: JWT tokens with 24-hour expiration
- **CORS**: Backend configured for localhost:3000 frontend access

## Environment Setup

Backend requires `.env` file with:

- Database connection details
- JWT_SECRET for token signing
- Default database: PostgreSQL on port 5432

Frontend requires Node.js for http-server dependency.
