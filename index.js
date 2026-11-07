import { parseTorrent, announceTrackerList, info_Hash, itemSize } from "./src/torrent-parser.js"
import { genPeerId } from "./src/peer-id.js"
import download from "./src/download.js"
import {Buffer} from "node:buffer"

// Missing features:
// 1. Bencode Parser.
// 2. Transaction ID Validation
// 3. SHA-1 Verification
// 4. Request Pipeline
// 5. CLI

// BUGS
// 1. 99% Stalling / Orphaned Block Problem

// big-buck-bunny.torrent -> UDP Tracker URL
// koneko-chan.torrent -> HTTP Tracker URL
const torrentFilePath = process.argv[2];

const peer_id = genPeerId();

const torrentDecoded = parseTorrent(torrentFilePath);

const announceURLs = announceTrackerList(torrentDecoded);

const infoHash = info_Hash(torrentDecoded);

const totalSizeBuf = itemSize(torrentDecoded);

download(torrentDecoded, Buffer.from(torrentDecoded.info.name).toString("utf-8"));

console.log(torrentDecoded);
console.log(announceURLs);
console.log(infoHash);
console.log(totalSizeBuf);
console.log(peer_id);