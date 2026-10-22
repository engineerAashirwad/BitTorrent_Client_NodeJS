import { parseTorrent, announceTracker, info_Hash } from "./src/torrent-parser.js"

// const torrentDecoded = parseTorrent("koneko-chan.torrent"); //http Announce URL
const torrentDecoded = parseTorrent("big-buck-bunny.torrent"); // UDP Announce URL

const announceURL = announceTracker(torrentDecoded);

const infoHash = info_Hash(torrentDecoded);

console.log(torrentDecoded);
console.log(announceURL);
console.log(infoHash);