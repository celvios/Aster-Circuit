import { ethers, network } from "hardhat";
import { expect } from "chai";
import * as dotenv from "dotenv";

dotenv.config();

// Strict Environment Validation
function getEnvVar(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`State Error: Environment variable ${key} is not defined`);
    }
    return value;
}

async function main() {
    console.log(">> Initializing Pool ID Discovery...");

    // 1. Load Configuration
    const CONFIG = {
        MASTERCHEF_V2: getEnvVar("MASTERCHEF_V2"),
        PANCAKE_FACTORY: getEnvVar("PANCAKE_FACTORY"),
        WBNB: getEnvVar("WBNB"),
        USDT: getEnvVar("USDT"),
    };

    // 2. Network Verification
    // Ensure we are connected to a network with state (Fork or Mainnet)
    const provider = ethers.provider;
    const blockNumber = await provider.getBlockNumber();
    console.log(`>> Connected to network. Current Block: ${blockNumber}`);

    const factoryCode = await provider.getCode(CONFIG.PANCAKE_FACTORY);
    if (factoryCode === "0x") {
        throw new Error(`Network Error: No contract code at PANCAKE_FACTORY (${CONFIG.PANCAKE_FACTORY}). Check your fork configuration.`);
    }

    // 3. Resolve Target LP Token
    const factory = await ethers.getContractAt("IPancakeFactory", CONFIG.PANCAKE_FACTORY);

    // Connectivity Check
    try {
        const len = await factory.allPairsLength();
        console.log(`>> Factory Connectivity OK. Total Pairs: ${len}`);
    } catch (e: any) {
        throw new Error(`Connectivity Error: Failed to read from Factory: ${e.message}`);
    }

    console.log(`>> resolving LP Pair for WBNB (${CONFIG.WBNB}) - USDT (${CONFIG.USDT})...`);
    let lpToken;
    try {
        lpToken = await factory.getPair(CONFIG.WBNB, CONFIG.USDT);
    } catch (e: any) {
        throw new Error(`Call Error during getPair: ${e.message}`);
    }

    if (lpToken === ethers.ZeroAddress) {
        throw new Error("Logic Error: LP Pair does not exist for WBNB-USDT. This pair should exist on BSC Mainnet.");
    }
    console.log(`>> LP Pair Found: ${lpToken}`);

    // 4. Locate Pool ID in MasterChef V2
    const masterChef = await ethers.getContractAt("IMasterChefV2", CONFIG.MASTERCHEF_V2);
    const poolLength = await masterChef.poolLength();
    console.log(`>> MasterChef V2 Pool Count: ${poolLength}`);

    console.log(">> Scanning pools...");
    // Efficient scan
    for (let i = 0; i < Number(poolLength); i++) {
        try {
            // Some pools might be deprecated or behave oddly, but standard getters should work
            const poolLp = await masterChef.lpToken(i);

            if (poolLp.toLowerCase() === lpToken.toLowerCase()) {
                console.log(`\nSUCCESS: WBNB-USDT Pool ID found: ${i}`);
                console.log(`VERIFICATION: MasterChefV2.lpToken(${i}) == ${poolLp}`);
                return;
            }
        } catch (e: any) {
            console.warn(`Warning: Failed to read pool ${i}: ${e.message}`);
        }

        if (i % 50 === 0 && i > 0) process.stdout.write(".");
        // Stop after reasonable search depth for BNB-USDT (usually low ID or re-added)
        // BNB-USDT is a major pair, expected to be in first 200.
        if (i > 200) {
            console.log("\n>> Search depth exceeded 200. Stopping scan for efficiency.");
            break;
        }
    }

    throw new Error("Runtime Error: Pool ID not found in the scanned range.");
}

main().catch((error) => {
    console.error("\nFATAL ERROR:");
    console.error(error);
    process.exit(1);
});
