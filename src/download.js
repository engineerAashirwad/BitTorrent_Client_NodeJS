import net from "node:net"
import fs from "node:fs"
import path from "node:path"
import { Buffer } from "node:buffer"
import { buildHandshake, buildInterested, parseMessage, buildRequest } from "./message.js"
import { getPeersList } from "./tracker.js"
import Pieces from "./Pieces.js"
import Queue from "./Queue.js"

let pendingWrites = 0;
let isFileClosed = false;

export default function (torrentOBJ, outputPath) {

    getPeersList(torrentOBJ, (peers) => {

        const pieces = new Pieces(torrentOBJ);
        const file = fs.openSync(outputPath, "w");
        
        console.log(`The List of peers: `, peers);

        peers.forEach((peer) => {
            download(peer, torrentOBJ, pieces, file);
        });
    });
};

const initializeFiles = function(torrentOBJ, outputPath) {

    if(torrentOBJ.info.files) {
        fs.mkdirSync(outputPath, {recursive: true});

        let currentOffset = 0;

        return torrentOBJ.info.files.map((fileOBJ) => {

            const pathSegments = fileOBJ.path.map(segment => Buffer.from(segment).toString("utf-8"));
            const fullFilePath = path.join(outputPath, ...pathSegments);

            fs.mkdirSync(path.dirname(fullFilePath), {recursive: true});

            const start = currentOffset;
            const end = currentOffset + fileOBJ.length;
            currentOffset = end;

            return {
                fd: fs.openSync(fullFilePath, "w"),
                fullPath: fullFilePath,
                length: fileOBJ.length,
                start,
                end,
            };
        });
    }

    return [
        {
            fd: fs.openSync(outputPath, "w"),
            fullPath: outputPath,
            length: torrentOBJ.info.length,
            start: 0,
            end: torrentOBJ.info.length,
        },
    ];
};

const download = function (peer, torrentOBJ, pieces, file) {
    const socket = new net.Socket();

    socket.on("error", (err) => {
        console.log(`TCP Connection failed with Peer: ${peer.ip} : ${err.message}`);
    });

    socket.connect(peer.port, peer.ip, () => {
        console.log(`Connected to Peer: ${peer.ip}:${peer.port}`);

        const handshake = buildHandshake(torrentOBJ);
        socket.write(handshake);
    });

    const queue = new Queue(torrentOBJ);
    onWholeMessage(socket, msg => {
        messageHandler(msg, socket, pieces, queue, torrentOBJ, file);
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

const messageHandler = function (msg, socket, pieces, queue, torrentOBJ, file) {
    if (isHandshake(msg)) {
        const interestedMsg = buildInterested();
        socket.write(interestedMsg);
    }
    else {
        const m = parseMessage(msg);

        if (m.id === 0) {
            chokeHandler(socket, queue);
        }
        if (m.id === 1) {
            unchokeHandler(socket, pieces, queue);
        }
        if (m.id === 4) {
            haveHandler(socket, pieces, queue, m.payload);
        }
        if (m.id === 5) {
            bitfieldHandler(socket, pieces, queue, m.payload);
        }
        if (m.id === 7) {
            pieceHandler(socket, pieces, queue, torrentOBJ, file, m.payload);
        }
    }
};

const isHandshake = function (msg) {
    return msg.length === msg.readUInt8(0) + 49 && msg.toString("utf-8", 1, 20) === "BitTorrent protocol";
};

const chokeHandler = function (socket, queue) {
    queue.choked = true; // We can loose valid peers by closing the connection using socket.end() Some send choke message after handshake.
};

const unchokeHandler = function (socket, pieces, queue) {
    queue.choked = false;
    requestPiece(socket, pieces, queue);
};

const haveHandler = function (socket, pieces, queue, payload) {
    const pieceIndex = payload.readUInt32BE(0);
    const queueEmpty = queue.length() === 0;
    queue.queue(pieceIndex);
    if(queueEmpty) {
        requestPiece(socket, pieces, queue);
    }
};

const bitfieldHandler = function(socket, pieces, queue, payload) {
    const queueEmpty = queue.length() === 0;

    payload.forEach((byte, i) => {
        for (let j = 0; j < 8; j++)  {
            if(byte % 2) {
                queue.queue(i * 8 + 7 - j);
            }
            byte = Math.floor(byte / 2);
        }
    });

    if(queueEmpty) {
        requestPiece(socket, pieces, queue);
    }
};

const pieceHandler = function (socket, pieces, queue, torrentOBJ, file, pieceResponse) {

    if(pieces.isDone() || isFileClosed) {
        socket.end();
        return;
    }

    pieces.addReceived(pieceResponse);
    pieces.printPercentDone();

    const offset = pieceResponse.index * torrentOBJ.info["piece length"] + pieceResponse.begin;

    pendingWrites++;
    fs.write(file, pieceResponse.block, 0, pieceResponse.block.length, offset, (err) => {
        pendingWrites--;
        if (err) {
            console.log(`Error while writing to disk! ${err}`);
        }

        if(pieces.isDone() && pendingWrites === 0 && !isFileClosed) {
            isFileClosed = true;
            console.log("Download Completed!!!");
            fs.close(file, (closeErr) => {
                if(closeErr) {
                    console.log(`Error while closing the file! Error: ${closeErr.message}`);
                }
                process.exit(0);
            });
        }
    });

    if(pieces.isDone()){
        socket.end();
    }
    else{
        requestPiece(socket, pieces, queue);
    }
};

const requestPiece = function (socket, pieces, queue) {
    if (queue.choked) {
        return null;
    }

    while (queue.length()) {
        const pieceBlock = queue.deque();
        if (pieces.needed(pieceBlock)) {
            socket.write(buildRequest(pieceBlock));
            pieces.addRequested(pieceBlock);
            break;
        }
    }
};
