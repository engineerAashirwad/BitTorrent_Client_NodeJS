import crypto from "node:crypto"
import { Buffer } from "node:buffer"

let id = null;

export const genPeerId = function () {
    if (!id) {
        id = crypto.randomBytes(20);
        Buffer.from("-AS0001-").copy(id, 0);
    }

    return id;
};