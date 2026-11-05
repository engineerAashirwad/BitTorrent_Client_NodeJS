import dgram from "node:dgram"
import http from "node:http"
import https from "node:https"
import crypto from "node:crypto"
import { Buffer } from "node:buffer"
import bencode from "bencode"
import { announceTrackerList, info_Hash, itemSize } from "./torrent-parser.js"
import { genPeerId } from "./peer-id.js"

export const getPeersList = function (torrentOBJ, callback) {
    const socket = dgram.createSocket("udp4");
    const trackerURLs = announceTrackerList(torrentOBJ);

    let isDone = false;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    const finishWithPeers = function(sourceLabel, announceResponse) {
        if (isDone) {
            return
        }

        isDone = true;
        clearInterval(retryIntervalTimer);

        console.log(`Success from ${sourceLabel}!! Found ${announceResponse.peers.length} Peers.`);
        console.log(`There are, Leechers: ${announceResponse.leechers}, Seeders: ${announceResponse.seeders} and Interval: ${announceResponse.interval} seconds.`);

        try{
            socket.close();
        } catch (err) {
            console.log(`Error while closing socket! Error: ${err}`);
        }

        callback(announceResponse.peers);
    };

    socket.on("error", (err) => {
        console.log(`UDP Socket Error!! ${err.message}`);
    });

    const sendRequestToAllTrackers = function() {
        if(isDone) {
            return;
        }

        if(retryCount >= MAX_RETRIES) {
            console.log("All Trackers Timed Out!!! Check your Internet Connection and also make sure atleast one tracker is Online.");
            clearInterval(retryIntervalTimer);
            socket.close();
            return;
        }

        retryCount++;
        console.log(`\n[Attempt ${retryCount}/${MAX_RETRIES}] Querying ${trackerURLs.length} Trackers...`);

        for (const trackerUrl of trackerURLs) {
            let urlTracker;
            try {
                urlTracker = new URL(trackerUrl);
            } catch {
                continue;
            }

            if(urlTracker.protocol === "udp:") {
                const PORT = Number(urlTracker.port);
                const connectionRequest = buildConnectionReq();

                socket.send(connectionRequest, 0, connectionRequest.length, PORT, urlTracker.hostname, (err, reqBytes) => {
                    if(err) {
                        console.log(`Skipping Unreachable UDP Tracker ${urlTracker.hostname}:${PORT} (${err.message})`);
                        return;
                    }
                    console.log(`UDP Connection Request of ${reqBytes} Bytes(B) sent to ${urlTracker.hostname}:${PORT}`);
                });
            }
            
            else if(urlTracker.protocol === "http:" || urlTracker.protocol === "https:") {
                requestHttpTracker(trackerUrl, torrentOBJ, (err, announceResponse) => {
                    if (isDone) {
                        return;
                    }

                    if (err) {
                        console.log(`HTTP Tracker ${urlTracker.hostname} failed! Error: ${err.message}`);
                        return;
                    }

                    if(announceResponse.peers.length === 0) {
                        console.log(`HTTP Tracker ${urlTracker.hostname} returned 0 Peers, Waiting for other Trackers...`);
                        return;
                    }

                    finishWithPeers(urlTracker.hostname, announceResponse);
                });
            }
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
                console.log(`UDP Tracker ${rInfo.address}:${rInfo.port} returned 0 Peers, waiting for other trackers...`);
                return;
            }

            finishWithPeers(`${rInfo.address}:${rInfo.port}`, announceResponse);
        }

        else if (responseType(response) === "error") {
            console.log(`Request rejected by UDP tracker ${rInfo.address}:${rInfo.port}: ${response.subarray(8).toString("utf-8")}`);
        }
    });

    sendRequestToAllTrackers();
    const retryIntervalTimer = setInterval(sendRequestToAllTrackers, 5000);
};

// <-------------------------- UDP TRACKER HELPER FUNCTIONS --------------------------------->

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

// <----------------------------- HTTP/HTTPS TRACKER HELPER FUNCTIONS ---------------------------------->

const urlEncodeBytes = function(buf) {
    return Array.from(buf, (byte) => `%${byte.toString(16).padStart(2, "0")}`).join("");
};

const buildHttpAnnounceURL = function(baseURL, torrentOBJ, PORT = 6881) {
    const infoHashEncoded = urlEncodeBytes(info_Hash(torrentOBJ));
    const peerIdEncoded = urlEncodeBytes(genPeerId());
    const left = itemSize(torrentOBJ).readBigUInt64BE(0).toString();

    const separator = baseURL.includes("?") ? "&" : "?";
    const query = [
        `info_hash=${infoHashEncoded}`,
        `peer_id=${peerIdEncoded}`,
        `port=${PORT}`,
        `uploaded=0`,
        `downloaded=0`,
        `left=${left}`,
        `event=started`,
        `compact=1`,
        `numwant=100`,
    ].join("&");

    return `${baseURL}${separator}${query}`;
};

const requestHttpTracker = function(trackerURL, torrentOBJ, callback, redirectDepth = 0) {
    if(redirectDepth > 3) {
        return callback(new Error("Too many HTTP/HTTPS Redirects!"));
    }

    const fullUrl = redirectDepth === 0 ? buildHttpAnnounceURL(trackerURL, torrentOBJ) : trackerURL;
    const parsedUrl = new URL(fullUrl);
    const client = parsedUrl.protocol === "https:" ? https : http;

    console.log(`Sending HTTP GET Announce Request to ${parsedUrl.hostname}...`);

    const req = client.get(fullUrl, {timeout: 4500, family: 4}, (res) => {

        if(res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, fullUrl).toString();
            res.resume();
            return requestHttpTracker(redirectUrl, torrentOBJ, callback, redirectDepth + 1);
        }

        if(res.statusCode !== 200) {
            res.resume();
            return callback(new Error(`HTTP Status Code ${res.statusCode}`));
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));

        res.on("end", () => {
            try {
                const bodyBuffer = Buffer.concat(chunks);
                const decoded = bencode.decode(bodyBuffer);

                if(decoded["failure reason"]) {
                    const reason = Buffer.from(decoded["failure reason"]).toString("utf-8");
                    return callback(new Error(`Tracker rejected request: ${reason}`));
                }

                const parsedResponse = parseHttpAnnounceRes(decoded);
                callback(null, parsedResponse);
            } catch (err) {
                callback(new Error(`Failed to decode Bencoded tracker response: ${err.message}`));
            }
        });
    });

    req.on("timeout", () => {
        req.destroy(new Error("Request Timed Out!"));
    });

    req.on("error", (err) => {
        callback(err);
    });
};

const parseHttpAnnounceRes = function(decoded) {
    let peers = [];

    if(decoded.peers) {
        if(Array.isArray(decoded.peers)) {
            peers = decoded.peers.map((peer) => {
                return {
                    ip: Buffer.from(peer.ip).toString("utf-8"),
                    port: peer.port,
                };
            });
        }
        else{
            peers = groupAndParsePeers(Buffer.from(decoded.peers));
        }
    }

    return {
        interval: decoded.interval || 0,
        leechers: decoded.incomplete || 0,
        seeders: decoded.complete || 0,
        peers,
    };
};
