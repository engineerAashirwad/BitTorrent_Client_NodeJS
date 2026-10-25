import { parseTorrent, announceTracker, info_Hash, itemSize } from "./src/torrent-parser.js"

// big-buck-bunny.torrent -> UDP Tracker URL
// koneko-chan.torrent -> HTTP Tracker URL
const filePath = process.argv[2];

const torrentDecoded = parseTorrent(filePath);

const announceURL = announceTracker(torrentDecoded);

const infoHash = info_Hash(torrentDecoded);

const totalSizeBuf = itemSize(torrentDecoded);

console.log(torrentDecoded);
console.log(announceURL);
console.log(infoHash);
console.log(totalSizeBuf);