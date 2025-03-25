class ChessGame {
    constructor() {
        this.canvas = document.getElementById("chessBoard");
        this.ctx = this.canvas.getContext("2d");
        this.boardSize = 8; // Chess is always 8x8
        this.cellSize = 50; // Match Go game's initial cell size
        this.gridOffset = 25; // Match Go game's grid offset
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
        this.coordinateDisplay = null; // Element to display coordinates

        // Load all piece images
        this.loadPieceImages();

        // Calculate total size needed for one board
        this.singleBoardSize = (this.boardSize - 1) * this.cellSize + this.gridOffset;
        // Calculate canvas size needed for 3x3 grid with no spacing
        const totalSize = this.singleBoardSize * this.tileCount;
        this.canvas.width = totalSize;
        this.canvas.height = totalSize;

        // Make canvas fill the screen
        const updateCanvasSize = () => {
            const availableWidth = window.innerWidth;

            this.cellSize = Math.floor(
                (availableWidth / this.tileCount) / (this.boardSize - 1),
            );
            this.gridOffset = this.cellSize;

            // Calculate board dimensions with only one gridOffset
            this.singleBoardSize = (this.boardSize - 1) * this.cellSize + this.gridOffset;
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

        // Create coordinate display element
        this.createCoordinateDisplay();

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

    // places a piece icon on the screen at the given coordinates
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

        // Calculate actual board position including tile offset (tessellation coordinates)
        const actualRow = row + (tileRow * this.boardSize);
        const actualCol = col + (tileCol * this.boardSize);

        // Normalize the position to get real board coordinates
        const [normRow, normCol] = this.normalizePosition(actualRow, actualCol);

        // Calculate if the position is in the reflection zone
        const isReflected = this.isPositionReflected(actualRow, actualCol);

        // Calculate rotation board coordinates
        let rotRow = actualRow % 16;
        if (rotRow < 0) rotRow += 16;
        let rotCol = actualCol % 8;
        if (rotCol < 0) rotCol += 8;

        // Update coordinate display
        this.updateCoordinateDisplay({
            real: { row: normRow, col: normCol },
            rotation: { row: rotRow, col: rotCol },
            tessellation: { row: actualRow, col: actualCol },
            isReflected,
        });

        // Handle piece selection and movement
        if (normRow >= 0 && normRow < 8 && normCol >= 0 && normCol < 8) {
            const piece = this.board[normRow][normCol];

            if (piece && piece.color === this.currentPlayer) {
                this.selectedPiece = {
                    row: normRow,
                    col: normCol,
                    tessRow: actualRow,
                    tessCol: actualCol,
                    isReflected,
                };
                this.possibleMoves = this.getPossibleMoves(
                    normRow,
                    normCol,
                    isReflected,
                );
                this.drawBoard();
            } else if (this.selectedPiece) {
                // Check if the move is valid
                const isValidMove = this.possibleMoves.some(
                    ([r, c]) => r === normRow && c === normCol,
                );

                if (isValidMove) {
                    // Get the piece that's moving
                    const movingPiece =
                        this.board[this.selectedPiece.row][
                            this.selectedPiece.col
                        ];

                    // Check if this is a pawn and if it's crossing a reflection boundary
                    if (movingPiece.type === "pawn") {
                        const wasReflected = this.selectedPiece.isReflected;
                        const isNowReflected = this.isPositionReflected(
                            actualRow,
                            actualCol,
                        );

                        // If crossing reflection boundary, update pawn direction
                        if (wasReflected !== isNowReflected) {
                            movingPiece.direction *= -1;
                        }

                        // Check for promotion (white pawns promote at row 7, black at row 0)
                        if (
                            (movingPiece.color === "white" && normRow === 7) ||
                            (movingPiece.color === "black" && normRow === 0)
                        ) {
                            this.promotePawn(normRow, normCol, movingPiece);
                            return; // Return early, the promotion dialog will handle the rest
                        }
                    }

                    // Move piece
                    this.board[normRow][normCol] = movingPiece;
                    this.board[this.selectedPiece.row][this.selectedPiece.col] =
                        null;

                    // Check if a king was captured
                    if (
                        this.isKingCaptured(
                            this.currentPlayer === "white" ? "black" : "white",
                        )
                    ) {
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
                this.hoverPos = {
                    row: actualRow,
                    col: actualCol,
                    tileRow,
                    tileCol,
                };
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

            // Convert to board coordinates
            const col = Math.floor(localX / this.cellSize);
            const row = Math.floor(localY / this.cellSize);

            // Calculate actual board position including tile offset
            const actualRow = row + (tileRow * this.boardSize);
            const actualCol = col + (tileCol * this.boardSize);

            // Normalize the position
            const [normRow, normCol] = this.normalizePosition(actualRow, actualCol);

            // Only update if within valid range
            if (normCol >= 0 && normCol < 8 && normRow >= 0 && normRow < 8) {
                if (!this.hoverPos || 
                    this.hoverPos.row !== actualRow || 
                    this.hoverPos.col !== actualCol ||
                    this.hoverPos.tileRow !== tileRow ||
                    this.hoverPos.tileCol !== tileCol) {
                    this.hoverPos = { 
                        row: actualRow, 
                        col: actualCol, 
                        tileRow, 
                        tileCol 
                    };
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
            board[6][i] = { type: "pawn", color: "black", direction: 1 }; // Black pawns move down
            board[1][i] = { type: "pawn", color: "white", direction: -1 }; // White pawns move up
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
        const visibleRight = (this.canvas.width / this.zoomLevel) - this.viewportX / this.zoomLevel;
        const visibleBottom = (this.canvas.height / this.zoomLevel) - this.viewportY / this.zoomLevel;

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
                        // Apply torus board coloring pattern
                        const tessRow = i + (tileRow * this.boardSize);
                        const tessCol = j + (tileCol * this.boardSize);
                        const isLightSquare = this.isLightSquare(tessRow, tessCol);

                        this.ctx.fillStyle = isLightSquare ? "#DEB887" : "#B8860B";
                        this.ctx.fillRect(
                            offsetX + j * this.cellSize,
                            offsetY + i * this.cellSize,
                            this.cellSize,
                            this.cellSize
                        );
                    }
                }
            }
        }

        // Draw continuous grid lines
        this.ctx.strokeStyle = "black";
        this.ctx.lineWidth = 2;

        // Calculate the total visible area in board coordinates
        const totalStartX = startTileCol * this.singleBoardSize + this.gridOffset;
        const totalEndX = (endTileCol + 1) * this.singleBoardSize - this.gridOffset;
        const totalStartY = startTileRow * this.singleBoardSize + this.gridOffset;
        const totalEndY = (endTileRow + 1) * this.singleBoardSize - this.gridOffset;

        // Draw vertical lines
        for (let tileCol = startTileCol; tileCol <= endTileCol + 1; tileCol++) {
            for (let i = 0; i < this.boardSize; i++) {
                const x = tileCol * this.singleBoardSize + this.gridOffset + i * this.cellSize;
                if (x >= totalStartX && x <= totalEndX) {
                    // Draw board edge (red line) if this is the last line of a board and edges are enabled
                    if (this.showBoardEdges && i === this.boardSize - 1) {
                        this.ctx.strokeStyle = "#FF0000";
                        this.ctx.lineWidth = 4;
                        const edgeX = x + this.cellSize / 2;
                        this.ctx.beginPath();
                        this.ctx.moveTo(edgeX, totalStartY);
                        this.ctx.lineTo(edgeX, totalEndY);
                        this.ctx.stroke();
                        this.ctx.strokeStyle = "black";
                        this.ctx.lineWidth = 2;
                    }

                    // Draw regular grid line
                    this.ctx.beginPath();
                    if (this.showBoardEdges) {
                        // Draw separate segments for each board when edges are shown
                        for (let tileRow = startTileRow; tileRow <= endTileRow; tileRow++) {
                            const startY = tileRow * this.singleBoardSize + this.gridOffset;
                            const endY = startY + (this.boardSize - 1) * this.cellSize;
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
            for (let i = 0; i < this.boardSize; i++) {
                const y = tileRow * this.singleBoardSize + this.gridOffset + i * this.cellSize;
                if (y >= totalStartY && y <= totalEndY) {
                    // Draw board edge (red line) if this is the last line of a board and edges are enabled
                    if (this.showBoardEdges && i === this.boardSize - 1) {
                        this.ctx.strokeStyle = "#FF0000";
                        this.ctx.lineWidth = 4;
                        const edgeY = y + this.cellSize / 2;
                        this.ctx.beginPath();
                        this.ctx.moveTo(totalStartX, edgeY);
                        this.ctx.lineTo(totalEndX, edgeY);
                        this.ctx.stroke();
                        this.ctx.strokeStyle = "black";
                        this.ctx.lineWidth = 2;
                    }

                    // Draw regular grid line
                    this.ctx.beginPath();
                    if (this.showBoardEdges) {
                        // Draw separate segments for each board when edges are shown
                        for (let tileCol = startTileCol; tileCol <= endTileCol; tileCol++) {
                            const startX = tileCol * this.singleBoardSize + this.gridOffset;
                            const endX = startX + (this.boardSize - 1) * this.cellSize;
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
                this.drawSingleBoard(offsetX, offsetY, tileRow, tileCol);
            }
        }

        this.ctx.restore();
    }

    drawSingleBoard(offsetX, offsetY, tileRow, tileCol) {
        // Draw pieces (except selected piece)
        for (let i = 0; i < this.boardSize; i++) {
            for (let j = 0; j < this.boardSize; j++) {
                // Calculate the actual tessellation position
                const tessRow = i + (tileRow * this.boardSize);
                const tessCol = j + (tileCol * this.boardSize);

                // Get the piece at this position in the real board space
                const [realRow, realCol] = this.normalizePosition(tessRow, tessCol);
                const piece = this.board[realRow][realCol];

                // Skip drawing the selected piece here - we'll draw it last
                if (piece && (!this.selectedPiece || 
                    this.selectedPiece.row !== realRow || 
                    this.selectedPiece.col !== realCol)) {
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
            this.possibleMoves.forEach(([row, col]) => {
                // We need to find all instances of this real board position in the current tile
                for (let i = 0; i < this.boardSize; i++) {
                    for (let j = 0; j < this.boardSize; j++) {
                        const tessRow = i + (tileRow * this.boardSize);
                        const tessCol = j + (tileCol * this.boardSize);
                        const [realRow, realCol] = this.normalizePosition(tessRow, tessCol);

                        if (realRow === row && realCol === col) {
                            // This is a tile position that maps to our target move
                            const targetPiece = this.board[row][col];
                            this.drawPossibleMove(i, j, offsetX, offsetY, !!targetPiece);
                        }
                    }
                }
            });
        }

        // Draw hover highlight if exists
        if (this.hoverPos && !this.isDragging && !this.hasMoved && 
            this.hoverPos.tileRow === tileRow && 
            this.hoverPos.tileCol === tileCol) {
            const localRow = this.hoverPos.row % this.boardSize;
            const localCol = this.hoverPos.col % this.boardSize;
            this.drawHoverHighlight(localRow, localCol, offsetX, offsetY);
        }

        // Draw selected piece last so it's always on top
        if (this.selectedPiece) {
            // We need to find all instances of the selected piece in the current tile
            for (let i = 0; i < this.boardSize; i++) {
                for (let j = 0; j < this.boardSize; j++) {
                    const tessRow = i + (tileRow * this.boardSize);
                    const tessCol = j + (tileCol * this.boardSize);
                    const [realRow, realCol] = this.normalizePosition(tessRow, tessCol);

                    if (realRow === this.selectedPiece.row && 
                        realCol === this.selectedPiece.col) {
                        // Draw the highlight first
                        this.drawSelectedPiece(offsetX, offsetY, i, j);

                        // Then draw the piece on top
                        const piece = this.board[this.selectedPiece.row][this.selectedPiece.col];
                        if (piece) {
                            this.drawPiece(
                                piece,
                                offsetX + j * this.cellSize,
                                offsetY + i * this.cellSize
                            );
                        }
                    }
                }
            }
        }
    }

    drawRotationSpace(offsetX, offsetY) {
        this.drawSingleBoard(offsetX, offsetY);
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        this.ctx.fillRect(
            offsetX,
            offsetY,
            this.singleBoardSize,
            this.singleBoardSize,
        );
    }

    drawSelectedPiece(offsetX, offsetY, row, col) {
        const x = offsetX + col * this.cellSize;
        const y = offsetY + row * this.cellSize;

        // Draw a more prominent highlight for the selected piece
        this.ctx.fillStyle = "rgba(0, 255, 0, 0.4)";
        this.ctx.fillRect(x, y, this.cellSize, this.cellSize);

        // Add a thicker border around the selected piece
        this.ctx.strokeStyle = "rgba(0, 200, 0, 1)";
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, this.cellSize, this.cellSize);
    }

    drawHoverHighlight(row, col, offsetX, offsetY) {
        // Calculate the actual tessellation position
        const tessRow = row + (this.hoverPos.tileRow * this.boardSize);
        const tessCol = col + (this.hoverPos.tileCol * this.boardSize);

        // Get the real board coordinates
        const [realRow, realCol] = this.normalizePosition(tessRow, tessCol);

        // Only draw the highlight if this position maps to our hover position
        if (realRow === this.hoverPos.row && realCol === this.hoverPos.col) {
            const x = offsetX + col * this.cellSize;
            const y = offsetY + row * this.cellSize;

            // Draw a semi-transparent highlight
            this.ctx.fillStyle = "rgba(0, 255, 0, 0.2)";
            this.ctx.fillRect(x, y, this.cellSize, this.cellSize);

            // Add a border around the highlight
            this.ctx.strokeStyle = "rgba(0, 200, 0, 0.5)";
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, this.cellSize, this.cellSize);
        }
    }

    isKingCaptured(color) {
        // Check if the king of the specified color is still on the board
        let kingFound = false;
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.type === "king" && piece.color === color) {
                    kingFound = true;
                    break;
                }
            }
            if (kingFound) break;
        }
        return !kingFound;
    }

    updateLightPosition() {
        const distance = 30;
        const lightPos = new THREE.Vector3(20, 20, distance);
        lightPos.applyMatrix4(this.camera.matrixWorld);

        this.pointLight.position.copy(lightPos);
        this.lightSphere.position.copy(lightPos);
    }

    showPopup() {
        // Update popup content with torus chess explanation
        const infoContent = document.getElementById("popupContent");
        if (infoContent) {
            infoContent.innerHTML = `
                <h3>Torus Chess</h3>
                <p>This is a variant of chess played on a torus (donut shape), represented as a flat board with special wrapping rules:</p>
                <ul>
                    <li>The board wraps horizontally: moving off the right edge brings you to the left edge of the board.</li>
                    <li>The board wraps vertically with reflection: moving off the top edge brings you to the bottom edge, but reflected.</li>
                </ul>
                <p>This creates interesting tactical possibilities as pieces can move in ways not possible on a regular chess board.</p>
                <p><strong>Pawns:</strong> Pawns maintain their direction of movement across horizontal wrapping, but reverse direction when crossing a reflection boundary.</p>
                <p><strong>Coordinate Systems:</strong></p>
                <ul>
                    <li><strong>Real Board:</strong> The standard 8x8 chess board (0,0 to 7,7)</li>
                    <li><strong>Rotation Board:</strong> Includes reflection area (0,0 to 7,15)</li>
                    <li><strong>Tessellation Board:</strong> Infinite repeating pattern of the rotation board</li>
                </ul>
                <p>Toggle "Show Board Edges" to visualize the boundaries between boards.</p>
            `;
        }

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

    // COORDINATE TRANSLATION FUNCTIONS

    // Converts tessellation coordinates to real board coordinates
    normalizePosition(row, col) {
        // Handle x-axis wrapping with modulo 8
        let newCol = ((col % 8) + 8) % 8;

        // Handle y-axis wrapping and reflection
        // First normalize to the 0-15 range (16 = 2*8 for reflection)
        let newRow = ((row % 16) + 16) % 16;

        // If in the reflection zone (8-15), reflect back to 0-7
        if (newRow >= 8) {
            newRow = 15 - newRow; // This reflects 8->7, 9->6, 10->5, etc.
        }

        return [newRow, newCol];
    }

    // Determines if a position in tessellation space is in a reflected zone
    isPositionReflected(row, col) {
        // Position is reflected if its normalized tessellation row is >= 8
        return ((row % 16) + 16) % 16 >= 8;
    }

    // Determines the color of a square in the tessellation space
    isLightSquare(tessRow, tessCol) {
        // In standard chess, (row+col) % 2 == 0 is a light square
        // But on a torus with reflection, we need to consider how reflection affects the pattern
        const [realRow, realCol] = this.normalizePosition(tessRow, tessCol);
        return (realRow + realCol) % 2 === 0;
    }

    // Creates a coordinate display element
    createCoordinateDisplay() {
        // Create the coordinate display element if it doesn't exist
        if (!document.getElementById("coordinateDisplay")) {
            const display = document.createElement("div");
            display.id = "coordinateDisplay";
            display.style.position = "fixed";
            display.style.bottom = "10px";
            display.style.left = "10px";
            display.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
            display.style.color = "white";
            display.style.padding = "10px";
            display.style.borderRadius = "5px";
            display.style.fontFamily = "monospace";
            display.style.fontSize = "12px";
            display.style.zIndex = "1000";
            display.style.display = "none";
            document.body.appendChild(display);
            this.coordinateDisplay = display;
        } else {
            this.coordinateDisplay = document.getElementById(
                "coordinateDisplay",
            );
        }
    }

    // Updates the coordinate display with the current position information
    updateCoordinateDisplay(coords) {
        if (!this.coordinateDisplay) return;

        this.coordinateDisplay.style.display = "block";
        this.coordinateDisplay.innerHTML = `
            <strong>Coordinates:</strong><br>
            Real Board: [${coords.real.row}, ${coords.real.col}]<br>
            Rotation Board: [${coords.rotation.row}, ${coords.rotation.col}]<br>
            Tessellation: [${coords.tessellation.row}, ${coords.tessellation.col}]<br>
            ${
            coords.isReflected
                ? '<span style="color: #ff9999">In Reflection Zone</span>'
                : '<span style="color: #99ff99">In Normal Zone</span>'
        }
        `;
    }

    getPossibleMoves(row, col, isReflected) {
        const piece = this.board[row][col];
        if (!piece) return [];

        // Helper function to check if a position is valid and get the piece there
        const getPieceAt = (tessRow, tessCol) => {
            const [realRow, realCol] = this.normalizePosition(tessRow, tessCol);
            return this.board[realRow][realCol];
        };

        const moves = [];

        // For pawns, we need to consider their direction based on whether they're in a reflected zone
        let pawnDirection = piece.type === "pawn" ? piece.direction : 0;

        // If the pawn is in a reflected zone, its direction is reversed
        if (piece.type === "pawn" && isReflected) {
            pawnDirection *= -1;
        }

        const directions = {
            rook: [[0, 1], [1, 0], [0, -1], [-1, 0]],
            knight: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [
                2,
                -1,
            ], [2, 1]],
            bishop: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
            queen: [
                [0, 1],
                [1, 0],
                [0, -1],
                [-1, 0],
                [1, 1],
                [1, -1],
                [-1, 1],
                [-1, -1],
            ],
            king: [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [
                -1,
                -1,
            ]],
        };

        switch (piece.type) {
            case "pawn":
                // Forward move
                const forwardRow = row + pawnDirection;
                const [normForwardRow, normForwardCol] = this.normalizePosition(
                    forwardRow,
                    col,
                );

                // Check if the square in front is empty
                if (!getPieceAt(forwardRow, col)) {
                    moves.push([normForwardRow, normForwardCol]);

                    // First move can be 2 squares
                    const isStartingPosition =
                        (piece.color === "white" && row === 1) ||
                        (piece.color === "black" && row === 6);

                    if (isStartingPosition) {
                        const doubleRow = row + (2 * pawnDirection);
                        const [normDoubleRow, normDoubleCol] = this
                            .normalizePosition(doubleRow, col);

                        if (!getPieceAt(doubleRow, col)) {
                            moves.push([normDoubleRow, normDoubleCol]);
                        }
                    }
                }

                // Diagonal captures
                [-1, 1].forEach((dc) => {
                    const captureRow = row + pawnDirection;
                    const captureCol = col + dc;
                    const [normCaptureRow, normCaptureCol] = this
                        .normalizePosition(
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

    init() {
        // Initialize the game board
        this.drawBoard();
        
        // Update player display
        this.updatePlayerDisplay();
        
        // Initialize 3D view if needed
        this.init3D();
    }

    init3D() {
        // Create scene
        this.scene = new THREE.Scene();

        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            this.canvas.width / this.canvas.height,
            0.1,
            1000,
        );
        this.camera.position.set(0, -25, 20);

        // Create renderer with antialias
        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
        });
        this.renderer.setSize(this.canvas.width, this.canvas.height);
        this.renderer.setClearColor(0xf0f0f0, 1); // Match the body background color

        // Create a container for the game elements that will be controlled by OrbitControls
        this.gameContainer = new THREE.Group();
        this.scene.add(this.gameContainer);

        // Create orbit controls - now controlling only the game container
        this.controls = new THREE.OrbitControls(
            this.camera,
            this.renderer.domElement,
        );
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Add brighter lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // Store light and light sphere as class properties
        this.pointLight = new THREE.PointLight(0xffffff, 1.5, 100);
        this.lightSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffff00 }),
        );

        // Set initial positions
        this.updateLightPosition();

        this.scene.add(this.pointLight);
        this.scene.add(this.lightSphere);

        // Start animation loop
        this.animate();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.isTorusView) {
            this.controls.update();
            this.updateLightPosition();
            this.renderer.render(this.scene, this.camera);
        }
    }

    drawPossibleMove(row, col, offsetX, offsetY, isCapture) {
        const x = offsetX + col * this.cellSize;
        const y = offsetY + row * this.cellSize;

        // Draw a semi-transparent highlight for possible moves
        this.ctx.fillStyle = isCapture ? "rgba(255, 0, 0, 0.3)" : "rgba(0, 255, 0, 0.2)";
        this.ctx.fillRect(x, y, this.cellSize, this.cellSize);

        // Add a border around the highlight
        this.ctx.strokeStyle = isCapture ? "rgba(255, 0, 0, 0.5)" : "rgba(0, 200, 0, 0.5)";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, this.cellSize, this.cellSize);
    }
}

// Initialize the game
const game = new ChessGame();
game.init();
