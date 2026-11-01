import {BLOCK_LEN, blocksPerPiece} from "./torrent-parser.js"

export default class Pieces {
    constructor(torrentOBJ) {

        function buildPiecesArray() {
            const nPieces = torrentOBJ.info.pieces.length / 20;
            const arr = new Array(nPieces).fill(null);
            return arr.map((_, i) => new Array(blocksPerPiece(torrentOBJ, i)).fill(false));
        }

        this._requested = buildPiecesArray();
        this._received = buildPiecesArray();
    }

    addRequested(pieceBlock) {
        const blockIndex = pieceBlock.begin / BLOCK_LEN;
        this._requested[pieceBlock.index][blockIndex] = true;
    }

    addReceived(pieceBlock) {
        const blockIndex = pieceBlock.begin / BLOCK_LEN;
        this._received[pieceBlock.index][blockIndex] = true;
    }

    needed(pieceBlock) {
        if (this._requested.every((blocks) => blocks.every(i => i))) {
            this._requested = this._received.map((blocks) => blocks.slice());
        }
        const blockIndex = pieceBlock.begin / BLOCK_LEN;
        return !this._requested[pieceBlock.index][blockIndex];
    }

    isDone() {
        return this._received.every((blocks) => blocks.every(i => i));
    }
};