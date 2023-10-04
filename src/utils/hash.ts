import { bech32 } from 'bech32';
import * as sha256 from "fast-sha256";
import { BinTools, Buffer } from 'avalanche'

const addressSep = '-';
const ripemd160Size = 20;

function Parse(addrStr: string): { chainID: string, hrp: string, addr: number[] } {
    const addressParts: string[] = addrStr.split(addressSep);
    if (addressParts.length < 2) {
        throw new Error('no separator found in address');
    }
    const chainID = addressParts[0];
    const rawAddr = addressParts[1];

    const { hrp, addr } = ParseBech32(rawAddr)
    return { chainID, hrp, addr };
}

function ParseBech32(addrStr: string): { hrp: string, addr: number[] } {
    const decodeRes = bech32.decode(addrStr);
    if (!decodeRes) throw new Error('error decoding');
    const addrBytes = bech32.fromWords(decodeRes.words);
    return { hrp: decodeRes.prefix, addr: addrBytes };
}

function ToShortId(addrBytes: number[]): number[] {
    if (addrBytes.length !== ripemd160Size) throw new Error(`expected ${ripemd160Size} bytes but got ${addrBytes.length}`);
    return addrBytes;
}

function ParseToIDBuffer(addrStr: string): number[] {
    const { addr } = Parse(addrStr);
    return ToShortId(addr);
}

/**
 *
 * @param addrStr
 * @returns
 */
export function ParseToID(addrStr: string): string {
    const bintools = BinTools.getInstance()
    const bufferID = Buffer.from(ParseToIDBuffer(addrStr))
    return bintools.cb58Encode(bufferID)
}

/* example configurations
let networkId = "162"
let pChainPublicKey = "6Y3kysjF9jnHnYkdS9yGAuoHyae2eNmeV" // = ParseToID("P-localflare18jma8ppw3nhx5r4ap8clazz0dps7rv5uj3gy4v")
let nodeID = "NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ"
let weight = "10000000000000"
let duration = "1512000"
*/
export function ToValidatorConfigHash(networkID: string, pChainPublicKey: string, nodeID: string, weight: string, duration: string) {
    let enc = new TextEncoder(); // always utf-8

    let salt = "flare" + networkID + "-"
    let pChainPublicKeyHash = sha256.hash(enc.encode(salt + pChainPublicKey))
    let nodeIDHash = sha256.hash(enc.encode(salt + nodeID))
    let nodeWeightHash = sha256.hash(enc.encode(salt + weight))
    let nodeDurationHash = sha256.hash(enc.encode(salt + duration))

    let validatorConfig = new Uint8Array(pChainPublicKeyHash.length + nodeIDHash.length + nodeWeightHash.length + nodeDurationHash.length)
    validatorConfig.set(pChainPublicKeyHash)
    validatorConfig.set(nodeIDHash, pChainPublicKeyHash.length)
    validatorConfig.set(nodeWeightHash, pChainPublicKeyHash.length + nodeIDHash.length)
    validatorConfig.set(nodeDurationHash, pChainPublicKeyHash.length + nodeIDHash.length + nodeWeightHash.length)
    let validatorConfigHash = sha256.hash(validatorConfig)

    return Buffer.from(validatorConfigHash).toString('hex')
}