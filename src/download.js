import net from "node:net"
import { Buffer } from "node:buffer"
import { buildHandshake, buildInterested } from "./message.js"

export const download = function (peer, torrentOBJ) {
    const socket = new net.Socket();

    socket.on("error", (err) => {
        console.log(`TCP Connection failed with Peer: ${peer.ip} : ${err.message}`);
    });

    socket.connect(peer.port, peer.ip, () => {
        console.log(`Connected to Peer: ${peer.ip}:${peer.port}`);

        const handshake = buildHandshake(torrentOBJ);
        socket.write(handshake);
    });

    onWholeMessage(socket, msg => {
        messageHandler(msg, socket);
    });

};

const onWholeMessage = function (socket, callback) {
    let savedBuf = Buffer.alloc(0);
    let handshakeMessage = true;

    socket.on("data", recievedBuf => {
        const messageLength = () => handshakeMessage ? savedBuf.readUInt8(0) + 49 : savedBuf.readUInt32BE(0) + 4;  // readUInt32BE(0) + <Length-Prefix> Length;
        savedBuf = Buffer.concat([savedBuf, recievedBuf]);

        while (savedBuf.length >= 4 && savedBuf.length >= messageLength()) {
            callback(savedBuf.subarray(0, messageLength()));
            savedBuf = savedBuf.subarray(messageLength());
            handshakeMessage = false;
        }
    });
};

const messageHandler = function(msg, socket) {
    if (isHandshake(msg)) {
        const interestedMsg = buildInterested();
        socket.write(interestedMsg);
    }
};

const isHandshake = function(msg) {
    return msg.length === msg.readUInt8(0) + 49 && msg.toString("utf-8", 1, 20) === "BitTorrent protocol";
};
