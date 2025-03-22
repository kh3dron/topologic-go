class GoGame {
    constructor() {
        this.canvas = document.getElementById('goBoard');
        this.ctx = this.canvas.getContext('2d');
        this.boardSize = 9;
        this.cellSize = 50;
        this.gridOffset = 25;
        this.currentPlayer = 'black';
        this.board = Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(null));
        this.passes = 0;
        this.blackStones = 0;
        this.whiteStones = 0;
        this.hoverPos = null;
        this.isTopologicMode = false;
        this.tiledView = false;
        this.tileCount = 3;
        this.spacing = 0; // Remove spacing between boards
        
        // Calculate total size needed for one board
        this.singleBoardSize = (this.boardSize - 1) * this.cellSize + (this.gridOffset * 2);
        // Calculate canvas size needed for 3x3 grid with no spacing
        const totalSize = (this.singleBoardSize * this.tileCount);
        this.canvas.width = totalSize;
        this.canvas.height = totalSize;

        // Add mode selection listeners
        document.getElementById('classicMode').addEventListener('click', () => this.setGameMode(false));
        document.getElementById('topologicMode').addEventListener('click', () => this.setGameMode(true));

        this.canvas.addEventListener('click', this.handleClick.bind(this));
        document.getElementById('passButton').addEventListener('click', this.pass.bind(this));
        document.getElementById('resetButton').addEventListener('click', this.resetGame.bind(this));

        // Add mousemove and mouseout event listeners
        this.canvas.addEventListener('mousemove', this.handleHover.bind(this));
        this.canvas.addEventListener('mouseout', () => {
            this.hoverPos = null;
            this.drawBoard();
        });

        this.drawBoard();
    }

    setGameMode(isTopologic) {
        this.isTopologicMode = isTopologic;
        document.getElementById('classicMode').classList.toggle('active', !isTopologic);
        document.getElementById('topologicMode').classList.toggle('active', isTopologic);
        this.resetGame();
    }

    // Helper function to get torus-adjusted coordinates
    getTorusCoords(row, col) {
        if (!this.isTopologicMode) return { row, col };
        return {
            row: ((row % this.boardSize) + this.boardSize) % this.boardSize,
            col: ((col % this.boardSize) + this.boardSize) % this.boardSize
        };
    }

    drawBoard() {
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.isTopologicMode) {
            // Draw background for all tiles
            for (let tileRow = 0; tileRow < this.tileCount; tileRow++) {
                for (let tileCol = 0; tileCol < this.tileCount; tileCol++) {
                    const offsetX = tileCol * (this.singleBoardSize + this.spacing);
                    const offsetY = tileRow * (this.singleBoardSize + this.spacing);
                    
                    // Draw board background
                    this.ctx.fillStyle = '#DEB887';
                    this.ctx.fillRect(
                        offsetX, 
                        offsetY, 
                        this.singleBoardSize, 
                        this.singleBoardSize
                    );
                    
                    // Draw board border
                    this.ctx.strokeStyle = '#8B4513';
                    this.ctx.strokeRect(
                        offsetX,
                        offsetY,
                        this.singleBoardSize,
                        this.singleBoardSize
                    );
                }
            }

            // Draw all boards
            for (let tileRow = 0; tileRow < this.tileCount; tileRow++) {
                for (let tileCol = 0; tileCol < this.tileCount; tileCol++) {
                    const offsetX = tileCol * (this.singleBoardSize + this.spacing);
                    const offsetY = tileRow * (this.singleBoardSize + this.spacing);
                    this.drawSingleBoard(offsetX, offsetY);
                }
            }
        } else {
            // Draw single board for classic mode
            this.ctx.fillStyle = '#DEB887';
            this.ctx.fillRect(0, 0, this.singleBoardSize, this.singleBoardSize);
            this.ctx.strokeStyle = '#8B4513';
            this.ctx.strokeRect(0, 0, this.singleBoardSize, this.singleBoardSize);
            this.drawSingleBoard(0, 0);
        }

        // Draw hover preview if valid
        if (this.hoverPos && this.isValidMove(this.hoverPos.row, this.hoverPos.col)) {
            if (this.isTopologicMode) {
                for (let tileRow = 0; tileRow < this.tileCount; tileRow++) {
                    for (let tileCol = 0; tileCol < this.tileCount; tileCol++) {
                        const offsetX = tileCol * (this.singleBoardSize + this.spacing);
                        const offsetY = tileRow * (this.singleBoardSize + this.spacing);
                        this.drawPreviewStone(this.hoverPos.row, this.hoverPos.col, this.currentPlayer, offsetX, offsetY);
                    }
                }
            } else {
                this.drawPreviewStone(this.hoverPos.row, this.hoverPos.col, this.currentPlayer, 0, 0);
            }
        }
    }

    drawSingleBoard(offsetX, offsetY) {
        // Draw the grid lines
        this.ctx.strokeStyle = 'black';
        
        // Draw vertical lines
        for (let i = 0; i < this.boardSize; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(
                this.gridOffset + i * this.cellSize + offsetX,
                this.gridOffset + offsetY
            );
            this.ctx.lineTo(
                this.gridOffset + i * this.cellSize + offsetX,
                this.gridOffset + (this.boardSize - 1) * this.cellSize + offsetY
            );
            this.ctx.stroke();
        }

        // Draw horizontal lines
        for (let i = 0; i < this.boardSize; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(
                this.gridOffset + offsetX,
                this.gridOffset + i * this.cellSize + offsetY
            );
            this.ctx.lineTo(
                this.gridOffset + (this.boardSize - 1) * this.cellSize + offsetX,
                this.gridOffset + i * this.cellSize + offsetY
            );
            this.ctx.stroke();
        }

        // Draw stones
        for (let i = 0; i < this.boardSize; i++) {
            for (let j = 0; j < this.boardSize; j++) {
                if (this.board[i][j]) {
                    this.drawStone(i, j, this.board[i][j], offsetX, offsetY);
                }
            }
        }
    }

    drawStone(row, col, color, offsetX = 0, offsetY = 0) {
        this.ctx.beginPath();
        this.ctx.arc(
            this.gridOffset + col * this.cellSize + offsetX,
            this.gridOffset + row * this.cellSize + offsetY,
            this.cellSize / 2 - 2,
            0,
            2 * Math.PI
        );
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.stroke();
    }

    handleClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const col = Math.round((x - this.gridOffset) / this.cellSize);
        const row = Math.round((y - this.gridOffset) / this.cellSize);

        if (this.isValidMove(row, col)) {
            this.makeMove(row, col);
        }
    }

    isValidMove(row, col) {
        if (this.isTopologicMode) {
            const torusCoords = this.getTorusCoords(row, col);
            return this.board[torusCoords.row][torusCoords.col] === null;
        }
        return row >= 0 && row < this.boardSize &&
               col >= 0 && col < this.boardSize &&
               this.board[row][col] === null;
    }

    makeMove(row, col) {
        if (this.isTopologicMode) {
            const torusCoords = this.getTorusCoords(row, col);
            row = torusCoords.row;
            col = torusCoords.col;
        }

        this.board[row][col] = this.currentPlayer;
        this.passes = 0;
        
        // Update stone count before capturing
        if (this.currentPlayer === 'black') {
            this.blackStones++;
        } else {
            this.whiteStones++;
        }

        // Count stones that will be captured
        const capturedBlack = this.countStonesToRemove('black');
        const capturedWhite = this.countStonesToRemove('white');
        
        this.removeDeadStones(this.getOppositeColor());
        this.removeDeadStones(this.currentPlayer);
        
        // Update counts after captures
        this.blackStones -= capturedBlack;
        this.whiteStones -= capturedWhite;
        
        this.currentPlayer = this.getOppositeColor();
        this.drawBoard();
        this.updatePlayerDisplay();
        this.updateStoneCount();
    }

    getOppositeColor() {
        return this.currentPlayer === 'black' ? 'white' : 'black';
    }

    pass() {
        this.passes++;
        if (this.passes === 2) {
            alert('Game Over!');
            this.resetGame();
            return;
        }
        this.currentPlayer = this.getOppositeColor();
        this.updatePlayerDisplay();
    }

    resetGame() {
        this.board = Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(null));
        this.currentPlayer = 'black';
        this.passes = 0;
        this.blackStones = 0;
        this.whiteStones = 0;
        this.drawBoard();
        this.updatePlayerDisplay();
        this.updateStoneCount();
    }

    updatePlayerDisplay() {
        document.getElementById('currentPlayer').textContent = `Current Player: ${this.currentPlayer.charAt(0).toUpperCase() + this.currentPlayer.slice(1)}`;
    }

    removeDeadStones(color) {
        for (let i = 0; i < this.boardSize; i++) {
            for (let j = 0; j < this.boardSize; j++) {
                if (this.board[i][j] === color && !this.hasLiberties(i, j)) {
                    this.board[i][j] = null;
                }
            }
        }
    }

    hasLiberties(row, col, checked = new Set()) {
        const key = `${row},${col}`;
        if (checked.has(key)) return false;
        checked.add(key);

        const color = this.board[row][col];
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        for (const [dx, dy] of directions) {
            let newRow = row + dx;
            let newCol = col + dy;

            if (this.isTopologicMode) {
                const torusCoords = this.getTorusCoords(newRow, newCol);
                newRow = torusCoords.row;
                newCol = torusCoords.col;
            } else if (newRow < 0 || newRow >= this.boardSize || newCol < 0 || newCol >= this.boardSize) {
                continue;
            }

            if (this.board[newRow][newCol] === null) {
                return true;
            }

            if (this.board[newRow][newCol] === color && 
                this.hasLiberties(newRow, newCol, checked)) {
                return true;
            }
        }

        return false;
    }

    countStonesToRemove(color) {
        let count = 0;
        for (let i = 0; i < this.boardSize; i++) {
            for (let j = 0; j < this.boardSize; j++) {
                if (this.board[i][j] === color && !this.hasLiberties(i, j)) {
                    count++;
                }
            }
        }
        return count;
    }

    updateStoneCount() {
        document.getElementById('stoneCount').textContent = 
            `Black: ${this.blackStones} stones | White: ${this.whiteStones} stones`;
    }

    handleHover(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Calculate which tile we're hovering over
        const tileSize = this.singleBoardSize + this.spacing;
        const tileCol = Math.floor(x / tileSize);
        const tileRow = Math.floor(y / tileSize);

        // Get position within the tile
        const localX = x - (tileCol * tileSize);
        const localY = y - (tileRow * tileSize);

        // Convert to board coordinates
        const col = Math.round((localX - this.gridOffset) / this.cellSize);
        const row = Math.round((localY - this.gridOffset) / this.cellSize);

        // Only update if within valid range
        if (col >= 0 && col < this.boardSize && row >= 0 && row < this.boardSize) {
            if (!this.hoverPos || this.hoverPos.row !== row || this.hoverPos.col !== col) {
                this.hoverPos = { row, col };
                this.drawBoard();
            }
        }
    }

    drawPreviewStone(row, col, color, offsetX = 0, offsetY = 0) {
        this.ctx.beginPath();
        this.ctx.arc(
            this.gridOffset + col * this.cellSize + offsetX,
            this.gridOffset + row * this.cellSize + offsetY,
            this.cellSize / 2 - 2,
            0,
            2 * Math.PI
        );
        this.ctx.fillStyle = color === 'black' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)';
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.stroke();
        this.ctx.strokeStyle = 'black'; // Reset stroke style for next drawing
    }}

// Start the game when the page loads
window.onload = () => new GoGame();
