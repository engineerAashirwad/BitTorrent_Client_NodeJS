import net from "node:net"
import {Buffer} from "node:buffer"
import {buildHandshake} from "./message.js"

export const download = function(peer, torrentOBJ) {
    const socket = new net.Socket();

    socket.on("error", (err) => {
        console.log(`TCP Connection failed with Peer: ${peer.ip} : ${err.message}`);
    });

    socket.connect(peer.port, peer.ip, () => {
        console.log(`Connected to Peer: ${peer.ip}:${peer.port}`);

        const handshake = buildHandshake(torrentOBJ);
        socket.write(handshake);
    });

    socket.on("data", (data) => {
        console.log(`Recieved data buffer of ${data.length} bytes from Peer: ${peer.ip}`);
    });
};