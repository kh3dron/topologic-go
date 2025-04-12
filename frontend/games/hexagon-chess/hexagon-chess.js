class HexChessGame {
    constructor() {
        this.canvas = document.getElementById("chessBoard");
        this.ctx = this.canvas.getContext("2d");
        this.cellSize = 35; // Reduced cell size for better fit
        this.gridOffset = 60; // Increased offset for coordinates

        // Hexagonal grid specific properties
        this.hexHeight = this.cellSize * Math.sqrt(3);
        this.hexWidth = this.cellSize * 2;
        this.hexVerticalSpacing = this.hexHeight;
        this.hexHorizontalSpacing = this.hexWidth * 3/4;

        // Board properties
        this.files = 'abcdefghijkl'.split('');
        this.ranks = Array.from({length: 11}, (_, i) => i + 1);
        this.board = new Map(); // Using a map for sparse board representation
        
        // Game state
        this.currentPlayer = "white";
        this.selectedPiece = null;
        this.hoverPos = null;
        this.possibleMoves = [];
        this.pieceImages = {}; // Store loaded piece images

        // Initialize valid positions for the hexagonal board
        this.validPositions = new Set([
            // Top section (black's side)
            'e11', 'f11', 'g11',                          // Row 11
            'd10', 'e10', 'f10', 'g10', 'h10',           // Row 10
            'c9', 'd9', 'e9', 'f9', 'g9', 'h9', 'i9',    // Row 9
            'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8', 'i8', 'j8',  // Row 8
            'a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7', 'i7', 'j7', 'k7',  // Row 7
            
            // Middle section
            'c6', 'd6', 'e6', 'f6', 'g6', 'h6', 'i6',    // Row 6
            
            // Bottom section (white's side)
            'a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1', 'i1', 'j1', 'k1',  // Row 1
            'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2', 'i2', 'j2',  // Row 2
            'c3', 'd3', 'e3', 'f3', 'g3', 'h3', 'i3',    // Row 3
            'd4', 'e4', 'f4', 'g4', 'h4',                // Row 4
            'e5', 'f5', 'g5'                             // Row 5
        ]);

        // Initialize the board layout
        this.boardLayout = {
            rows: 11,
            cols: 11,
            // For each row, specify the valid columns (files)
            rowStructure: {
                1:  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'],
                2:  ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
                3:  ['c', 'd', 'e', 'f', 'g', 'h', 'i'],
                4:  ['d', 'e', 'f', 'g', 'h'],
                5:  ['e', 'f', 'g'],
                6:  ['c', 'd', 'e', 'f', 'g', 'h', 'i'],
                7:  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'],
                8:  ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
                9:  ['c', 'd', 'e', 'f', 'g', 'h', 'i'],
                10: ['d', 'e', 'f', 'g', 'h'],
                11: ['e', 'f', 'g']
            }
        };

        // Calculate canvas size needed for the hexagonal board
        this.calculateCanvasSize();
        
        // Load pieces and initialize the game
        this.loadPieceImages();
        this.initializeBoard();

        // Add event listeners
        this.canvas.addEventListener("click", this.handleClick.bind(this));
        this.canvas.addEventListener("mousemove", this.handleHover.bind(this));
        this.canvas.addEventListener("mouseout", () => {
            this.hoverPos = null;
            this.drawBoard();
        });
    }

    calculateCanvasSize() {
        // Calculate the size needed for the hexagonal board
        // Adjust for perfect hexagon shape
        const width = this.hexHorizontalSpacing * 11 + this.gridOffset * 2;
        const height = this.hexHeight * 11 + this.gridOffset * 2;
        this.canvas.width = width;
        this.canvas.height = height;
    }

    // Convert algebraic notation (e.g., "e4") to internal coordinates
    algebraicToCoords(algebraic) {
        const file = algebraic.charAt(0);
        const rank = parseInt(algebraic.slice(1));
        return {
            x: this.files.indexOf(file),
            y: rank - 1
        };
    }

    // Convert internal coordinates to algebraic notation
    coordsToAlgebraic(x, y) {
        return this.files[x] + (y + 1);
    }

    initializeBoard() {
        // Clear the board
        this.board.clear();

        // Initialize the board based on Gliński's hexagonal chess layout
        const setup = {
            // Black pieces
            'a7': {type: 'pawn', color: 'black'},
            'b7': {type: 'rook', color: 'black'},
            'b8': {type: 'pawn', color: 'black'},
            'c8': {type: 'knight', color: 'black'},
            'c9': {type: 'pawn', color: 'black'},
            'd9': {type: 'bishop', color: 'black'},
            'd10': {type: 'pawn', color: 'black'},
            'e10': {type: 'queen', color: 'black'},
            'e11': {type: 'bishop', color: 'black'},
            'f11': {type: 'king', color: 'black'},
            'g11': {type: 'bishop', color: 'black'},
            'g10': {type: 'pawn', color: 'black'},
            'h10': {type: 'bishop', color: 'black'},
            'h9': {type: 'pawn', color: 'black'},
            'i9': {type: 'knight', color: 'black'},
            'i8': {type: 'pawn', color: 'black'},
            'j8': {type: 'rook', color: 'black'},
            'j7': {type: 'pawn', color: 'black'},

            // White pieces
            'a1': {type: 'pawn', color: 'white'},
            'b1': {type: 'rook', color: 'white'},
            'b2': {type: 'pawn', color: 'white'},
            'c2': {type: 'knight', color: 'white'},
            'c3': {type: 'pawn', color: 'white'},
            'd3': {type: 'bishop', color: 'white'},
            'd4': {type: 'pawn', color: 'white'},
            'e4': {type: 'queen', color: 'white'},
            'e5': {type: 'bishop', color: 'white'},
            'f5': {type: 'king', color: 'white'},
            'g5': {type: 'bishop', color: 'white'},
            'g4': {type: 'pawn', color: 'white'},
            'h4': {type: 'bishop', color: 'white'},
            'h3': {type: 'pawn', color: 'white'},
            'i3': {type: 'knight', color: 'white'},
            'i2': {type: 'pawn', color: 'white'},
            'j2': {type: 'rook', color: 'white'},
            'j1': {type: 'pawn', color: 'white'}
        };

        // Place pieces on the board
        for (const [pos, piece] of Object.entries(setup)) {
            const coords = this.algebraicToCoords(pos);
            this.board.set(pos, piece);
        }
    }

    isValidPosition(pos) {
        return this.validPositions.has(pos);
    }

    // Convert screen coordinates to hex grid position
    screenToHex(px, py) {
        // Adjust for grid offset and centering
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        px -= centerX;
        py -= centerY;
        
        // Convert to row and approximate column
        const row = Math.round(py / this.hexVerticalSpacing) + 6;
        
        // Get the row structure
        const rowFiles = this.boardLayout.rowStructure[row] || [];
        const rowOffset = (11 - rowFiles.length) * this.hexHorizontalSpacing / 2;
        
        // Calculate the column index
        const approxFileIndex = Math.round((px + (rowFiles.length * this.hexHorizontalSpacing / 2) - rowOffset) / this.hexHorizontalSpacing);
        
        // Convert to algebraic notation
        if (row >= 1 && row <= 11 && approxFileIndex >= 0 && approxFileIndex < rowFiles.length) {
            const pos = rowFiles[approxFileIndex] + row;
            return this.isValidPosition(pos) ? pos : null;
        }
        
        return null;
    }

    // Convert hex grid position to screen coordinates
    hexToScreen(pos) {
        const [file, ...rankDigits] = pos.split('');
        const rank = parseInt(rankDigits.join(''));
        
        // Calculate the center of the board
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // Get the row structure for this rank
        const rowFiles = this.boardLayout.rowStructure[rank];
        const fileIndex = rowFiles.indexOf(file);
        
        // Calculate position
        const rowOffset = (11 - rowFiles.length) * this.hexHorizontalSpacing / 2;
        const x = centerX + (fileIndex * this.hexHorizontalSpacing) - (rowFiles.length * this.hexHorizontalSpacing / 2) + rowOffset;
        const y = centerY + ((rank - 6) * this.hexVerticalSpacing);
        
        return {x, y};
    }

    getCellColor(pos) {
        const [file, ...rankDigits] = pos.split('');
        const rank = parseInt(rankDigits.join(''));
        
        // Get the column index within the row
        const rowFiles = this.boardLayout.rowStructure[rank];
        const fileIndex = rowFiles.indexOf(file);
        
        // Create a three-color pattern that matches the reference image
        const colorSum = (fileIndex + rank) % 3;
        switch (colorSum) {
            case 0: return "#DEB887"; // Light brown
            case 1: return "#D2691E"; // Medium brown
            case 2: return "#8B4513"; // Dark brown
        }
    }

    drawBoard() {
        // Clear the canvas
        this.ctx.fillStyle = "#f0f0f0";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw all valid positions
        for (const pos of this.validPositions) {
            const {x, y} = this.hexToScreen(pos);
            this.drawHexagon(x, y, this.getCellColor(pos));
            
            // Draw the piece if one exists at this position
            const piece = this.board.get(pos);
            if (piece) {
                this.drawPiece(piece, x, y);
            }
        }

        // Draw coordinates
        this.drawCoordinates();

        // Draw possible moves
        if (this.selectedPiece && this.possibleMoves.length > 0) {
            this.possibleMoves.forEach(pos => {
                const {x, y} = this.hexToScreen(pos);
                this.drawPossibleMove(x, y);
            });
        }

        // Draw hover highlight
        if (this.hoverPos) {
            const {x, y} = this.hexToScreen(this.hoverPos);
            this.drawHoverHighlight(x, y);
        }
    }

    drawHexagon(x, y, color) {
        this.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3;
            const px = x + this.cellSize * Math.cos(angle);
            const py = y + this.cellSize * Math.sin(angle);
            if (i === 0) {
                this.ctx.moveTo(px, py);
            } else {
                this.ctx.lineTo(px, py);
            }
        }
        this.ctx.closePath();
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.strokeStyle = "black";
        this.ctx.stroke();
    }

    drawCoordinates() {
        this.ctx.fillStyle = "black";
        this.ctx.font = "12px Arial";
        
        // Draw coordinates for edge cells
        for (const pos of this.validPositions) {
            const {x, y} = this.hexToScreen(pos);
            const [file, ...rankDigits] = pos.split('');
            const rank = parseInt(rankDigits.join(''));
            
            // Only draw coordinates for edge cells
            if (rank === 1 || rank === 11 || 
                file === 'a' || file === 'k' ||
                (rank === 6 && (file === 'c' || file === 'i'))) {
                this.ctx.fillText(pos, x - 10, y - this.cellSize - 5);
            }
        }
    }

    drawPiece(piece, x, y) {
        const size = this.cellSize * 0.8;
        const padding = size * 0.1;

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
                x - size/2 + padding,
                y - size/2 + padding,
                size - (padding * 2),
                size - (padding * 2)
            );
        }
    }

    drawPossibleMove(x, y) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.cellSize * 0.3, 0, Math.PI * 2);
        this.ctx.fillStyle = "rgba(0, 255, 0, 0.3)";
        this.ctx.fill();
        this.ctx.strokeStyle = "rgba(0, 200, 0, 0.5)";
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    drawHoverHighlight(x, y) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.cellSize * 0.4, 0, Math.PI * 2);
        this.ctx.fillStyle = "rgba(0, 255, 0, 0.2)";
        this.ctx.fill();
        this.ctx.strokeStyle = "rgba(0, 200, 0, 0.5)";
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    handleClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const pos = this.screenToHex(x, y);

        if (this.selectedPiece) {
            // Check if the move is valid
            const isValidMove = this.possibleMoves.some(
                (p) => p === pos
            );

            if (isValidMove) {
                // Move the piece
                const piece = this.board.get(this.selectedPiece);
                this.board.set(pos, piece);
                this.board.delete(this.selectedPiece);
                this.currentPlayer = this.currentPlayer === "white" ? "black" : "white";
            }
            this.selectedPiece = null;
            this.possibleMoves = [];
        } else {
            const piece = this.board.get(pos);
            if (piece && piece.color === this.currentPlayer) {
                this.selectedPiece = pos;
                this.possibleMoves = this.getPossibleMoves(pos);
            }
        }

        this.drawBoard();
    }

    handleHover(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        this.hoverPos = this.screenToHex(x, y);
        this.drawBoard();
    }

    getPossibleMoves(pos) {
        const piece = this.board.get(pos);
        if (!piece) return [];

        const moves = [];
        const coords = this.algebraicToCoords(pos);

        // Define movement patterns for each piece type
        const patterns = {
            pawn: this.getPawnMoves.bind(this),
            knight: this.getKnightMoves.bind(this),
            bishop: this.getBishopMoves.bind(this),
            rook: this.getRookMoves.bind(this),
            queen: this.getQueenMoves.bind(this),
            king: this.getKingMoves.bind(this)
        };

        if (patterns[piece.type]) {
            return patterns[piece.type](pos, piece.color);
        }

        return moves;
    }

    // Implement specific movement patterns for each piece type
    // These need to be completely rewritten for hexagonal movement
    getPawnMoves(pos, color) {
        // TODO: Implement hexagonal pawn movement
        return [];
    }

    getKnightMoves(pos, color) {
        // TODO: Implement hexagonal knight movement
        return [];
    }

    getBishopMoves(pos, color) {
        // TODO: Implement hexagonal bishop movement
        return [];
    }

    getRookMoves(pos, color) {
        // TODO: Implement hexagonal rook movement
        return [];
    }

    getQueenMoves(pos, color) {
        // TODO: Implement hexagonal queen movement
        return [];
    }

    getKingMoves(pos, color) {
        // TODO: Implement hexagonal king movement
        return [];
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
                        this.drawBoard();
                    }
                };
                img.src = `../../chess_icons/${color}_${piece}.webp`;
                this.pieceImages[`${color}_${piece}`] = img;
            });
        });
    }
}

// Initialize the game
const game = new HexChessGame();
