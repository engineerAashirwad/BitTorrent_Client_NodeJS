import dgram from "node:dgram"
import crypto from "node:crypto"
import {Buffer} from "node:buffer"
import {announceTracker} from "./torrent-parser.js"

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

            console.log(`Recieved Connection id, buffer: ${connectionResponse.connectionID} , hex: ${connectionResponse.connectionID.toString("hex")}`);
        }
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
