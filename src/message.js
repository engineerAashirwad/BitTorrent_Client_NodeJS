import {Buffer} from "node:buffer"
import {info_Hash} from "./torrent-parser.js"
import {genPeerId} from "./peer-id.js"

export const buildHandshake = function(torrentOBJ) {
    const handshakeBuffer = Buffer.alloc(68);

    handshakeBuffer.writeUInt8(19, 0);
    handshakeBuffer.write("BitTorrent protocol", 1);
    handshakeBuffer.writeBigUInt64BE(0, 20);
    info_Hash(torrentOBJ).copy(handshakeBuffer, 28);
    genPeerId().copy(handshakeBuffer, 48);

    return handshakeBuffer;
};