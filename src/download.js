import net from "node:net"
import { Buffer } from "node:buffer"
import { buildHandshake, buildInterested, parseMessage, buildRequest } from "./message.js"
import { getPeersList } from "./tracker.js"

export default function (torrentOBJ) {
    const requested = [];

    getPeersList(torrentOBJ, (peers) => {
        console.log(`The List of peers: `, peers);
        peers.forEach((peer) => {
            download(peer, torrentOBJ, requested);
        });
    });
};

const download = function (peer, torrentOBJ, requested) {
    const socket = new net.Socket();

    socket.on("error", (err) => {
        console.log(`TCP Connection failed with Peer: ${peer.ip} : ${err.message}`);
    });

    socket.connect(peer.port, peer.ip, () => {
        console.log(`Connected to Peer: ${peer.ip}:${peer.port}`);

        const handshake = buildHandshake(torrentOBJ);
        socket.write(handshake);
    });

    const queue = [];
    onWholeMessage(socket, msg => {
        messageHandler(msg, socket, requested, queue);
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

const messageHandler = function (msg, socket, requested, queue) {
    if (isHandshake(msg)) {
        const interestedMsg = buildInterested();
        socket.write(interestedMsg);
    }
    else {
        const m = parseMessage(msg);

        if (m.id === 0) {
            chokeHandler();
        }
        if (m.id === 1) {
            unchokeHandler();
        }
        if (m.id === 4) {
            haveHandler(m.payload, socket, requested, queue);
        }
        if (m.id === 5) {
            bitfieldHandler(m.payload);
        }
        if (m.id === 7) {
            pieceHandler(m.payload, socket, requested, queue);
        }
    }
};

const isHandshake = function (msg) {
    return msg.length === msg.readUInt8(0) + 49 && msg.toString("utf-8", 1, 20) === "BitTorrent protocol";
};

const haveHandler = function (payload, socket, requested, queue) {
    const pieceIndex = payload.readUInt32BE(0);
    queue.push(pieceIndex);
    if (queue.length === 1) {
        requestPiece(socket, requested, queue);
    }
};

const pieceHandler = function(payload, socket, requested, queue) {
    queue.shift();
    requestPiece(socket, requested, queue);
};

const requestPiece = function(socket, requested, queue) {
    if(requested[queue[0]]) {
        queue.shift();
    }
    else {
        socket.write(buildRequest(pieceIndex));
    }
};
