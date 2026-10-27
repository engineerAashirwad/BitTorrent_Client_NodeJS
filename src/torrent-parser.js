import fs from "node:fs"
import bencode from "bencode"
import { Buffer } from "node:buffer"
import crypto from "node:crypto"

export const BLOCK_LEN = Math.pow(2, 14); // 2^14 = 16,384 bytes / 16 KiB

export const parseTorrent = function (filePath) {
    const torrentBuffer = fs.readFileSync(filePath);
    return bencode.decode(torrentBuffer);
};

export const announceTracker = function (torrentOBJ) {
    return Buffer.from(torrentOBJ.announce).toString("utf-8");
};

export const info_Hash = function(torrentOBJ) {
    const infoBuffer = bencode.encode(torrentOBJ.info);
    return crypto.createHash("sha1").update(infoBuffer).digest();
};

export const itemSize = function(torrentOBJ) {
    const sizeBuffer = Buffer.alloc(8);
    const totalSize = BigInt(torrentOBJ.info.files ? torrentOBJ.info.files.reduce((total, file) => total + file.length, 0) : torrentOBJ.info.length);

    sizeBuffer.writeBigUInt64BE(totalSize);

    return sizeBuffer;
};

export const pieceLength = function(torrentOBJ, pieceIndex) {

    const totalLength = itemSize(torrentOBJ).readBigUInt64BE(0);
    const pieceLength = BigInt(torrentOBJ.info["piece length"]);

    const lastPieceLength = totalLength % pieceLength;
    const lastPieceIndex = totalLength / pieceLength;   // BigInt division floors automatically.

    if (lastPieceIndex === BigInt(pieceIndex) && lastPieceLength !== 0n) {
        return Number(lastPieceLength);
    }

    return Number(pieceLength);
};

export const blocksPerPiece = function(torrentOBJ, pieceIndex) {
    const pieceLen = pieceLength(torrentOBJ, pieceIndex);
    return Math.ceil(pieceLen / BLOCK_LEN);
};

export const blockLength = function(torrentOBJ, pieceIndex, blockIndex) {
    const pieceLen = pieceLength(torrentOBJ, pieceIndex);

    const lastBlockLength = pieceLen % BLOCK_LEN;
    const lastBlockIndex = pieceLen / BLOCK_LEN;

    if (lastBlockIndex === blockIndex && lastBlockLength !== 0) {
        return lastBlockLength;
    }

    return BLOCK_LEN;
};
