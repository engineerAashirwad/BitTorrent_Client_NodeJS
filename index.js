import fs from "node:fs"
import bencode from "bencode"
import {Buffer} from "node:buffer"

const torrentBuffer = fs.readFileSync("koneko-chan.torrent");
// const torrentBuffer = fs.readFileSync("big-buck-bunny.torrent");

const torrentDecoded = bencode.decode(torrentBuffer);
const announceURL = Buffer.from(torrentDecoded.announce).toString("utf-8");

console.log(torrentDecoded);
console.log(announceURL);