import dgram from "node:dgram"
import crypto from "node:crypto"
import { Buffer } from "node:buffer"
import { announceTrackerList, info_Hash, itemSize } from "./torrent-parser.js"
import { genPeerId } from "./peer-id.js"

export const getPeersList = function (torrentOBJ, callback) {
    const socket = dgram.createSocket("udp4");
    const trackerURLs = announceTrackerList(torrentOBJ);

    let isDone = false;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    socket.on("error", (err) => {
        console.log(`UDP Socket Error!! ${err.message}`);
    });

    const sendRequestToAllTrackers = function() {
        if(isDone) {
            return;
        }

        if(retryCount >= MAX_RETRIES) {
            console.log("All UDP Trackers Timed Out!!! Check your Internet Connection and also make sure every tracker is Online.");
            clearInterval(retryIntervalTimer);
            socket.close();
            return;
        }

        retryCount++;
        console.log(`\n[Attempt ${retryCount}/${MAX_RETRIES}] Querying ${trackerURLs.length} UDP Trackers...`);

        for (const trackerUrl of trackerURLs) {
            let urlTracker;
            try {
                urlTracker = new URL(trackerUrl);
            } catch {
                continue;
            }

            const PORT = Number(urlTracker.port);
            const connectionRequest = buildConnectionReq();

            socket.send(connectionRequest, 0, connectionRequest.length, PORT, urlTracker.hostname, (err, reqBytes) => {
                if(err) {
                    console.log(`Skipping Unreachable Tracker ${urlTracker.hostname}:${PORT} (${err.message})`);
                    return;
                }
                console.log(`Connection Request of ${reqBytes} Bytes(B) sent to ${urlTracker.hostname}:${PORT}`);
            });
        }
    };

    socket.on("message", (response, rInfo) => {
        if(isDone || response.length < 8) {
            return;
        }

        if(responseType(response) === "connect") {
            const connectionResponse = parseConnectionRes(response);

            console.log(`Received Connection ID (${connectionResponse.connectionID.toString("hex")}) from ${rInfo.address}:${rInfo.port}, Sending Announce Request...`);

            const announceRequest = buildAnnounceReq(connectionResponse.connectionID, torrentOBJ);

            socket.send(announceRequest, 0, announceRequest.length, rInfo.port, rInfo.address, (err) => {
                if(err) {
                    console.log(`Failed to send Announce Request to ${rInfo.address}:${rInfo.port} ! Error: ${err.message}`);
                }
            });
        }

        else if (responseType(response) === "announce") {
            const announceResponse = parseAnnounceRes(response);

            if(announceResponse.peers.length === 0) {
                console.log(`Tracker ${rInfo.address}:${rInfo.port} returned 0 Peers, waiting for other trackers...`);
                return;
            }

            isDone = true;
            clearInterval(retryIntervalTimer);

            console.log(`Success from ${rInfo.address}:${rInfo.port}!! Found ${announceResponse.peers.length} Peers.`);
            console.log(`There are, Leechers: ${announceResponse.leechers}, Seeders: ${announceResponse.seeders} and Interval: ${announceResponse.interval} seconds`);

            callback(announceResponse.peers);
            socket.close();
        }
        else if (responseType(response) === "error") {
            console.log(`Request rejected by tracker ${rInfo.address}:${rInfo.port}: ${response.subarray(8).toString("utf-8")}`);
        }
    });

    sendRequestToAllTrackers();
    const retryIntervalTimer = setInterval(sendRequestToAllTrackers, 5000);
};

const buildConnectionReq = function () {
    const connectMessage = Buffer.alloc(16);

    connectMessage.writeBigUInt64BE(0x41727101980n, 0); // Hardcoded Bittorrent Specification constant.
    connectMessage.writeUInt32BE(0, 8);    // Action = 0; CONNECT
    crypto.randomBytes(4).copy(connectMessage, 12);

    return connectMessage;
};

const parseConnectionRes = function (res) {
    return {
        action: res.readUInt32BE(0),
        transactionID: res.readUInt32BE(4),
        connectionID: res.subarray(8, 16),
    };
};

const responseType = function (res) {
    if (res.readUInt32BE(0) === 0) {
        return "connect";
    }
    else if (res.readUInt32BE(0) === 1) {
        return "announce";
    }
    else if (res.readUInt32BE(0) === 3) {
        return "error";
    }
};

const buildAnnounceReq = function (connectionID, torrentOBJ, PORT = 6881) {
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

const parseAnnounceRes = function (res) {
    return {
        action: res.readUInt32BE(0),
        transactionID: res.readUInt32BE(4),
        interval: res.readUInt32BE(8),
        leechers: res.readUInt32BE(12),
        seeders: res.readUInt32BE(16),
        peers: groupAndParsePeers(res.subarray(20)),
    };
};

const groupAndParsePeers = function (peerBuffer) {
    const peers = [];

    for (let i = 0; i < peerBuffer.length; i += 6) {
        peers.push({
            ip: peerBuffer.subarray(i, i + 4).join("."),
            port: peerBuffer.readUInt16BE(i + 4),
        });
    }

    return peers;
};
