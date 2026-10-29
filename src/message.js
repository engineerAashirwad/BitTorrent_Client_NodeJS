import {Buffer} from "node:buffer"
import {info_Hash} from "./torrent-parser.js"
import {genPeerId} from "./peer-id.js"

export const buildHandshake = function(torrentOBJ) {
    const handshakeBuffer = Buffer.alloc(68);

    handshakeBuffer.writeUInt8(19, 0);
    handshakeBuffer.write("BitTorrent protocol", 1);
    handshakeBuffer.writeBigUInt64BE(0n, 20);
    info_Hash(torrentOBJ).copy(handshakeBuffer, 28);
    genPeerId().copy(handshakeBuffer, 48);

    return handshakeBuffer;
};

export const buildKeepAlive = function() {
    return Buffer.alloc(4);
};

export const buildChoke = function() {
    const chokeBuf = Buffer.alloc(5);

    chokeBuf.writeUInt32BE(1, 0);
    chokeBuf.writeUInt8(0, 4);

    return chokeBuf;
};

export const buildUnchoke = function() {
    const unchokeBuf = Buffer.alloc(5);

    unchokeBuf.writeUInt32BE(1, 0);
    unchokeBuf.writeUInt8(1, 4);

    return unchokeBuf;
};

export const buildInterested = function() {
    const interestedBuf = Buffer.alloc(5);

    interestedBuf.writeUInt32BE(1, 0);
    interestedBuf.writeUInt8(2, 0);

    return interestedBuf;
};

export const buildUninterested = function() {
    const uninterestedBuf = Buffer.alloc(5);

    uninterestedBuf.writeUInt32BE(1, 0);
    uninterestedBuf.writeUInt8(3, 4);

    return uninterestedBuf;
};

export const buildHave = function(payload) {
    const haveBuf = Buffer.alloc(9);

    haveBuf.writeUInt32BE(5, 0);
    haveBuf.writeUInt8(4, 4);
    haveBuf.writeUInt32BE(payload, 5);

    return haveBuf;
};

export const buildRequest = function(payload) {
    const requestBuf = Buffer.alloc(17);

    requestBuf.writeUInt32BE(13, 0);
    requestBuf.writeUInt8(6, 4);
    requestBuf.writeUInt32BE(payload.index, 5);
    requestBuf.writeUInt32BE(payload.begin, 9);
    requestBuf.writeUInt32BE(payload.length, 13);

    return requestBuf;
};

export const parseMessage = function(msg) {
    const id = msg.length > 4 ? msg.readUInt8(4) : null;
};