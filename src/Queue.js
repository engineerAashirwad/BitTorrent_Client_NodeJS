import {BLOCK_LEN, blocksPerPiece, blockLength} from "./torrent-parser.js"

export default class Queue {
    constructor(torrentOBJ) {
        this._torrent = torrentOBJ;
        this._queue = [];
        this.choked = true;
    }

    queue(pieceIndex) {
        const nBlocks = blocksPerPiece(this._torrent, pieceIndex);
        for(let i = 0; i < nBlocks; i++) {
            const pieceBlock = {
                index: pieceIndex,
                begin: i * BLOCK_LEN,
                length: blockLength(this._torrent, pieceIndex, i),
            };
            this._queue.push(pieceBlock);
        }
    }

    deque() {
        return this._queue.shift();
    }

    peek() {
        return this._queue[0];
    }

    length() {
        return this._queue.length;
    }
};