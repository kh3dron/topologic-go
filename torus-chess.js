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

        // Add mobile menu toggle functionality
        const menuToggle = document.getElementById("menuToggle");
        const sidebar = document.querySelector(".sidebar");
        const overlay = document.getElementById("overlay");

        menuToggle.addEventListener("click", () => {
            sidebar.classList.toggle("active");
            overlay.style.display = sidebar.classList.contains("active") ? "block" : "none";
        });

        overlay.addEventListener("click", () => {
            sidebar.classList.remove("active");
            overlay.style.display = "none";
        });

        // Close menu when clicking outside on mobile
        document.addEventListener("click", (e) => {
            if (window.innerWidth <= 768 && 
                !sidebar.contains(e.target) && 
                !menuToggle.contains(e.target) && 
                sidebar.classList.contains("active")) {
                sidebar.classList.remove("active");
                overlay.style.display = "none";
            }
        });

        // Create coordinate display element
        this.createCoordinateDisplay();
    }

    loadPieceImages() {
        const colors = ['w', 'b'];
        const pieces = ['b', 'k', 'n', 'p', 'q', 'r'];
        let loadedImages = 0;
        const totalImages = colors.length * pieces.length;

        colors.forEach(color => {
            pieces.forEach(piece => {
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
            'pawn': 'p',
            'knight': 'n',
            'bishop': 'b',
            'rook': 'r',
            'queen': 'q',
            'king': 'k'
        };
        const imageKey = `${piece.color.charAt(0)}_${pieceTypeMap[piece.type]}`;
        const img = this.pieceImages[imageKey];
        
        if (img) {
            this.ctx.drawImage(
                img,
                x + padding,
                y + padding,
                size - (padding * 2),
                size - (padding * 2)
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

        // Convert to board coordinates - no need to adjust for grid offset
        const col = Math.floor(localX / this.cellSize);
        const row = Math.floor(localY / this.cellSize);

        console.log('Click coordinates:', { row, col, tileRow, tileCol });
        console.log('Current board state:', this.board);
        console.log('Selected piece:', this.selectedPiece);
        console.log('Possible moves:', this.possibleMoves);

        // Handle piece selection and movement
        if (row >= 0 && row < 8 && col >= 0 && col < 8) {
            const piece = this.board[row][col];
            console.log('Clicked piece:', piece);
            
            if (piece && piece.color === this.currentPlayer) {
                console.log('Selecting piece:', piece);
                this.selectedPiece = { row, col };
                this.possibleMoves = this.getPossibleMoves(row, col);
                console.log('Calculated possible moves:', this.possibleMoves);
                this.drawBoard();
            } else if (this.selectedPiece) {
                // Check if the move is valid
                const isValidMove = this.possibleMoves.some(
                    ([r, c]) => r === row && c === col
                );
                
                console.log('Move validation:', { isValidMove, targetRow: row, targetCol: col });
                
                if (isValidMove) {
                    console.log('Making move from', this.selectedPiece, 'to', { row, col });
                    // Move piece
                    this.board[row][col] = this.board[this.selectedPiece.row][this.selectedPiece.col];
                    this.board[this.selectedPiece.row][this.selectedPiece.col] = null;
                    
                    // Check if a king was captured
                    if (this.isKingCaptured(this.currentPlayer === "white" ? "black" : "white")) {
                        this.handleGameOver(this.currentPlayer);
                        return;
                    }
                    
                    this.currentPlayer = this.currentPlayer === "white" ? "black" : "white";
                    this.selectedPiece = null;
                    this.possibleMoves = [];
                    this.updatePlayerDisplay();
                    this.drawBoard();
                } else {
                    console.log('Invalid move, deselecting piece');
                    // Deselect piece if clicking invalid square
                    this.selectedPiece = null;
                    this.possibleMoves = [];
                    this.drawBoard();
                }
            }
        }

        // Update coordinate display
        const coords = {
            real: { row: row, col: col },
            tessellation: { row: tileRow, col: tileCol }
        };
        this.updateCoordinateDisplay(coords);
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

        // Convert to board coordinates - no need to adjust for grid offset
        const col = Math.floor(localX / this.cellSize);
        const row = Math.floor(localY / this.cellSize);

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
                this.ctx.fillRect(0, 0, this.singleBoardSize, this.singleBoardSize);
                if (this.showBoardEdges) {
                    this.ctx.strokeStyle = "#FF0000";
                    this.ctx.strokeRect(0, 0, this.singleBoardSize, this.singleBoardSize);
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
                        this.ctx.fillRect(offsetX, offsetY, this.singleBoardSize, this.singleBoardSize);
                    }
                }

                // Draw continuous grid lines across all boards
                this.ctx.strokeStyle = "black";
                this.ctx.lineWidth = 2;

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
                        for (let tileCol = 0; tileCol < this.tileCount; tileCol++) {
                            const offsetX = tileCol * this.singleBoardSize;
                            const offsetY = tileRow * this.singleBoardSize;

                            this.ctx.strokeStyle = "#FF0000";
                            this.ctx.strokeRect(offsetX, offsetY, this.singleBoardSize, this.singleBoardSize);
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
                        for (let tileRow = startTileRow; tileRow <= endTileRow; tileRow++) {
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
                        for (let tileCol = startTileCol; tileCol <= endTileCol; tileCol++) {
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

        // Draw pieces (except selected piece)
        for (let i = 0; i < this.boardSize; i++) {
            for (let j = 0; j < this.boardSize; j++) {
                // Skip drawing the selected piece here - we'll draw it last
                if (this.board[i][j] && (!this.selectedPiece || 
                    this.selectedPiece.row !== i || 
                    this.selectedPiece.col !== j)) {
                    this.drawPiece(
                        this.board[i][j],
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
                this.drawPossibleMove(row, col, offsetX, offsetY);
            });
        }

        // Draw hover highlight if exists
        if (this.hoverPos && !this.isDragging && !this.hasMoved) {
            this.drawHoverHighlight(
                this.hoverPos.row,
                this.hoverPos.col,
                offsetX,
                offsetY
            );
        }

        // Draw selected piece last so it's always on top
        if (this.selectedPiece) {
            // Draw the highlight first
            this.drawSelectedPiece(offsetX, offsetY);
            
            // Then draw the piece on top
            const piece = this.board[this.selectedPiece.row][this.selectedPiece.col];
            if (piece) {
                this.drawPiece(
                    piece,
                    offsetX + this.selectedPiece.col * this.cellSize,
                    offsetY + this.selectedPiece.row * this.cellSize
                );
            }
        }
    }

    drawSelectedPiece(offsetX, offsetY) {
        const x = offsetX + this.selectedPiece.col * this.cellSize;
        const y = offsetY + this.selectedPiece.row * this.cellSize;
        
        // Draw a more prominent highlight for the selected piece
        this.ctx.fillStyle = "rgba(0, 255, 0, 0.4)";
        this.ctx.fillRect(x, y, this.cellSize, this.cellSize);
        
        // Add a thicker border around the selected piece
        this.ctx.strokeStyle = "rgba(0, 200, 0, 1)";
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, this.cellSize, this.cellSize);
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
        const infoContent = document.getElementById("popupContent");
        if (infoContent) {
            infoContent.innerHTML = `
                <h3>Torus Chess</h3>
                <p>This is a variant of chess played on a torus (donut shape), represented as a flat board with special wrapping rules:</p>
                <ul>
                    <li>The board wraps horizontally: moving off the right edge brings you to the left edge of the board.</li>
                    <li>The board wraps vertically: moving off the top edge brings you to the bottom edge.</li>
                </ul>
                <p>This creates interesting tactical possibilities as pieces can move in ways not possible on a regular chess board.</p>
                <p><strong>Coordinate Systems:</strong></p>
                <ul>
                    <li><strong>Real Board:</strong> The standard 8x8 chess board (0,0 to 7,7)</li>
                    <li><strong>Tessellation Board:</strong> Infinite repeating pattern of the board</li>
                </ul>
                <p>Toggle "Show Board Edges" to visualize the boundaries between boards.</p>
            `;
        }

        this.infoPopup.style.display = "block";
        this.overlay.style.display = "block";
        this.startGameBtn.style.display = this.hasStartedGame ? "none" : "block";
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

    getPossibleMoves(row, col) {
        const piece = this.board[row][col];
        if (!piece) return [];

        console.log('Calculating moves for piece:', piece, 'at position:', { row, col });

        // Helper function to normalize position and handle wrapping
        const normalizePosition = (row, col) => {
            let newRow = ((row % 8) + 8) % 8;  // Ensure positive modulo
            let newCol = ((col % 8) + 8) % 8;  // Ensure positive modulo
            return [newRow, newCol];
        };

        // Helper function to check if a position is valid and get the piece there
        const getPieceAt = (row, col) => {
            const [normalizedRow, normalizedCol] = normalizePosition(row, col);
            return this.board[normalizedRow][normalizedCol];
        };

        const moves = [];
        const directions = {
            pawn: piece.color === "white" ? 1 : -1,
            rook: [[0, 1], [1, 0], [0, -1], [-1, 0]],
            knight: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
            bishop: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
            queen: [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
            king: [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]
        };

        switch (piece.type) {
            case "pawn":
                // Forward move
                const forwardRow = row + directions.pawn;
                const [normForwardRow, normCol] = normalizePosition(forwardRow, col);
                if (!getPieceAt(forwardRow, col)) {
                    moves.push([normForwardRow, normCol]);
                    // First move can be 2 squares
                    if ((piece.color === "white" && row === 1) || (piece.color === "black" && row === 6)) {
                        const doubleRow = row + (2 * directions.pawn);
                        const [normDoubleRow, normDoubleCol] = normalizePosition(doubleRow, col);
                        if (!getPieceAt(doubleRow, col)) {
                            moves.push([normDoubleRow, normDoubleCol]);
                        }
                    }
                }
                // Diagonal captures
                [-1, 1].forEach(dc => {
                    const captureRow = row + directions.pawn;
                    const captureCol = col + dc;
                    const [normCaptureRow, normCaptureCol] = normalizePosition(captureRow, captureCol);
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
                        const [normRow, normCol] = normalizePosition(currentRow, currentCol);
                        const targetPiece = getPieceAt(currentRow, currentCol);
                        
                        if (!targetPiece) {
                            moves.push([normRow, normCol]);
                        } else {
                            if (targetPiece.color !== piece.color) {
                                moves.push([normRow, normCol]);
                            }
                            break;  // Stop in this direction after hitting a piece
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
                    const [normRow, normCol] = normalizePosition(newRow, newCol);
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
                    const [normRow, normCol] = normalizePosition(newRow, newCol);
                    const targetPiece = getPieceAt(newRow, newCol);
                    if (!targetPiece || targetPiece.color !== piece.color) {
                        moves.push([normRow, normCol]);
                    }
                });
                break;
        }

        console.log('Calculated moves:', moves);
        return moves;
    }

    drawPossibleMove(row, col, offsetX, offsetY) {
        const x = offsetX + col * this.cellSize;
        const y = offsetY + row * this.cellSize;

        // Check if this move will capture a piece
        const targetPiece = this.board[row][col];

        // Draw a semi-transparent highlight for possible moves
        this.ctx.fillStyle = targetPiece ? "rgba(255, 0, 0, 0.3)" : "rgba(0, 255, 0, 0.2)";
        this.ctx.fillRect(x, y, this.cellSize, this.cellSize);

        // Add a border around the highlight
        this.ctx.strokeStyle = targetPiece ? "rgba(255, 0, 0, 0.5)" : "rgba(0, 200, 0, 0.5)";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, this.cellSize, this.cellSize);
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

    handleGameOver(winner) {
        // Disable piece movement
        this.canvas.style.pointerEvents = "none";

        // Show game over popup
        const winnerText = winner.charAt(0).toUpperCase() + winner.slice(1);
        this.winnerText.textContent = `Game Over! ${winnerText} wins by capturing the king!`;
        this.gameOverPopup.style.display = "block";
        this.overlay.style.display = "block";
    }

    // Add these new methods for coordinate display
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
            this.coordinateDisplay = document.getElementById("coordinateDisplay");
        }
    }

    updateCoordinateDisplay(coords) {
        if (!this.coordinateDisplay) return;

        this.coordinateDisplay.style.display = "block";
        this.coordinateDisplay.innerHTML = `
            <strong>Coordinates:</strong><br>
            Real Board: [${coords.real.row}, ${coords.real.col}]<br>
            Tessellation: [${coords.tessellation.row}, ${coords.tessellation.col}]
        `;
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
}

// Start the game when the page loads
window.onload = () => new ChessGame();
