import fs from "node:fs"
import bencode from "bencode"
import { Buffer } from "node:buffer"
import crypto from "node:crypto"

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


