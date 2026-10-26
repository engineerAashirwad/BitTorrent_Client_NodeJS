import dgram from "node:dgram"
import crypto, { createPrivateKey } from "node:crypto"
import {Buffer} from "node:buffer"
import {announceTracker, info_Hash, itemSize} from "./torrent-parser.js"
import {genPeerId} from "./peer-id.js"

export const getPeersList = function (torrentOBJ, callback) {
    const socket = dgram.createSocket("udp4");

    const url = new URL(announceTracker(torrentOBJ));

    const connectionRequest = buildConnectionReq();

    socket.send(connectionRequest, 0, connectionRequest.length, url.port, url.hostname, (err, reqBytes) => {
        if (err) {
            throw new Error(`An Error occurred while sending the connection request to the tracker! Error message: ${err.message}`);
        }
        console.log(`Connection request of size ${reqBytes} bytes sent to ${url.hostname}:${url.port}`);
    });

    socket.on("message", (response) => {
        if (responseType(response) === "connect") {
            const connectionResponse = parseConnectionRes(response);

            console.log(`Recieved Connection id, length: ${connectionResponse.connectionID.length} , hex: ${connectionResponse.connectionID.toString("hex")} , Sending Announce Request...`);

            const announceRequest = buildAnnounceReq(connectionResponse.connectionID, torrentOBJ);

            socket.send(announceRequest, 0, announceRequest.length, url.port, url.hostname);    // Needs callback for error handling and "Request sent!" Log.
        }
        else if (responseType(response) === "announce") {
            const announceResponse = parseAnnounceRes(response);
            console.log(`Success! Found ${announceResponse.peers.length} peers.`);
            console.log(`There are ${announceResponse.leechers} leechers and there are ${announceResponse.seeders} seeders. The interval time is: ${announceResponse.interval} seconds.`);

            callback(announceResponse.peers);

            socket.close();

        };
    });
};

const buildConnectionReq = function() {
    const connectMessage = Buffer.alloc(16);

    connectMessage.writeBigUInt64BE(0x41727101980n, 0); // Hardcoded Bittorrent Specification constant.
    connectMessage.writeUInt32BE(0, 8);    // Action = 0; CONNECT
    crypto.randomBytes(4).copy(connectMessage, 12);

    return connectMessage;
};

const parseConnectionRes = function(res) {
    return {
        action: res.readUInt32BE(0),
        transactionID: res.readUInt32BE(4),
        connectionID: res.subarray(8, 16),
    };
};

const responseType = function(res) {
    if(res.readUInt32BE(0) === 0) {
        return "connect";
    }
    else if (res.readUInt32BE(0) === 1) {
        return "announce";
    }
};

const buildAnnounceReq = function(connectionID, torrentOBJ, PORT = 6881) {
    const announceReqBuff = Buffer.alloc(98);

    connectionID.copy(announceReqBuff, 0);
    announceReqBuff.writeUInt32BE(1, 8);    // Action = 1; ANNOUNCE
    crypto.randomBytes(4).copy(announceReqBuff, 12);
    info_Hash(torrentOBJ).copy(announceReqBuff, 16);
    genPeerId().copy(announceReqBuff, 36);
    announceReqBuff.writeBigUInt64BE(0n, 56);
    itemSize(torrentOBJ).copy(announceReqBuff, 64);
    announceReqBuff.writeBigUInt64BE(0n, 72);
    announceReqBuff.writeUInt32BE(0, 80);
    announceReqBuff.writeUInt32BE(0, 84);
    crypto.randomBytes(4).copy(announceReqBuff, 88);
    announceReqBuff.writeInt32BE(-1, 92);
    announceReqBuff.writeUint16BE(PORT, 96);

    return announceReqBuff;
};

const parseAnnounceRes = function(res) {
    return {
        action: res.readUInt32BE(0),
        transactionID: res.readUInt32BE(4),
        interval: res.readUInt32BE(8),
        leechers: res.readUInt32BE(12),
        seeders: res.readUInt32BE(16),
        peers: groupAndParsePeers(res.subarray(20)),
    };
};

const groupAndParsePeers = function(peerBuffer) {
    const peers = [];

    for(let i = 0; i < peerBuffer.length; i += 6) {
        peers.push({
            ip: peerBuffer.subarray(i, i + 4).join("."),
            port: peerBuffer.readUInt16BE(i + 4),
        });
    }

    return peers;
};
