class GoGame {
    constructor() {
        this.canvas = document.getElementById("goBoard");
        this.ctx = this.canvas.getContext("2d");
        this.boardSize = 19;
        this.cellSize = 50;
        this.gridOffset = 25;
        this.currentPlayer = "black";
        this.board = Array(this.boardSize).fill().map(() =>
            Array(this.boardSize).fill(null)
        );
        this.passes = 0;
        this.blackStones = 0;
        this.whiteStones = 0;
        this.hoverPos = null;
        this.isTopologicMode = true;
        this.tiledView = false;
        this.tileCount = 3;
        this.spacing = 0; // Keep spacing at 0

        // Calculate total size needed for one board
        this.singleBoardSize = (this.boardSize - 1) * this.cellSize +
            this.gridOffset;
        // Calculate canvas size needed for 3x3 grid with no spacing
        const totalSize = this.singleBoardSize * this.tileCount;
        this.canvas.width = totalSize;
        this.canvas.height = totalSize;

        this.canvas.addEventListener("click", this.handleClick.bind(this));
        document.getElementById("passButton").addEventListener(
            "click",
            this.pass.bind(this),
        );
        document.getElementById("resetButton").addEventListener(
            "click",
            this.resetGame.bind(this),
        );

        // Add mousemove and mouseout event listeners
        this.canvas.addEventListener("mousemove", this.handleHover.bind(this));
        this.canvas.addEventListener("mouseout", () => {
            this.hoverPos = null;
            this.drawBoard();
        });

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
        this.hoverMesh = null; // Add this to store the preview stone

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

        // Add pan and zoom tracking
        this.viewportX = 0; // Tracks horizontal pan position
        this.viewportY = 0; // Tracks vertical pan position
        this.zoomLevel = 1; // Tracks zoom level
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Add event listeners for pan and zoom
        this.canvas.addEventListener("mousedown", this.startDrag.bind(this));
        this.canvas.addEventListener(
            "mousemove",
            this.handleDragAndHover.bind(this),
        );
        this.canvas.addEventListener("mouseup", this.stopDrag.bind(this));
        this.canvas.addEventListener("wheel", this.handleZoom.bind(this));

        this.hasMoved = false; // Add this new property

        // Make canvas fill the screen
        const updateCanvasSize = () => {
            // Use the full window width
            const availableWidth = window.innerWidth;

            // Use the full available width
            this.cellSize = Math.floor(
                (availableWidth / this.tileCount) / (this.boardSize - 1),
            );
            this.gridOffset = this.cellSize;

            // Calculate board dimensions
            this.singleBoardSize = (this.boardSize - 1) * this.cellSize +
                this.gridOffset;
            const totalSize = this.singleBoardSize * this.tileCount;

            // Set canvas size
            this.canvas.width = totalSize;
            this.canvas.height = totalSize;

            // Position the canvas
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

            this.drawBoard();
        };

        // Initial size
        updateCanvasSize();

        // Update size when window is resized
        window.addEventListener("resize", updateCanvasSize);

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

        // Add board size change listener
        document.getElementById("boardSize").addEventListener("change", (e) => {
            this.changeBoardSize(parseInt(e.target.value));
        });

        this.drawBoard();

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

        // Create torus geometry using current board size
        this.torusGeometry = new THREE.TorusGeometry(10, 5, 100, 100);
        this.torusMaterial = new THREE.MeshPhongMaterial({
            color: 0xDEB887,
            side: THREE.DoubleSide,
        });
        this.torusMesh = new THREE.Mesh(this.torusGeometry, this.torusMaterial);
        this.gameContainer.add(this.torusMesh);

        // Add brighter lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Increased from 0.3
        this.scene.add(ambientLight);

        // Store light and light sphere as class properties
        this.pointLight = new THREE.PointLight(0xffffff, 1.5, 100); // Increased from 1.0
        this.lightSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffff00 }),
        );

        // Set initial positions
        this.updateLightPosition();

        this.scene.add(this.pointLight);
        this.scene.add(this.lightSphere);

        // Add grid lines to the container
        this.createTorusGrid();

        // Start animation loop
        this.animate();

        // Update renderer size to match window
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // Add to init3D() method after creating the scene
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
    }

    updateLightPosition() {
        // Position light relative to camera
        const distance = 30;
        const lightPos = new THREE.Vector3(20, 20, distance);
        // Convert from camera space to world space
        lightPos.applyMatrix4(this.camera.matrixWorld);

        this.pointLight.position.copy(lightPos);
        this.lightSphere.position.copy(lightPos);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.isTorusView) {
            this.controls.update();
            this.updateLightPosition(); // Update light position before rendering
            this.renderer.render(this.scene, this.camera);
        }
    }

    drawBoard() {
        // Clear the entire canvas with the background color
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
                    this.ctx.strokeStyle = "#FF0000"; // Bright red
                    this.ctx.strokeRect(
                        0,
                        0,
                        this.singleBoardSize,
                        this.singleBoardSize,
                    );
                    this.ctx.lineWidth = 1; // Reset line width
                }
                this.drawSingleBoard(0, 0);
            } else {
                // Draw tessellated view (3x3 grid)
                // Draw background for all tiles
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
                            let tileCol = 0; tileCol < this.tileCount; tileCol++
                        ) {
                            const offsetX = tileCol * this.singleBoardSize;
                            const offsetY = tileRow * this.singleBoardSize;

                            this.ctx.strokeStyle = "#FF0000"; // Bright red
                            this.ctx.strokeRect(
                                offsetX,
                                offsetY,
                                this.singleBoardSize,
                                this.singleBoardSize,
                            );
                        }
                    }
                    this.ctx.lineWidth = 1; // Reset line width
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

        // Draw stones on all visible boards
        for (let tileRow = startTileRow; tileRow <= endTileRow; tileRow++) {
            for (let tileCol = startTileCol; tileCol <= endTileCol; tileCol++) {
                const offsetX = tileCol * this.singleBoardSize;
                const offsetY = tileRow * this.singleBoardSize;

                // Draw stones only (grid lines are already drawn)
                for (let i = 0; i < this.boardSize; i++) {
                    for (let j = 0; j < this.boardSize; j++) {
                        if (this.board[i][j]) {
                            this.drawStone(
                                i,
                                j,
                                this.board[i][j],
                                offsetX,
                                offsetY,
                            );
                        }
                    }
                }
            }
        }

        // Draw hover preview if valid and not dragging/moving
        if (
            this.hoverPos && !this.isDragging && !this.hasMoved &&
            this.isValidMove(this.hoverPos.row, this.hoverPos.col)
        ) {
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
                    let tileCol = startTileCol; tileCol <= endTileCol; tileCol++
                ) {
                    const offsetX = tileCol * this.singleBoardSize;
                    const offsetY = tileRow * this.singleBoardSize;
                    this.drawPreviewStone(
                        this.hoverPos.row,
                        this.hoverPos.col,
                        this.currentPlayer,
                        offsetX,
                        offsetY,
                    );
                }
            }
        }

        this.ctx.restore();
    }

    drawSingleBoard(offsetX, offsetY) {
        // Draw stones only
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
            this.cellSize / 2,
            0,
            2 * Math.PI,
        );
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.stroke();
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
        const col = Math.round((localX - this.gridOffset) / this.cellSize);
        const row = Math.round((localY - this.gridOffset) / this.cellSize);

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
        if (this.currentPlayer === "black") {
            this.blackStones++;
        } else {
            this.whiteStones++;
        }

        // Count stones that will be captured
        const capturedBlack = this.countStonesToRemove("black");
        const capturedWhite = this.countStonesToRemove("white");

        this.removeDeadStones(this.getOppositeColor());
        this.removeDeadStones(this.currentPlayer);

        // Update counts after captures
        this.blackStones -= capturedBlack;
        this.whiteStones -= capturedWhite;

        this.currentPlayer = this.getOppositeColor();
        if (this.isTorusView) {
            this.updateTorusBoard();
        } else {
            this.drawBoard();
        }
        this.updatePlayerDisplay();
        this.updateStoneCount();
    }

    getOppositeColor() {
        return this.currentPlayer === "black" ? "white" : "black";
    }

    pass() {
        this.passes++;
        if (this.passes === 2) {
            this.showGameOver();
            return;
        }
        this.currentPlayer = this.getOppositeColor();
        this.updatePlayerDisplay();
    }

    showGameOver() {
        const winner = this.blackStones > this.whiteStones
            ? "Black"
            : this.whiteStones > this.blackStones
            ? "White"
            : "Tie";

        let message = winner === "Tie"
            ? `Game Over! It's a tie! (Black: ${this.blackStones}, White: ${this.whiteStones})`
            : `Game Over! ${winner} wins! (Black: ${this.blackStones}, White: ${this.whiteStones})`;

        this.winnerText.textContent = message;
        this.gameOverPopup.style.display = "block";
        this.overlay.style.display = "block";
    }

    hideGameOverPopup() {
        this.gameOverPopup.style.display = "none";
        this.overlay.style.display = "none";
    }

    resetGame() {
        this.board = Array(this.boardSize).fill().map(() =>
            Array(this.boardSize).fill(null)
        );
        this.currentPlayer = "black";
        this.passes = 0;
        this.blackStones = 0;
        this.whiteStones = 0;
        if (this.isTorusView) {
            // Remove existing stones
            while (this.torusMesh.children.length > 0) {
                this.torusMesh.remove(this.torusMesh.children[0]);
            }
        }
        this.drawBoard();
        this.updatePlayerDisplay();
        this.updateStoneCount();
    }

    updatePlayerDisplay() {
        document.getElementById("currentPlayer").textContent =
            `Current Player: ${
                this.currentPlayer.charAt(0).toUpperCase() +
                this.currentPlayer.slice(1)
            }`;
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
            } else if (
                newRow < 0 || newRow >= this.boardSize || newCol < 0 ||
                newCol >= this.boardSize
            ) {
                continue;
            }

            if (this.board[newRow][newCol] === null) {
                return true;
            }

            if (
                this.board[newRow][newCol] === color &&
                this.hasLiberties(newRow, newCol, checked)
            ) {
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
        document.getElementById("stoneCount").textContent =
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
        if (
            col >= 0 && col < this.boardSize && row >= 0 && row < this.boardSize
        ) {
            if (
                !this.hoverPos || this.hoverPos.row !== row ||
                this.hoverPos.col !== col
            ) {
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
            this.cellSize / 2,
            0,
            2 * Math.PI,
        );
        this.ctx.fillStyle = color === "black"
            ? "rgba(0, 0, 0, 0.3)"
            : "rgba(255, 255, 255, 0.3)";
        this.ctx.fill();
        this.ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
        this.ctx.stroke();
        this.ctx.strokeStyle = "black"; // Reset stroke style for next drawing
    }

    // Helper function to get torus-adjusted coordinates
    getTorusCoords(row, col) {
        if (!this.isTopologicMode) return { row, col };
        return {
            row: ((row % this.boardSize) + this.boardSize) % this.boardSize,
            col: ((col % this.boardSize) + this.boardSize) % this.boardSize,
        };
    }

    // Add new method to handle view changes
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
            // Switch to 3D view
            this.canvas.style.display = "none";
            document.body.appendChild(this.renderer.domElement);
            this.renderer.domElement.classList.add("three-js");

            const sidebarWidth = 310;
            const availableWidth = window.innerWidth - sidebarWidth;
            const availableHeight = window.innerHeight;

            // Use the full available width and height
            this.renderer.setSize(availableWidth, availableHeight);

            // Position the renderer's canvas to fill the available space
            this.renderer.domElement.style.position = "absolute";
            this.renderer.domElement.style.left = `${sidebarWidth}px`;
            this.renderer.domElement.style.top = "0";
            this.renderer.domElement.style.width = `${availableWidth}px`;
            this.renderer.domElement.style.height = `${availableHeight}px`;

            // Update camera aspect ratio
            this.camera.aspect = availableWidth / availableHeight;
            this.camera.updateProjectionMatrix();

            this.updateTorusBoard();

            // Reset camera position for better view
            this.camera.position.set(0, -30, 15);
            this.camera.lookAt(0, 0, 0);
            this.controls.update();

            // Add event listeners for 3D view
            this.renderer.domElement.addEventListener(
                "mousemove",
                (e) => this.handleTorusHover(e),
            );
            this.renderer.domElement.addEventListener(
                "click",
                (e) => this.handleTorusClick(e),
            );
        } else {
            // Remove event listeners when switching back to 2D
            this.renderer.domElement.removeEventListener(
                "mousemove",
                (e) => this.handleTorusHover(e),
            );
            this.renderer.domElement.removeEventListener(
                "click",
                (e) => this.handleTorusClick(e),
            );

            // Remove hover preview if it exists
            if (this.hoverMesh) {
                this.torusMesh.remove(this.hoverMesh);
                this.hoverMesh = null;
            }

            // Switch back to 2D view
            this.renderer.domElement.remove();
            this.canvas.style.display = "block";
            this.drawBoard();
        }
    }

    updateTorusBoard() {
        // Remove existing stones
        while (this.torusMesh.children.length > 0) {
            this.torusMesh.remove(this.torusMesh.children[0]);
        }

        // Add stones to the torus
        for (let i = 0; i < this.boardSize; i++) {
            for (let j = 0; j < this.boardSize; j++) {
                if (this.board[i][j]) {
                    const stone = this.create3DStone(
                        i / this.boardSize * Math.PI * 2,
                        j / this.boardSize * Math.PI * 2,
                        this.board[i][j],
                    );
                    this.torusMesh.add(stone);
                }
            }
        }
    }

    create3DStone(theta, phi, color, isPreview = false) {
        const R = 10;
        const r = 5;

        const stoneScale = this.boardSize === 19
            ? 0.2
            : (this.boardSize === 13 ? 0.25 : 0.3);
        const stoneRadius = (2 * Math.PI * r / this.boardSize) * stoneScale;

        const geometry = new THREE.SphereGeometry(stoneRadius, 32, 32);
        const material = new THREE.MeshPhongMaterial({
            color: color === "black" ? 0x000000 : 0xffffff,
            transparent: isPreview,
            opacity: isPreview ? 0.5 : 1,
        });
        const stone = new THREE.Mesh(geometry, material);

        const surfaceOffset = 0.1;
        const normalX = Math.cos(theta) * Math.cos(phi);
        const normalY = Math.sin(theta) * Math.cos(phi);
        const normalZ = Math.sin(phi);

        const localRadius = R + r * Math.cos(phi);
        stone.position.x = (localRadius * Math.cos(theta)) +
            (normalX * surfaceOffset);
        stone.position.y = (localRadius * Math.sin(theta)) +
            (normalY * surfaceOffset);
        stone.position.z = (r * Math.sin(phi)) + (normalZ * surfaceOffset);

        return stone;
    }

    createTorusGrid() {
        const R = 10; // major radius
        const r = 5; // minor radius
        const segments = 100; // Increase segments for smoother lines

        // Calculate line properties based on board size
        const lineWidth = this.boardSize <= 9
            ? 3
            : this.boardSize <= 13
            ? 2
            : 1;

        // Adjust line color and opacity based on board size
        const lineColor = this.boardSize <= 13 ? 0x000000 : 0x333333;
        const lineOpacity = this.boardSize <= 13 ? 1.0 : 0.8;

        const lineMaterial = new THREE.LineBasicMaterial({
            color: lineColor,
            linewidth: lineWidth,
            transparent: true,
            opacity: lineOpacity,
        });

        // Create vertical lines
        for (let i = 0; i < this.boardSize; i++) {
            const theta = (i / this.boardSize) * Math.PI * 2;
            const points = [];

            // Create points along the torus surface
            for (let t = 0; t <= segments; t++) {
                const phi = (t / segments) * Math.PI * 2;
                // Adjust offset based on board size
                const offset = 0.1 * (19 / this.boardSize); // Larger offset for smaller boards
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
        for (let i = 0; i < this.boardSize; i++) {
            const phi = (i / this.boardSize) * Math.PI * 2;
            const points = [];

            for (let t = 0; t <= segments; t++) {
                const theta = (t / segments) * Math.PI * 2;
                // Adjust offset based on board size
                const offset = 0.1 * (19 / this.boardSize);
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

    // Add these new methods for handling pan and zoom
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
            const col = Math.round((localX - this.gridOffset) / this.cellSize);
            const row = Math.round((localY - this.gridOffset) / this.cellSize);

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

    // Add new method to handle board size changes
    changeBoardSize(newSize) {
        this.boardSize = newSize;

        // Reset the game with new size
        this.board = Array(this.boardSize).fill().map(() =>
            Array(this.boardSize).fill(null)
        );
        this.currentPlayer = "black";
        this.passes = 0;
        this.blackStones = 0;
        this.whiteStones = 0;

        // Calculate dimensions based on current canvas size
        const sidebarWidth = 310;
        const availableSpace = Math.min(
            window.innerWidth - sidebarWidth,
            window.innerHeight,
        );
        this.adjustBoardDimensions(availableSpace);

        // Update 3D view if active
        if (this.isTorusView) {
            // Clear existing elements
            while (this.gameContainer.children.length > 0) {
                this.gameContainer.remove(this.gameContainer.children[0]);
            }

            // Recreate torus with new size
            this.torusGeometry = new THREE.TorusGeometry(10, 5, 100, 100);
            this.torusMaterial = new THREE.MeshPhongMaterial({
                color: 0xDEB887,
                side: THREE.DoubleSide,
            });
            this.torusMesh = new THREE.Mesh(
                this.torusGeometry,
                this.torusMaterial,
            );
            this.gameContainer.add(this.torusMesh);

            // Recreate grid and update board
            this.createTorusGrid();
            this.updateTorusBoard();
        }

        // Reset view position and zoom
        this.viewportX = 0;
        this.viewportY = 0;
        this.zoomLevel = 1;

        this.drawBoard();
        this.updatePlayerDisplay();
        this.updateStoneCount();
    }

    // Add new method to handle board dimension calculations
    adjustBoardDimensions(canvasSize) {
        const sidebarWidth = 310;
        const availableWidth = window.innerWidth - sidebarWidth;

        // Calculate cell size based on available width
        this.cellSize = Math.floor(
            (availableWidth / this.tileCount) / (this.boardSize - 1),
        );
        this.gridOffset = this.cellSize;

        // Calculate board dimensions with only one gridOffset
        this.singleBoardSize = (this.boardSize - 1) * this.cellSize +
            this.gridOffset;
        const totalSize = this.singleBoardSize * this.tileCount;

        // Update canvas size
        this.canvas.width = totalSize;
        this.canvas.height = totalSize;

        // Update canvas style
        this.canvas.style.width = `${totalSize}px`;
        this.canvas.style.height = `${totalSize}px`;

        // Position canvas
        this.canvas.style.left = `${sidebarWidth}px`;
        this.canvas.style.top = "0";
    }

    // Add these new methods for 3D hover and click handling
    handleTorusHover(event) {
        // Calculate mouse position in normalized device coordinates (-1 to +1)
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Update the picking ray with the camera and mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Calculate objects intersecting the picking ray
        const intersects = this.raycaster.intersectObject(this.torusMesh);

        if (intersects.length > 0) {
            const point = intersects[0].point;

            // Convert intersection point to board coordinates
            const boardCoords = this.pointToTorusCoords(point);

            // Only update if position changed
            if (
                !this.hoverPos ||
                this.hoverPos.row !== boardCoords.row ||
                this.hoverPos.col !== boardCoords.col
            ) {
                this.hoverPos = boardCoords;

                // Remove existing hover preview if it exists
                if (this.hoverMesh) {
                    this.torusMesh.remove(this.hoverMesh);
                }

                // Create new hover preview if move is valid
                if (this.isValidMove(boardCoords.row, boardCoords.col)) {
                    this.hoverMesh = this.create3DStone(
                        boardCoords.row / this.boardSize * Math.PI * 2,
                        boardCoords.col / this.boardSize * Math.PI * 2,
                        this.currentPlayer,
                        true, // Add this parameter to indicate preview stone
                    );
                    this.torusMesh.add(this.hoverMesh);
                }
            }
        } else {
            // Clear hover state when not hovering over the torus
            if (this.hoverPos) {
                this.hoverPos = null;
                if (this.hoverMesh) {
                    this.torusMesh.remove(this.hoverMesh);
                    this.hoverMesh = null;
                }
            }
        }
    }

    handleTorusClick(event) {
        if (!this.hoverPos) return;

        if (this.isValidMove(this.hoverPos.row, this.hoverPos.col)) {
            this.makeMove(this.hoverPos.row, this.hoverPos.col);
        }
    }

    pointToTorusCoords(point) {
        // Convert 3D point to torus coordinates
        const theta = Math.atan2(point.y, point.x);
        const phi = Math.atan2(
            point.z,
            Math.sqrt(point.x * point.x + point.y * point.y) - 10,
        );

        // Convert to board coordinates
        let row = Math.floor((theta / (Math.PI * 2) + 1) * this.boardSize) %
            this.boardSize;
        let col = Math.floor((phi / (Math.PI * 2) + 1) * this.boardSize) %
            this.boardSize;

        // Ensure positive values
        row = (row + this.boardSize) % this.boardSize;
        col = (col + this.boardSize) % this.boardSize;

        return { row, col };
    }

    showPopup() {
        this.infoPopup.style.display = "block";
        this.overlay.style.display = "block";
        // Only show start game button if it's the first time
        this.startGameBtn.style.display = this.hasStartedGame
            ? "none"
            : "block";
    }

    hidePopup() {
        this.infoPopup.style.display = "none";
        this.overlay.style.display = "none";
        this.hasStartedGame = true;
    }
}

// Start the game when the page loads
window.onload = () => new GoGame();
