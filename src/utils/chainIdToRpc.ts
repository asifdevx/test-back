import { CHAINS } from "../config/contract";


export const CHAINID_TO_RPC = (chainId:number):string=>{
    const chainEntry = Object.values(CHAINS).find(e=>e.chainId===chainId);
    return chainEntry?.rpc?.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://")!;
}