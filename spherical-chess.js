class ChessGame {
    constructor() {
        this.canvas = document.getElementById("chessBoard");
        this.ctx = this.canvas.getContext("2d");
        this.boardSize = 8; // Chess is always 8x8
        this.cellSize = 60; // Make cells a bit bigger
        this.gridOffset = 0; // Remove the grid offset as it's causing issues
        this.currentPlayer = "white";
        this.board = this.initializeBoard();
        this.selectedPiece = null;
        this.hoverPos = null;
        this.possibleMoves = [];
        this.isTopologicMode = true;
        this.tiledView = false;
        this.tileCount = 3;
        this.spacing = 0;
        this.pieceImages = {}; // Store loaded piece images

        // Load all piece images
        this.loadPieceImages();

        // Calculate total size needed for one board
        this.singleBoardSize = this.boardSize * this.cellSize;
        // Calculate canvas size needed for 3x3 grid with no spacing
        const totalSize = this.singleBoardSize * this.tileCount;
        this.canvas.width = totalSize;
        this.canvas.height = totalSize;

        // Make canvas fill the screen
        const updateCanvasSize = () => {
            const availableWidth = window.innerWidth;

            this.cellSize = Math.floor(
                (availableWidth / this.tileCount) / this.boardSize,
            );
            this.gridOffset = this.cellSize;

            this.singleBoardSize = this.boardSize * this.cellSize;
            const totalSize = this.singleBoardSize * this.tileCount;

            this.canvas.width = totalSize;
            this.canvas.height = totalSize;

            this.canvas.style.position = "absolute";
            this.canvas.style.left = "0";
            this.canvas.style.top = "0";
            this.canvas.style.width = `${totalSize}px`;
            this.canvas.style.height = `${totalSize}px`;

            if (this.renderer) {
                this.renderer.setSize(totalSize, totalSize);
                this.camera.aspect = 1;
                this.camera.updateProjectionMatrix();
            }

            // Draw board without pieces initially
            this.drawBoard();
        };

        // Initial size
        updateCanvasSize();

        // Update size when window is resized
        window.addEventListener("resize", updateCanvasSize);

        // Add pan and zoom tracking
        this.viewportX = 0;
        this.viewportY = 0;
        this.zoomLevel = 1;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.hasMoved = false;

        // Add event listeners for pan and zoom
        this.canvas.addEventListener("mousedown", this.startDrag.bind(this));
        this.canvas.addEventListener(
            "mousemove",
            this.handleDragAndHover.bind(this),
        );
        this.canvas.addEventListener("mouseup", this.stopDrag.bind(this));
        this.canvas.addEventListener("wheel", this.handleZoom.bind(this));

        // Add click and hover event listeners
        this.canvas.addEventListener("click", this.handleClick.bind(this));
        this.canvas.addEventListener("mousemove", this.handleHover.bind(this));
        this.canvas.addEventListener("mouseout", () => {
            this.hoverPos = null;
            this.drawBoard();
        });

        // Add reset button listener
        document.getElementById("resetButton").addEventListener(
            "click",
            this.resetGame.bind(this),
        );

        // Add Three.js setup
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = null;
        this.mouse = null;
        this.hoverMesh = null;

        // Add view selection listeners
        document.getElementById("tessellatedView").addEventListener(
            "click",
            () => this.setView(false),
        );

        // Add new property for board edge visibility
        this.showBoardEdges = false;

        // Add event listener for the checkbox
        document.getElementById("showBoardEdges").addEventListener(
            "change",
            (e) => {
                this.showBoardEdges = e.target.checked;
                this.drawBoard();
            },
        );

        // Add popup elements
        this.infoPopup = document.getElementById("infoPopup");
        this.overlay = document.getElementById("overlay");
        this.startGameBtn = document.getElementById("startGameBtn");
        this.infoIcon = document.getElementById("infoIcon");
        this.gameOverPopup = document.getElementById("gameOverPopup");
        this.winnerText = document.getElementById("winnerText");
        this.newGameBtn = document.getElementById("newGameBtn");

        // Show popup on page load
        this.showPopup();

        // Add popup event listeners
        this.startGameBtn.addEventListener("click", () => this.hidePopup());
        this.infoIcon.addEventListener("click", () => this.showPopup());
        this.overlay.addEventListener("click", () => this.hidePopup());

        // Add help button event listener
        document.getElementById("helpButton").addEventListener(
            "click",
            () => this.showPopup(),
        );

        // Add new game button listener
        this.newGameBtn.addEventListener("click", () => {
            this.hideGameOverPopup();
            this.resetGame();
        });
    }

    loadPieceImages() {
        const colors = ["w", "b"];
        const pieces = ["b", "k", "n", "p", "q", "r"];
        let loadedImages = 0;
        const totalImages = colors.length * pieces.length;

        colors.forEach((color) => {
            pieces.forEach((piece) => {
                const img = new Image();
                img.onload = () => {
                    loadedImages++;
                    if (loadedImages === totalImages) {
                        // All images loaded, draw the board
                        this.drawBoard();
                    }
                };
                img.src = `chess_icons/${color}_${piece}.webp`;
                this.pieceImages[`${color}_${piece}`] = img;
            });
        });
    }

    drawPiece(piece, x, y) {
        const size = this.cellSize;
        const padding = size * 0.1; // 10% padding around the piece

        // Get the image key for this piece
        const pieceTypeMap = {
            "pawn": "p",
            "knight": "n",
            "bishop": "b",
            "rook": "r",
            "queen": "q",
            "king": "k",
        };
        const imageKey = `${piece.color.charAt(0)}_${pieceTypeMap[piece.type]}`;
        const img = this.pieceImages[imageKey];

        if (img) {
            this.ctx.drawImage(
                img,
                x + padding,
                y + padding,
                size - (padding * 2),
                size - (padding * 2),
            );
        }
    }

    handleClick(event) {
        if (this.isDragging || this.hasMoved) return;

        const rect = this.canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;

        // Convert screen coordinates to world coordinates
        const worldX = (screenX - this.viewportX) / this.zoomLevel;
        const worldY = (screenY - this.viewportY) / this.zoomLevel;

        // Calculate which board and position we're clicking
        const tileSize = this.singleBoardSize;
        const tileCol = Math.floor(worldX / tileSize);
        const tileRow = Math.floor(worldY / tileSize);

        // Get position within the board
        const localX = worldX - (tileCol * tileSize);
        const localY = worldY - (tileRow * tileSize);

        // Convert to board coordinates
        const col = Math.floor(localX / this.cellSize);
        const row = Math.floor(localY / this.cellSize);

        console.log("Coordinates, Real board:", { row, col });

        // Calculate actual board position including tile offset
        const actualRow = row;
        const actualCol = col + (tileCol * this.boardSize);
        console.log("Coordinates, Tesselation board:", { actualRow, actualCol });

        // Normalize the position
        const [normRow, normCol] = this.normalizePosition(actualRow, actualCol);

        // Handle piece selection and movement
        if (normRow >= 0 && normRow < 8 && normCol >= 0 && normCol < 8) {
            const piece = this.board[normRow][normCol];

            if (piece && piece.color === this.currentPlayer) {
                this.selectedPiece = { row: normRow, col: normCol };
                this.possibleMoves = this.getPossibleMoves(normRow, normCol);
                this.drawBoard();
            } else if (this.selectedPiece) {
                // Check if the move is valid
                const isValidMove = this.possibleMoves.some(
                    ([r, c]) => r === normRow && c === normCol,
                );

                if (isValidMove) {
                    // Move piece
                    this.board[normRow][normCol] = this.board[this.selectedPiece.row][
                        this.selectedPiece.col
                    ];
                    this.board[this.selectedPiece.row][this.selectedPiece.col] =
                        null;

                    // Check if a king was captured
                    const capturedPiece = this.board[normRow][normCol];
                    if (capturedPiece && capturedPiece.type === "king") {
                        this.handleGameOver(this.currentPlayer);
                        return;
                    }

                    this.currentPlayer = this.currentPlayer === "white"
                        ? "black"
                        : "white";
                    this.selectedPiece = null;
                    this.possibleMoves = [];
                    this.updatePlayerDisplay();
                    this.drawBoard();
                } else {
                    // Deselect piece if clicking invalid square
                    this.selectedPiece = null;
                    this.possibleMoves = [];
                    this.drawBoard();
                }
            }
        }
    }

    handleHover(event) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;

        // Convert screen coordinates to world coordinates
        const worldX = (screenX - this.viewportX) / this.zoomLevel;
        const worldY = (screenY - this.viewportY) / this.zoomLevel;

        // Calculate which board and position we're hovering over
        const tileSize = this.singleBoardSize;
        const tileCol = Math.floor(worldX / tileSize);
        const tileRow = Math.floor(worldY / tileSize);

        // Get position within the board
        const localX = worldX - (tileCol * tileSize);
        const localY = worldY - (tileRow * tileSize);

        // Convert to board coordinates
        const col = Math.floor(localX / this.cellSize);
        // Calculate row without flipping - we'll handle reflection in normalizePosition
        const row = Math.floor(localY / this.cellSize);

        // Calculate actual board position including tile offset
        const actualRow = row + (tileRow * this.boardSize);
        const actualCol = col + (tileCol * this.boardSize);

        // Normalize the position
        const [normRow, normCol] = this.normalizePosition(actualRow, actualCol);

        // Only update if within valid range
        if (normCol >= 0 && normCol < 8 && normRow >= 0 && normRow < 8) {
            if (
                !this.hoverPos ||
                this.hoverPos.row !== actualRow ||
                this.hoverPos.col !== actualCol ||
                this.hoverPos.tileRow !== tileRow ||
                this.hoverPos.tileCol !== tileCol
            ) {
                this.hoverPos = { row: actualRow, col: actualCol, tileRow, tileCol };
                this.drawBoard();
            }
        } else {
            // Clear hover when outside valid board positions
            if (this.hoverPos) {
                this.hoverPos = null;
                this.drawBoard();
            }
        }
    }

    handleDragAndHover(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        if (this.isDragging) {
            // Handle panning
            const deltaX = event.clientX - this.lastMouseX;
            const deltaY = event.clientY - this.lastMouseY;

            if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
                this.hasMoved = true;
                if (this.hoverPos) {
                    this.hoverPos = null;
                }
            }

            this.viewportX += deltaX;
            this.viewportY += deltaY;

            this.lastMouseX = event.clientX;
            this.lastMouseY = event.clientY;

            this.drawBoard();
        } else {
            // Convert screen coordinates to world coordinates
            const worldX = (x - this.viewportX) / this.zoomLevel;
            const worldY = (y - this.viewportY) / this.zoomLevel;

            // Calculate which board and position we're hovering over
            const tileSize = this.singleBoardSize;
            const tileCol = Math.floor(worldX / tileSize);
            const tileRow = Math.floor(worldY / tileSize);

            // Get position within the board
            const localX = worldX - (tileCol * tileSize);
            const localY = worldY - (tileRow * tileSize);

            // Convert to board coordinates - adjust for grid offset
            const col = Math.floor((localX - this.gridOffset) / this.cellSize) +
                1;
            const row = Math.floor((localY - this.gridOffset) / this.cellSize) +
                1;

            // Clear hover when outside valid board positions
            if (
                col < 0 || col >= this.boardSize || row < 0 ||
                row >= this.boardSize
            ) {
                if (this.hoverPos) {
                    this.hoverPos = null;
                    this.drawBoard();
                }
            } else {
                // Only update and redraw if the hover position has changed
                if (
                    !this.hoverPos ||
                    this.hoverPos.row !== row ||
                    this.hoverPos.col !== col ||
                    this.hoverPos.tileRow !== tileRow ||
                    this.hoverPos.tileCol !== tileCol
                ) {
                    this.hoverPos = { row, col, tileRow, tileCol };
                    this.drawBoard();
                }
            }
        }
    }

    startDrag(event) {
        if (event.button === 0) { // Left mouse button
            this.isDragging = true;
            this.hasMoved = false;
            this.lastMouseX = event.clientX;
            this.lastMouseY = event.clientY;
        }
    }

    stopDrag() {
        this.isDragging = false;

        // If we moved, wait a bit before resetting hasMoved to prevent click
        if (this.hasMoved) {
            setTimeout(() => {
                this.hasMoved = false;
                this.drawBoard();
            }, 100); // Short delay to prevent click from registering
        } else {
            this.hasMoved = false;
            this.drawBoard();
        }
    }

    handleZoom(event) {
        event.preventDefault();

        const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
        const oldZoom = this.zoomLevel;
        this.zoomLevel *= zoomFactor;

        // Limit zoom levels
        this.zoomLevel = Math.max(0.5, Math.min(5, this.zoomLevel));

        // Adjust viewport to zoom toward mouse position
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        this.viewportX = mouseX -
            (mouseX - this.viewportX) * (this.zoomLevel / oldZoom);
        this.viewportY = mouseY -
            (mouseY - this.viewportY) * (this.zoomLevel / oldZoom);

        this.drawBoard();
    }

    initializeBoard() {
        const board = Array(8).fill().map(() => Array(8).fill(null));

        for (let i = 0; i < 8; i++) {
            board[6][i] = { type: "pawn", color: "black" };
            board[1][i] = { type: "pawn", color: "white" };
        }

        const pieces = [
            "rook",
            "knight",
            "bishop",
            "queen",
            "king",
            "bishop",
            "knight",
            "rook",
        ];
        for (let i = 0; i < 8; i++) {
            board[7][i] = { type: pieces[i], color: "black" };
            board[0][i] = { type: pieces[i], color: "white" };
        }

        return board;
    }

    drawBoard() {
        // Clear the entire canvas
        this.ctx.fillStyle = "#f0f0f0";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);


        // Calculate visible area
        const visibleLeft = -this.viewportX / this.zoomLevel;
        const visibleTop = -this.viewportY / this.zoomLevel;
        const visibleRight = (this.canvas.width / this.zoomLevel) -
            this.viewportX / this.zoomLevel;
        const visibleBottom = (this.canvas.height / this.zoomLevel) -
            this.viewportY / this.zoomLevel;

        // Calculate range of tiles to draw
        const startTileCol = Math.floor(visibleLeft / this.singleBoardSize);
        const endTileCol = Math.ceil(visibleRight / this.singleBoardSize);
        const startTileRow = Math.floor(visibleTop / this.singleBoardSize);
        const endTileRow = Math.ceil(visibleBottom / this.singleBoardSize);

        // Apply zoom and pan transformation
        this.ctx.save();
        this.ctx.translate(this.viewportX, this.viewportY);
        this.ctx.scale(this.zoomLevel, this.zoomLevel);

        // Draw board backgrounds first
        for (let tileRow = startTileRow; tileRow <= endTileRow; tileRow++) {
            for (let tileCol = startTileCol; tileCol <= endTileCol; tileCol++) {
                const offsetX = tileCol * this.singleBoardSize;
                const offsetY = tileRow * this.singleBoardSize;

                // Draw alternating squares for each board
                for (let i = 0; i < this.boardSize; i++) {
                    for (let j = 0; j < this.boardSize; j++) {
                        const isLightSquare = (i + j) % 2 === 0;
                        this.ctx.fillStyle = isLightSquare
                            ? "#DEB887"
                            : "#B8860B";
                        this.ctx.fillRect(
                            offsetX + j * this.cellSize,
                            offsetY + i * this.cellSize,
                            this.cellSize,
                            this.cellSize,
                        );
                    }
                }
            }
        }

        // Draw continuous grid lines
        this.ctx.strokeStyle = "black";
        this.ctx.lineWidth = 2;

        // Calculate the total visible area in board coordinates
        const totalStartX = startTileCol * this.singleBoardSize;
        const totalEndX = (endTileCol + 1) * this.singleBoardSize;
        const totalStartY = startTileRow * this.singleBoardSize;
        const totalEndY = (endTileRow + 1) * this.singleBoardSize;

        // Draw vertical lines
        for (let tileCol = startTileCol; tileCol <= endTileCol + 1; tileCol++) {
            for (let i = 0; i <= this.boardSize; i++) {
                const x = tileCol * this.singleBoardSize + i * this.cellSize;
                if (x >= totalStartX && x <= totalEndX) {
                    // Draw board edge (red line) if this is the last line of a board and edges are enabled
                    if (this.showBoardEdges && i === this.boardSize) {
                        this.ctx.strokeStyle = "#FF0000";
                        this.ctx.lineWidth = 4;
                        this.ctx.beginPath();
                        this.ctx.moveTo(x, totalStartY);
                        this.ctx.lineTo(x, totalEndY);
                        this.ctx.stroke();
                        this.ctx.strokeStyle = "black";
                        this.ctx.lineWidth = 2;
                    }

                    // Draw regular grid line
                    this.ctx.beginPath();
                    if (this.showBoardEdges) {
                        // Draw separate segments for each board when edges are shown
                        for (
                            let tileRow = startTileRow;
                            tileRow <= endTileRow;
                            tileRow++
                        ) {
                            const startY = tileRow * this.singleBoardSize;
                            const endY = startY + this.singleBoardSize;
                            this.ctx.moveTo(x, startY);
                            this.ctx.lineTo(x, endY);
                        }
                    } else {
                        // Draw continuous lines when edges are hidden
                        this.ctx.moveTo(x, totalStartY);
                        this.ctx.lineTo(x, totalEndY);
                    }
                    this.ctx.stroke();
                }
            }
        }

        // Draw horizontal lines
        for (let tileRow = startTileRow; tileRow <= endTileRow + 1; tileRow++) {
            for (let i = 0; i <= this.boardSize; i++) {
                const y = tileRow * this.singleBoardSize + i * this.cellSize;
                if (y >= totalStartY && y <= totalEndY) {
                    // Draw board edge (red line) if this is the last line of a board and edges are enabled
                    if (this.showBoardEdges && i === this.boardSize) {
                        this.ctx.strokeStyle = "#FF0000";
                        this.ctx.lineWidth = 4;
                        this.ctx.beginPath();
                        this.ctx.moveTo(totalStartX, y);
                        this.ctx.lineTo(totalEndX, y);
                        this.ctx.stroke();
                        this.ctx.strokeStyle = "black";
                        this.ctx.lineWidth = 2;
                    }

                    // Draw regular grid line
                    this.ctx.beginPath();
                    if (this.showBoardEdges) {
                        // Draw separate segments for each board when edges are shown
                        for (
                            let tileCol = startTileCol;
                            tileCol <= endTileCol;
                            tileCol++
                        ) {
                            const startX = tileCol * this.singleBoardSize;
                            const endX = startX + this.singleBoardSize;
                            this.ctx.moveTo(startX, y);
                            this.ctx.lineTo(endX, y);
                        }
                    } else {
                        // Draw continuous lines when edges are hidden
                        this.ctx.moveTo(totalStartX, y);
                        this.ctx.lineTo(totalEndX, y);
                    }
                    this.ctx.stroke();
                }
            }
        }

        // Draw pieces and highlights on all visible boards
        for (let tileRow = startTileRow; tileRow <= endTileRow; tileRow++) {
            for (let tileCol = startTileCol; tileCol <= endTileCol; tileCol++) {
                const offsetX = tileCol * this.singleBoardSize;
                const offsetY = tileRow * this.singleBoardSize;
                this.drawSingleBoard(offsetX, offsetY);
            }
        }

        this.ctx.restore();
    }

    drawSingleBoard(offsetX, offsetY) {
        // Calculate the tile row and column from the offset
        const tileRow = Math.floor(offsetY / this.singleBoardSize);
        const tileCol = Math.floor(offsetX / this.singleBoardSize);

        // Draw grid lines
        this.ctx.strokeStyle = "black";
        this.ctx.lineWidth = 1;

        // Draw vertical lines
        for (let i = 0; i <= this.boardSize; i++) {
            const x = offsetX + i * this.cellSize;
            this.ctx.beginPath();
            this.ctx.moveTo(x, offsetY);
            this.ctx.lineTo(x, offsetY + this.singleBoardSize);
            this.ctx.stroke();
        }

        // Draw horizontal lines
        for (let i = 0; i <= this.boardSize; i++) {
            const y = offsetY + i * this.cellSize;
            this.ctx.beginPath();
            this.ctx.moveTo(offsetX, y);
            this.ctx.lineTo(offsetX + this.singleBoardSize, y);
            this.ctx.stroke();
        }

        // Helper function to get the piece at a position, handling reflection
        const getPieceAtPosition = (row, col) => {
            // Handle x-axis wrapping
            col = ((col % 8) + 8) % 8;
            
            // Handle y-axis wrapping and reflection
            let adjustedRow = ((row % 16) + 16) % 16;
            if (adjustedRow >= 8) {
                adjustedRow = 15 - adjustedRow; // Reflect back to 0-7
            }
            
            return this.board[adjustedRow][col];
        };

        // Draw pieces (except selected piece)
        for (let i = 0; i < this.boardSize; i++) {
            for (let j = 0; j < this.boardSize; j++) {
                // Calculate the actual board position including tile offset
                const actualRow = i + (tileRow * this.boardSize);
                const actualCol = j + (tileCol * this.boardSize);
                
                const piece = getPieceAtPosition(actualRow, actualCol);
                
                // Skip drawing the selected piece here - we'll draw it last
                if (piece && (!this.selectedPiece ||
                    this.selectedPiece.row !== actualRow ||
                    this.selectedPiece.col !== actualCol)) {
                    this.drawPiece(
                        piece,
                        offsetX + j * this.cellSize,
                        offsetY + i * this.cellSize
                    );
                }
            }
        }

        // Draw possible moves if a piece is selected
        if (this.selectedPiece && this.possibleMoves.length > 0) {
            // Draw possible moves
            this.possibleMoves.forEach(([row, col]) => {
                // Convert the move coordinates to local board coordinates
                const localRow = row % this.boardSize;
                const localCol = col % this.boardSize;
                this.drawPossibleMove(localRow, localCol, offsetX, offsetY);
            });
        }

        // Draw hover highlight if exists
        if (this.hoverPos && !this.isDragging && !this.hasMoved) {
            const localRow = this.hoverPos.row % this.boardSize;
            const localCol = this.hoverPos.col % this.boardSize;
            this.drawHoverHighlight(
                localRow,
                localCol,
                offsetX,
                offsetY
            );
        }

        // Draw selected piece last so it's always on top
        if (this.selectedPiece) {
            const localRow = this.selectedPiece.row % this.boardSize;
            const localCol = this.selectedPiece.col % this.boardSize;
            
            // Draw the highlight first
            this.drawSelectedPiece(offsetX, offsetY, localRow);

            // Then draw the piece on top
            const piece = getPieceAtPosition(this.selectedPiece.row, this.selectedPiece.col);
            if (piece) {
                this.drawPiece(
                    piece,
                    offsetX + localCol * this.cellSize,
                    offsetY + localRow * this.cellSize
                );
            }
        }
    }

    drawRotationSpace(offsetX, offsetY) {
        this.drawSingleBoard(offsetX, offsetY);
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        this.ctx.fillRect(offsetX, offsetY, this.singleBoardSize, this.singleBoardSize);
    }

    drawSelectedPiece(offsetX, offsetY, displayRow) {
        const x = offsetX + this.selectedPiece.col * this.cellSize;
        const y = offsetY + displayRow * this.cellSize;

        // Draw a more prominent highlight for the selected piece
        this.ctx.fillStyle = "rgba(0, 255, 0, 0.4)";
        this.ctx.fillRect(x, y, this.cellSize, this.cellSize);

        // Add a thicker border around the selected piece
        this.ctx.strokeStyle = "rgba(0, 200, 0, 1)";
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, this.cellSize, this.cellSize);
    }

    updateLightPosition() {
        const distance = 30;
        const lightPos = new THREE.Vector3(20, 20, distance);
        lightPos.applyMatrix4(this.camera.matrixWorld);

        this.pointLight.position.copy(lightPos);
        this.lightSphere.position.copy(lightPos);
    }

    showPopup() {
        this.infoPopup.style.display = "block";
        this.overlay.style.display = "block";
        this.startGameBtn.style.display = this.hasStartedGame
            ? "none"
            : "block";
    }

    hidePopup() {
        this.infoPopup.style.display = "none";
        this.overlay.style.display = "none";
        this.hasStartedGame = true;
    }

    hideGameOverPopup() {
        this.gameOverPopup.style.display = "none";
        this.overlay.style.display = "none";
    }

    resetGame() {
        this.board = this.initializeBoard();
        this.currentPlayer = "white";
        this.selectedPiece = null;
        this.possibleMoves = [];
        this.updatePlayerDisplay();
        this.drawBoard();

        // Re-enable piece movement
        this.canvas.style.pointerEvents = "auto";

        // Hide game over popup if it's showing
        this.hideGameOverPopup();
    }

    updatePlayerDisplay() {
        const playerText = `Current Player: ${
            this.currentPlayer.charAt(0).toUpperCase() +
            this.currentPlayer.slice(1)
        }`;
        document.getElementById("currentPlayer").textContent = playerText;

        // Update turn indicator
        const turnIcon = document.getElementById("turnIcon");
        turnIcon.className = `turn-icon ${this.currentPlayer}`;
    }

    normalizePosition(row, col) {
        // Handle x-axis wrapping with modulo 8
        let newCol = ((col % 8) + 8) % 8;
        
        // Handle y-axis wrapping and reflection
        let newRow = row;
        
        // First normalize to the 0-15 range
        newRow = ((row % 16) + 16) % 16;
        
        // If in the reflection zone (8-15), reflect back to 0-7
        if (newRow >= 8) {
            newRow = 15 - newRow; // This reflects 8->7, 9->6, 10->5, etc.
        }
        
        return [newRow, newCol];
    }

    getPossibleMoves(row, col) {
        const piece = this.board[row][col];
        if (!piece) return [];

        // Helper function to check if a position is valid and get the piece there
        const getPieceAt = (row, col) => {
            const [normalizedRow, normalizedCol] = this.normalizePosition(row, col);
            return this.board[normalizedRow][normalizedCol];
        };

        const moves = [];
        const directions = {
            pawn: piece.color === "white" ? 1 : -1,
            rook: [[0, 1], [1, 0], [0, -1], [-1, 0]],
            knight: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
            bishop: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
            queen: [
                [0, 1], [1, 0], [0, -1], [-1, 0],
                [1, 1], [1, -1], [-1, 1], [-1, -1],
            ],
            king: [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
        };

        switch (piece.type) {
            case "pawn":
                // Forward move
                const forwardRow = row + directions.pawn;
                const [normForwardRow, normCol] = this.normalizePosition(
                    forwardRow,
                    col,
                );
                if (!getPieceAt(forwardRow, col)) {
                    moves.push([normForwardRow, normCol]);
                    // First move can be 2 squares
                    if (
                        (piece.color === "white" && row === 1) ||
                        (piece.color === "black" && row === 6)
                    ) {
                        const doubleRow = row + (2 * directions.pawn);
                        const [normDoubleRow, normDoubleCol] =
                            this.normalizePosition(doubleRow, col);
                        if (!getPieceAt(doubleRow, col)) {
                            moves.push([normDoubleRow, normDoubleCol]);
                        }
                    }
                }
                // Diagonal captures
                [-1, 1].forEach((dc) => {
                    const captureRow = row + directions.pawn;
                    const captureCol = col + dc;
                    const [normCaptureRow, normCaptureCol] = this.normalizePosition(
                        captureRow,
                        captureCol,
                    );
                    const targetPiece = getPieceAt(captureRow, captureCol);
                    if (targetPiece && targetPiece.color !== piece.color) {
                        moves.push([normCaptureRow, normCaptureCol]);
                    }
                });
                break;

            case "rook":
            case "bishop":
            case "queen":
                directions[piece.type].forEach(([dr, dc]) => {
                    let currentRow = row + dr;
                    let currentCol = col + dc;
                    // Allow moving up to 8 squares in any direction to handle wrapping
                    for (let steps = 0; steps < 8; steps++) {
                        const [normRow, normCol] = this.normalizePosition(
                            currentRow,
                            currentCol,
                        );
                        const targetPiece = getPieceAt(currentRow, currentCol);

                        if (!targetPiece) {
                            moves.push([normRow, normCol]);
                        } else {
                            if (targetPiece.color !== piece.color) {
                                moves.push([normRow, normCol]);
                            }
                            break; // Stop in this direction after hitting a piece
                        }
                        currentRow += dr;
                        currentCol += dc;
                    }
                });
                break;

            case "knight":
                directions.knight.forEach(([dr, dc]) => {
                    const newRow = row + dr;
                    const newCol = col + dc;
                    const [normRow, normCol] = this.normalizePosition(
                        newRow,
                        newCol,
                    );
                    const targetPiece = getPieceAt(newRow, newCol);
                    if (!targetPiece || targetPiece.color !== piece.color) {
                        moves.push([normRow, normCol]);
                    }
                });
                break;

            case "king":
                directions.king.forEach(([dr, dc]) => {
                    const newRow = row + dr;
                    const newCol = col + dc;
                    const [normRow, normCol] = this.normalizePosition(
                        newRow,
                        newCol,
                    );
                    const targetPiece = getPieceAt(newRow, newCol);
                    if (!targetPiece || targetPiece.color !== piece.color) {
                        moves.push([normRow, normCol]);
                    }
                });
                break;
        }

        return moves;
    }

    drawPossibleMove(row, col, offsetX, offsetY) {
        const centerX = offsetX + col * this.cellSize + this.cellSize / 2;
        const centerY = offsetY + row * this.cellSize + this.cellSize / 2;
        const radius = this.cellSize * 0.2;

        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);

        // Check if this move will capture a piece
        const targetPiece = this.board[row][col];
        if (targetPiece) {
            // This is a capture move - use red
            this.ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
            this.ctx.fill();
            this.ctx.strokeStyle = "rgba(200, 0, 0, 0.8)";
        } else {
            // This is a regular move - use grey
            this.ctx.fillStyle = "rgba(128, 128, 128, 0.5)";
            this.ctx.fill();
            this.ctx.strokeStyle = "rgba(100, 100, 100, 0.8)";
        }

        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    drawHoverHighlight(row, col, offsetX, offsetY) {
        this.ctx.fillStyle = "rgba(255, 255, 0, 0.3)";
        this.ctx.fillRect(
            offsetX + col * this.cellSize,
            offsetY + row * this.cellSize,
            this.cellSize,
            this.cellSize,
        );
    }

    handleGameOver(winner) {
        // Show game over popup
        this.gameOverPopup.style.display = "block";
        this.overlay.style.display = "block";

        // Update winner text
        const winnerText = winner.charAt(0).toUpperCase() + winner.slice(1);
        this.winnerText.textContent = `${winnerText} wins!`;

        // Disable piece movement
        this.canvas.style.pointerEvents = "none";
    }
}

// Start the game when the page loads
window.onload = () => new ChessGame();
