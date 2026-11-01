import net from "node:net"
import { Buffer } from "node:buffer"
import { buildHandshake, buildInterested, parseMessage, buildRequest } from "./message.js"
import { getPeersList } from "./tracker.js"
import Pieces from "./Pieces.js"

export default function (torrentOBJ) {

    getPeersList(torrentOBJ, (peers) => {
        const pieces = new Pieces(torrentOBJ.info.pieces.length / 20);
        console.log(`The List of peers: `, peers);
        peers.forEach((peer) => {
            download(peer, torrentOBJ, pieces);
        });
    });
};

const download = function (peer, torrentOBJ, pieces) {
    const socket = new net.Socket();

    socket.on("error", (err) => {
        console.log(`TCP Connection failed with Peer: ${peer.ip} : ${err.message}`);
    });

    socket.connect(peer.port, peer.ip, () => {
        console.log(`Connected to Peer: ${peer.ip}:${peer.port}`);

        const handshake = buildHandshake(torrentOBJ);
        socket.write(handshake);
    });

    const queue = { choked: true, queue: [] };
    onWholeMessage(socket, msg => {
        messageHandler(msg, socket, pieces, queue);
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

const messageHandler = function (msg, socket, pieces, queue) {
    if (isHandshake(msg)) {
        const interestedMsg = buildInterested();
        socket.write(interestedMsg);
    }
    else {
        const m = parseMessage(msg);

        if (m.id === 0) {
            chokeHandler(socket);
        }
        if (m.id === 1) {
            unchokeHandler(socket, pieces, queue);
        }
        if (m.id === 4) {
            haveHandler(m.payload);
        }
        if (m.id === 5) {
            bitfieldHandler(m.payload);
        }
        if (m.id === 7) {
            pieceHandler(m.payload);
        }
    }
};

const isHandshake = function (msg) {
    return msg.length === msg.readUInt8(0) + 49 && msg.toString("utf-8", 1, 20) === "BitTorrent protocol";
};

const chokeHandler = function (socket) {
    socket.end();
};

const unchokeHandler = function (socket, pieces, queue) {
    queue.choked = false;
    requestPiece(socket, pieces, queue);
};

const haveHandler = function () {

};

const pieceHandler = function () {

};

const requestPiece = function (socket, pieces, queue) {
    if (queue.choked) {
        return null;
    }

    while (queue.queue.length) {
        const pieceIndex = queue.shift();
        if (pieces.needed(pieceIndex)) {
            socket.write(buildRequest(pieceIndex));
            pieces.addRequested(pieceIndex);
            break;
        }
    }
};
