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