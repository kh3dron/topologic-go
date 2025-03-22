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
        this.isTopologicMode = true;
        this.tiledView = false;
        this.tileCount = 3;
        this.spacing = 0; // Remove spacing between boards
        
        // Calculate total size needed for one board
        this.singleBoardSize = (this.boardSize - 1) * this.cellSize + (this.gridOffset * 2);
        // Calculate canvas size needed for 3x3 grid with no spacing
        const totalSize = (this.singleBoardSize * this.tileCount);
        this.canvas.width = totalSize;
        this.canvas.height = totalSize;

        this.canvas.addEventListener('click', this.handleClick.bind(this));
        document.getElementById('passButton').addEventListener('click', this.pass.bind(this));
        document.getElementById('resetButton').addEventListener('click', this.resetGame.bind(this));

        // Add mousemove and mouseout event listeners
        this.canvas.addEventListener('mousemove', this.handleHover.bind(this));
        this.canvas.addEventListener('mouseout', () => {
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
        
        // Initialize 3D view
        this.init3D();

        // Add view selection listeners
        document.getElementById('tessellatedView').addEventListener('click', () => this.setView(false));
        document.getElementById('torusView').addEventListener('click', () => this.setView(true));

        this.drawBoard();
    }

    init3D() {
        // Create scene
        this.scene = new THREE.Scene();
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            this.canvas.width / this.canvas.height,
            0.1,
            1000
        );
        this.camera.position.set(0, -25, 20);
        
        // Create renderer with antialias
        this.renderer = new THREE.WebGLRenderer({ 
            alpha: true,
            antialias: true
        });
        this.renderer.setSize(this.canvas.width, this.canvas.height);
        this.renderer.setClearColor(0xffffff, 1);
        
        // Create a container for the game elements that will be controlled by OrbitControls
        this.gameContainer = new THREE.Group();
        this.scene.add(this.gameContainer);
        
        // Create orbit controls - now controlling only the game container
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        // Create torus geometry
        this.torusGeometry = new THREE.TorusGeometry(10, 5, 100, 100);
        this.torusMaterial = new THREE.MeshPhongMaterial({
            color: 0xDEB887,
            side: THREE.DoubleSide
        });
        this.torusMesh = new THREE.Mesh(this.torusGeometry, this.torusMaterial);
        this.gameContainer.add(this.torusMesh);
        
        // Add brighter lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);  // Increased from 0.3
        this.scene.add(ambientLight);
        
        // Store light and light sphere as class properties
        this.pointLight = new THREE.PointLight(0xffffff, 1.5, 100);  // Increased from 1.0
        this.lightSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffff00 })
        );
        
        // Set initial positions
        this.updateLightPosition();
        
        this.scene.add(this.pointLight);
        this.scene.add(this.lightSphere);
        
        // Add grid lines to the container
        this.createTorusGrid();
        
        // Start animation loop
        this.animate();
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
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.isTopologicMode) {
            if (this.isTorusView) {
                // Draw single board for torus view
                this.ctx.fillStyle = '#DEB887';
                this.ctx.fillRect(0, 0, this.singleBoardSize, this.singleBoardSize);
                this.ctx.strokeStyle = '#8B4513';
                this.ctx.strokeRect(0, 0, this.singleBoardSize, this.singleBoardSize);
                this.drawSingleBoard(0, 0);
            } else {
                // Draw tessellated view (3x3 grid)
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
            if (this.isTopologicMode && !this.isTorusView) {
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
        if (this.isTorusView) {
            this.updateTorusBoard();
        } else {
            this.drawBoard();
        }
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
        if (this.isTorusView) {
            // Remove existing stones
            while(this.torusMesh.children.length > 0) {
                this.torusMesh.remove(this.torusMesh.children[0]);
            }
        }
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
    }

    // Helper function to get torus-adjusted coordinates
    getTorusCoords(row, col) {
        if (!this.isTopologicMode) return { row, col };
        return {
            row: ((row % this.boardSize) + this.boardSize) % this.boardSize,
            col: ((col % this.boardSize) + this.boardSize) % this.boardSize
        };
    }

    // Add new method to handle view changes
    setView(isTorusView) {
        this.isTorusView = isTorusView;
        document.getElementById('tessellatedView').classList.toggle('active', !isTorusView);
        document.getElementById('torusView').classList.toggle('active', isTorusView);
        
        if (isTorusView) {
            // Switch to 3D view
            this.canvas.style.display = 'none';
            document.body.appendChild(this.renderer.domElement);
            this.renderer.domElement.classList.add('three-js'); // Add the three-js class
            this.updateTorusBoard();
            
            // Reset camera position for better view
            this.camera.position.set(0, -30, 15);
            this.camera.lookAt(0, 0, 0);
            this.controls.update();
        } else {
            // Switch back to 2D view
            this.renderer.domElement.remove();
            this.canvas.style.display = 'block';
            this.drawBoard();
        }
    }

    updateTorusBoard() {
        // Remove existing stones
        while(this.torusMesh.children.length > 0) {
            this.torusMesh.remove(this.torusMesh.children[0]);
        }

        // Add stones to the torus
        for (let i = 0; i < this.boardSize; i++) {
            for (let j = 0; j < this.boardSize; j++) {
                if (this.board[i][j]) {
                    const stone = this.create3DStone(
                        i / this.boardSize * Math.PI * 2,
                        j / this.boardSize * Math.PI * 2,
                        this.board[i][j]
                    );
                    this.torusMesh.add(stone);
                }
            }
        }
    }

    create3DStone(theta, phi, color) {
        const R = 10; // major radius
        const r = 5;  // minor radius
        
        // Calculate stone radius - make it small enough to prevent overlap
        const stoneRadius = (2 * Math.PI * r / this.boardSize) * 0.3; // Reduced to 0.3 for smaller stones
        
        // Create sphere geometry
        const geometry = new THREE.SphereGeometry(stoneRadius, 32, 32);
        const material = new THREE.MeshPhongMaterial({
            color: color === 'black' ? 0x000000 : 0xffffff
        });
        const stone = new THREE.Mesh(geometry, material);

        // Calculate position with a small offset to prevent clipping
        const surfaceOffset = 0.1;
        const normalX = Math.cos(theta) * Math.cos(phi);
        const normalY = Math.sin(theta) * Math.cos(phi);
        const normalZ = Math.sin(phi);
        
        const localRadius = R + r * Math.cos(phi);
        stone.position.x = (localRadius * Math.cos(theta)) + (normalX * surfaceOffset);
        stone.position.y = (localRadius * Math.sin(theta)) + (normalY * surfaceOffset);
        stone.position.z = (r * Math.sin(phi)) + (normalZ * surfaceOffset);

        return stone;
    }

    createTorusGrid() {
        const R = 10; // major radius
        const r = 5;  // minor radius
        const segments = 50;

        // Create lines material - making it much more visible
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x000000,
            linewidth: 3  // Note: this may not work in WebGL
        });

        // Create vertical lines
        for (let i = 0; i < this.boardSize; i++) {
            const theta = (i / this.boardSize) * Math.PI * 2;
            const points = [];
            
            // Create points along the torus surface
            for (let t = 0; t <= segments; t++) {
                const phi = (t / segments) * Math.PI * 2;
                // Slightly offset the lines outward from the surface
                const offset = 0.1;
                const x = (R + (r + offset) * Math.cos(phi)) * Math.cos(theta);
                const y = (R + (r + offset) * Math.cos(phi)) * Math.sin(theta);
                const z = (r + offset) * Math.sin(phi);
                points.push(new THREE.Vector3(x, y, z));
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.gameContainer.add(line);  // Add to container instead of scene
        }

        // Create horizontal lines
        for (let i = 0; i < this.boardSize; i++) {
            const phi = (i / this.boardSize) * Math.PI * 2;
            const points = [];
            
            for (let t = 0; t <= segments; t++) {
                const theta = (t / segments) * Math.PI * 2;
                // Slightly offset the lines outward from the surface
                const offset = 0.1;
                const x = (R + (r + offset) * Math.cos(phi)) * Math.cos(theta);
                const y = (R + (r + offset) * Math.cos(phi)) * Math.sin(theta);
                const z = (r + offset) * Math.sin(phi);
                points.push(new THREE.Vector3(x, y, z));
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.gameContainer.add(line);  // Add to container instead of scene
        }
    }
}

// Start the game when the page loads
window.onload = () => new GoGame();
