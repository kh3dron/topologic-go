class ChessGame {
    constructor() {
        this.canvas = document.getElementById("chessBoard");
        this.ctx = this.canvas.getContext("2d");
        this.boardSize = 8; // Chess is always 8x8
        this.cellSize = 60; // Make cells a bit bigger
        this.gridOffset = 25;
        this.currentPlayer = "white";
        this.board = this.initializeBoard();
        this.selectedPiece = null;
        this.hoverPos = null;
        this.isTopologicMode = true;
        this.tiledView = false;
        this.tileCount = 3;
        this.spacing = 0;

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

        // Add view type tracking
        this.isTorusView = false;

        // Add Three.js setup
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.torusGeometry = null;
        this.torusMaterial = null;
        this.torusMesh = null;
        this.raycaster = null;
        this.mouse = null;
        this.hoverMesh = null;

        // Initialize 3D view
        this.init3D();

        // Add view selection listeners
        document.getElementById("tessellatedView").addEventListener(
            "click",
            () => this.setView(false),
        );
        document.getElementById("torusView").addEventListener(
            "click",
            () => this.setView(true),
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

    drawPiece(piece, x, y) {
        const size = this.cellSize;
        const centerX = x + size / 2;
        const centerY = y + size / 2;
        const radius = size * 0.4;
        
        this.ctx.save();
        this.ctx.fillStyle = piece.color === "white" ? "#FFFFFF" : "#000000";
        this.ctx.strokeStyle = piece.color === "white" ? "#000000" : "#FFFFFF";
        this.ctx.lineWidth = 2;

        // Draw basic shape
        switch (piece.type) {
            case "pawn":
                // Draw pawn as a circle with a small line on top
                this.ctx.beginPath();
                this.ctx.arc(centerX, centerY, radius * 0.8, 0, 2 * Math.PI);
                this.ctx.fill();
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.moveTo(centerX, centerY - radius * 0.8);
                this.ctx.lineTo(centerX, centerY - radius * 1.2);
                this.ctx.stroke();
                break;

            case "rook":
                // Draw rook as a castle-like shape
                this.ctx.beginPath();
                this.ctx.moveTo(centerX - radius * 0.8, centerY - radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.8, centerY - radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.8, centerY + radius * 0.8);
                this.ctx.lineTo(centerX - radius * 0.8, centerY + radius * 0.8);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
                // Add battlements
                this.ctx.beginPath();
                this.ctx.moveTo(centerX - radius * 0.8, centerY - radius * 0.8);
                this.ctx.lineTo(centerX - radius * 0.4, centerY - radius * 0.8);
                this.ctx.lineTo(centerX - radius * 0.4, centerY - radius * 1.2);
                this.ctx.lineTo(centerX - radius * 0.8, centerY - radius * 1.2);
                this.ctx.moveTo(centerX + radius * 0.8, centerY - radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.4, centerY - radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.4, centerY - radius * 1.2);
                this.ctx.lineTo(centerX + radius * 0.8, centerY - radius * 1.2);
                this.ctx.stroke();
                break;

            case "knight":
                // Draw knight as a horse head shape
                this.ctx.beginPath();
                this.ctx.moveTo(centerX - radius * 0.8, centerY + radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.8, centerY + radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.8, centerY - radius * 0.4);
                this.ctx.lineTo(centerX + radius * 0.4, centerY - radius * 0.8);
                this.ctx.lineTo(centerX - radius * 0.4, centerY - radius * 0.8);
                this.ctx.lineTo(centerX - radius * 0.8, centerY - radius * 0.4);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
                // Add ear
                this.ctx.beginPath();
                this.ctx.moveTo(centerX - radius * 0.4, centerY - radius * 0.8);
                this.ctx.lineTo(centerX - radius * 0.2, centerY - radius * 1.2);
                this.ctx.stroke();
                break;

            case "bishop":
                // Draw bishop as a pointed hat shape
                this.ctx.beginPath();
                this.ctx.moveTo(centerX - radius * 0.8, centerY + radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.8, centerY + radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.4, centerY - radius * 0.8);
                this.ctx.lineTo(centerX - radius * 0.4, centerY - radius * 0.8);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
                // Add cross
                this.ctx.beginPath();
                this.ctx.moveTo(centerX - radius * 0.2, centerY - radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.2, centerY - radius * 0.8);
                this.ctx.moveTo(centerX, centerY - radius * 0.8);
                this.ctx.lineTo(centerX, centerY - radius * 0.6);
                this.ctx.stroke();
                break;

            case "queen":
                // Draw queen as a crown shape
                this.ctx.beginPath();
                this.ctx.moveTo(centerX - radius * 0.8, centerY + radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.8, centerY + radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.8, centerY - radius * 0.4);
                this.ctx.lineTo(centerX + radius * 0.4, centerY - radius * 0.8);
                this.ctx.lineTo(centerX, centerY - radius * 0.4);
                this.ctx.lineTo(centerX - radius * 0.4, centerY - radius * 0.8);
                this.ctx.lineTo(centerX - radius * 0.8, centerY - radius * 0.4);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
                // Add crown points
                this.ctx.beginPath();
                this.ctx.moveTo(centerX - radius * 0.4, centerY - radius * 0.8);
                this.ctx.lineTo(centerX - radius * 0.2, centerY - radius * 1.2);
                this.ctx.moveTo(centerX, centerY - radius * 0.4);
                this.ctx.lineTo(centerX, centerY - radius * 0.8);
                this.ctx.moveTo(centerX + radius * 0.4, centerY - radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.2, centerY - radius * 1.2);
                this.ctx.stroke();
                break;

            case "king":
                // Draw king as a crown with a cross
                this.ctx.beginPath();
                this.ctx.moveTo(centerX - radius * 0.8, centerY + radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.8, centerY + radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.8, centerY - radius * 0.4);
                this.ctx.lineTo(centerX + radius * 0.4, centerY - radius * 0.8);
                this.ctx.lineTo(centerX, centerY - radius * 0.4);
                this.ctx.lineTo(centerX - radius * 0.4, centerY - radius * 0.8);
                this.ctx.lineTo(centerX - radius * 0.8, centerY - radius * 0.4);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
                // Add crown points
                this.ctx.beginPath();
                this.ctx.moveTo(centerX - radius * 0.4, centerY - radius * 0.8);
                this.ctx.lineTo(centerX - radius * 0.2, centerY - radius * 1.2);
                this.ctx.moveTo(centerX, centerY - radius * 0.4);
                this.ctx.lineTo(centerX, centerY - radius * 0.8);
                this.ctx.moveTo(centerX + radius * 0.4, centerY - radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.2, centerY - radius * 1.2);
                this.ctx.stroke();
                // Add cross
                this.ctx.beginPath();
                this.ctx.moveTo(centerX - radius * 0.2, centerY - radius * 0.8);
                this.ctx.lineTo(centerX + radius * 0.2, centerY - radius * 0.8);
                this.ctx.moveTo(centerX, centerY - radius * 0.8);
                this.ctx.lineTo(centerX, centerY - radius * 0.6);
                this.ctx.stroke();
                break;
        }

        // Add text label
        this.ctx.font = `${size * 0.4}px Arial`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillStyle = piece.color === "white" ? "#000000" : "#FFFFFF";
        
        // Use first letter of piece type
        const label = piece.type.charAt(0).toUpperCase();
        this.ctx.fillText(label, centerX, centerY);

        this.ctx.restore();
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

        // Convert to board coordinates - adjust for grid offset
        const col = Math.floor((localX - this.gridOffset) / this.cellSize) + 1;
        const row = Math.floor((localY - this.gridOffset) / this.cellSize) + 1;

        // Handle piece selection and movement
        if (row >= 0 && row < 8 && col >= 0 && col < 8) {
            const piece = this.board[row][col];
            if (piece && piece.color === this.currentPlayer) {
                this.selectedPiece = { row, col };
                this.drawBoard();
            } else if (this.selectedPiece) {
                // Move piece
                this.board[row][col] =
                    this.board[this.selectedPiece.row][this.selectedPiece.col];
                this.board[this.selectedPiece.row][this.selectedPiece.col] =
                    null;
                this.currentPlayer = this.currentPlayer === "white"
                    ? "black"
                    : "white";
                this.selectedPiece = null;
                this.updatePlayerDisplay();
                this.drawBoard();
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

        // Convert to board coordinates - adjust for grid offset
        const col = Math.floor((localX - this.gridOffset) / this.cellSize) + 1;
        const row = Math.floor((localY - this.gridOffset) / this.cellSize) + 1;

        // Only update if within valid range
        if (col >= 0 && col < 8 && row >= 0 && row < 8) {
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
            const col = Math.floor((localX - this.gridOffset) / this.cellSize) + 1;
            const row = Math.floor((localY - this.gridOffset) / this.cellSize) + 1;

            // Clear hover when outside valid board positions
            if (col < 0 || col >= this.boardSize || row < 0 || row >= this.boardSize) {
                if (this.hoverPos) {
                    this.hoverPos = null;
                    this.drawBoard();
                }
            } else {
                // Only update and redraw if the hover position has changed
                if (!this.hoverPos || 
                    this.hoverPos.row !== row || 
                    this.hoverPos.col !== col || 
                    this.hoverPos.tileRow !== tileRow || 
                    this.hoverPos.tileCol !== tileCol) {
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

        // Initialize pawns (second and seventh rows)
        for (let i = 0; i < 8; i++) {
            board[1][i] = { type: "pawn", color: "white" };  // White pawns on second row
            board[6][i] = { type: "pawn", color: "black" };  // Black pawns on seventh row
        }

        // Initialize other pieces (first and eighth rows)
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
            board[0][i] = { type: pieces[i], color: "white" };  // White pieces on first row
            board[7][i] = { type: pieces[i], color: "black" };  // Black pieces on eighth row
        }

        return board;
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

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
        });
        this.renderer.setSize(this.canvas.width, this.canvas.height);
        this.renderer.setClearColor(0xf0f0f0, 1);

        // Create a container for the game elements
        this.gameContainer = new THREE.Group();
        this.scene.add(this.gameContainer);

        // Create orbit controls
        this.controls = new THREE.OrbitControls(
            this.camera,
            this.renderer.domElement,
        );
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Create torus geometry
        this.torusGeometry = new THREE.TorusGeometry(10, 5, 100, 100);
        this.torusMaterial = new THREE.MeshPhongMaterial({
            color: 0xDEB887,
            side: THREE.DoubleSide,
        });
        this.torusMesh = new THREE.Mesh(this.torusGeometry, this.torusMaterial);
        this.gameContainer.add(this.torusMesh);

        // Add lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        this.pointLight = new THREE.PointLight(0xffffff, 1.5, 100);
        this.lightSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffff00 }),
        );

        this.updateLightPosition();

        this.scene.add(this.pointLight);
        this.scene.add(this.lightSphere);

        // Add grid lines
        this.createTorusGrid();

        // Start animation loop
        this.animate();

        // Add raycaster for interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
    }

    drawBoard() {
        // Clear the entire canvas
        this.ctx.fillStyle = "#f0f0f0";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.isTopologicMode || this.isTorusView) {
            if (this.isTorusView) {
                // Draw single board for torus view
                this.ctx.fillStyle = "#DEB887";
                this.ctx.fillRect(
                    0,
                    0,
                    this.singleBoardSize,
                    this.singleBoardSize,
                );
                if (this.showBoardEdges) {
                    this.ctx.strokeStyle = "#FF0000";
                    this.ctx.strokeRect(
                        0,
                        0,
                        this.singleBoardSize,
                        this.singleBoardSize,
                    );
                    this.ctx.lineWidth = 1;
                }
                this.drawSingleBoard(0, 0);
            } else {
                // Draw tessellated view (3x3 grid)
                for (let tileRow = 0; tileRow < this.tileCount; tileRow++) {
                    for (let tileCol = 0; tileCol < this.tileCount; tileCol++) {
                        const offsetX = tileCol * this.singleBoardSize;
                        const offsetY = tileRow * this.singleBoardSize;

                        // Draw board background
                        this.ctx.fillStyle = "#DEB887";
                        this.ctx.fillRect(
                            offsetX,
                            offsetY,
                            this.singleBoardSize,
                            this.singleBoardSize,
                        );
                    }
                }

                // Draw continuous grid lines across all boards
                this.ctx.strokeStyle = "black";

                // Draw vertical lines
                for (let tileRow = 0; tileRow < this.tileCount; tileRow++) {
                    for (let tileCol = 0; tileCol < this.tileCount; tileCol++) {
                        const offsetX = tileCol * this.singleBoardSize;
                        const offsetY = tileRow * this.singleBoardSize;
                        this.drawSingleBoard(offsetX, offsetY);
                    }
                }

                // Draw board edges if enabled
                if (this.showBoardEdges) {
                    for (let tileRow = 0; tileRow < this.tileCount; tileRow++) {
                        for (
                            let tileCol = 0;
                            tileCol < this.tileCount;
                            tileCol++
                        ) {
                            const offsetX = tileCol * this.singleBoardSize;
                            const offsetY = tileRow * this.singleBoardSize;

                            this.ctx.strokeStyle = "#FF0000";
                            this.ctx.strokeRect(
                                offsetX,
                                offsetY,
                                this.singleBoardSize,
                                this.singleBoardSize,
                            );
                        }
                    }
                    this.ctx.lineWidth = 1;
                }
            }
            return;
        }

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

        // Calculate the total visible area in board coordinates
        const totalStartX = startTileCol * this.singleBoardSize +
            this.gridOffset;
        const totalEndX = (endTileCol + 1) * this.singleBoardSize -
            this.gridOffset;
        const totalStartY = startTileRow * this.singleBoardSize +
            this.gridOffset;
        const totalEndY = (endTileRow + 1) * this.singleBoardSize -
            this.gridOffset;

        // Draw vertical lines
        for (let tileCol = startTileCol; tileCol <= endTileCol + 1; tileCol++) {
            for (let i = 0; i < this.boardSize; i++) {
                const x = tileCol * this.singleBoardSize + this.gridOffset +
                    i * this.cellSize;
                if (x >= totalStartX && x <= totalEndX) {
                    // Draw board edge (red line) if this is the last line of a board and edges are enabled
                    if (this.showBoardEdges && i === this.boardSize - 1) {
                        this.ctx.strokeStyle = "#FF0000";
                        this.ctx.lineWidth = 2;
                        const edgeX = x + this.cellSize / 2;
                        this.ctx.beginPath();
                        this.ctx.moveTo(edgeX, totalStartY);
                        this.ctx.lineTo(edgeX, totalEndY);
                        this.ctx.stroke();
                        this.ctx.strokeStyle = "black";
                        this.ctx.lineWidth = 1;
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
                            const startY = tileRow * this.singleBoardSize +
                                this.gridOffset;
                            const endY = startY +
                                (this.boardSize - 1) * this.cellSize;
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
                const y = tileRow * this.singleBoardSize + this.gridOffset +
                    i * this.cellSize;
                if (y >= totalStartY && y <= totalEndY) {
                    // Draw board edge (red line) if this is the last line of a board and edges are enabled
                    if (this.showBoardEdges && i === this.boardSize - 1) {
                        this.ctx.strokeStyle = "#FF0000";
                        this.ctx.lineWidth = 2;
                        const edgeY = y + this.cellSize / 2;
                        this.ctx.beginPath();
                        this.ctx.moveTo(totalStartX, edgeY);
                        this.ctx.lineTo(totalEndX, edgeY);
                        this.ctx.stroke();
                        this.ctx.strokeStyle = "black";
                        this.ctx.lineWidth = 1;
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
                            const startX = tileCol * this.singleBoardSize +
                                this.gridOffset;
                            const endX = startX +
                                (this.boardSize - 1) * this.cellSize;
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

        // Draw pieces on all visible boards
        for (let tileRow = startTileRow; tileRow <= endTileRow; tileRow++) {
            for (let tileCol = startTileCol; tileCol <= endTileCol; tileCol++) {
                const offsetX = tileCol * this.singleBoardSize;
                const offsetY = tileRow * this.singleBoardSize;

                // Draw pieces only (grid lines are already drawn)
                for (let i = 0; i < this.boardSize; i++) {
                    for (let j = 0; j < this.boardSize; j++) {
                        if (this.board[i][j]) {
                            this.drawPiece(
                                this.board[i][j],
                                offsetX + j * this.cellSize,
                                offsetY + i * this.cellSize
                            );
                        }
                    }
                }
            }
        }

        // Draw hover highlight if exists
        if (this.hoverPos && !this.isDragging && !this.hasMoved) {
            // Calculate range of tiles to draw hover on
            const visibleLeft = -this.viewportX / this.zoomLevel;
            const visibleTop = -this.viewportY / this.zoomLevel;
            const visibleRight = (this.canvas.width / this.zoomLevel) -
                this.viewportX / this.zoomLevel;
            const visibleBottom = (this.canvas.height / this.zoomLevel) -
                this.viewportY / this.zoomLevel;

            const startTileCol = Math.floor(visibleLeft / this.singleBoardSize);
            const endTileCol = Math.ceil(visibleRight / this.singleBoardSize);
            const startTileRow = Math.floor(visibleTop / this.singleBoardSize);
            const endTileRow = Math.ceil(visibleBottom / this.singleBoardSize);

            // Draw hover preview on all visible boards
            for (let tileRow = startTileRow; tileRow <= endTileRow; tileRow++) {
                for (
                    let tileCol = startTileCol;
                    tileCol <= endTileCol;
                    tileCol++
                ) {
                    const offsetX = tileCol * this.singleBoardSize;
                    const offsetY = tileRow * this.singleBoardSize;
                    this.drawHoverHighlight(
                        this.hoverPos.row,
                        this.hoverPos.col,
                        offsetX,
                        offsetY,
                    );
                }
            }
        }

        this.ctx.restore();
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

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.isTorusView) {
            this.controls.update();
            this.updateLightPosition();
            this.renderer.render(this.scene, this.camera);
        }
    }

    updateLightPosition() {
        const distance = 30;
        const lightPos = new THREE.Vector3(20, 20, distance);
        lightPos.applyMatrix4(this.camera.matrixWorld);

        this.pointLight.position.copy(lightPos);
        this.lightSphere.position.copy(lightPos);
    }

    createTorusGrid() {
        const R = 10;
        const r = 5;
        const segments = 100;

        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x000000,
            linewidth: 2,
            transparent: true,
            opacity: 0.8,
        });

        // Create grid lines
        for (let i = 0; i <= 8; i++) {
            const theta = (i / 8) * Math.PI * 2;
            const points = [];

            for (let t = 0; t <= segments; t++) {
                const phi = (t / segments) * Math.PI * 2;
                const offset = 0.1;
                const x = (R + (r + offset) * Math.cos(phi)) * Math.cos(theta);
                const y = (R + (r + offset) * Math.cos(phi)) * Math.sin(theta);
                const z = (r + offset) * Math.sin(phi);
                points.push(new THREE.Vector3(x, y, z));
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.gameContainer.add(line);
        }

        // Create horizontal lines
        for (let i = 0; i <= 8; i++) {
            const phi = (i / 8) * Math.PI * 2;
            const points = [];

            for (let t = 0; t <= segments; t++) {
                const theta = (t / segments) * Math.PI * 2;
                const offset = 0.1;
                const x = (R + (r + offset) * Math.cos(phi)) * Math.cos(theta);
                const y = (R + (r + offset) * Math.cos(phi)) * Math.sin(theta);
                const z = (r + offset) * Math.sin(phi);
                points.push(new THREE.Vector3(x, y, z));
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.gameContainer.add(line);
        }
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
        this.updatePlayerDisplay();
        this.drawBoard();
    }

    updatePlayerDisplay() {
        document.getElementById("currentPlayer").textContent =
            `Current Player: ${
                this.currentPlayer.charAt(0).toUpperCase() +
                this.currentPlayer.slice(1)
            }`;
    }

    setView(isTorusView) {
        this.isTorusView = isTorusView;
        document.getElementById("tessellatedView").classList.toggle(
            "active",
            !isTorusView,
        );
        document.getElementById("torusView").classList.toggle(
            "active",
            isTorusView,
        );

        if (isTorusView) {
            this.canvas.style.display = "none";
            document.body.appendChild(this.renderer.domElement);
            this.renderer.domElement.classList.add("three-js");

            const sidebarWidth = 310;
            const availableWidth = window.innerWidth - sidebarWidth;
            const availableHeight = window.innerHeight;

            this.renderer.setSize(availableWidth, availableHeight);
            this.renderer.domElement.style.position = "absolute";
            this.renderer.domElement.style.left = `${sidebarWidth}px`;
            this.renderer.domElement.style.top = "0";
            this.renderer.domElement.style.width = `${availableWidth}px`;
            this.renderer.domElement.style.height = `${availableHeight}px`;

            this.camera.aspect = availableWidth / availableHeight;
            this.camera.updateProjectionMatrix();

            this.camera.position.set(0, -30, 15);
            this.camera.lookAt(0, 0, 0);
            this.controls.update();
        } else {
            this.renderer.domElement.remove();
            this.canvas.style.display = "block";
            this.drawBoard();
        }
    }
}

// Start the game when the page loads
window.onload = () => new ChessGame();
