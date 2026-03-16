import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * APEX Deployment Script
 * Deploy Order:
 *   1. LPYieldStrategy (M1)
 *   2. StakingStrategy  (M2)
 *   3. LendingStrategy  (M3)
 *   4. HedgeStrategy    (M4)
 *   5. APEXBrain
 *   6. APEXCompounder
 *   7. APEXVault
 *   8. Wire: setVault() on each strategy, brain, compounder
 */

// ── Known BNB Chain Addresses ─────────────────────────────────
const WBNB    = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const USDF    = "0x55d398326f99059fF775485246999027B3197955"; // USDT as proxy until USDF confirmed
const XVS     = "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63";
const V_USDT  = "0xfD5840Cd36d94D7229439859C0112a4185BC0255"; // vUSDT on Venus
const VENUS_COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const PANCAKE_ROUTER    = "0x10ED43C718714eb63d5aA57B78B54704E256024E";

// ⚠️  Replace with confirmed AsterDEX addresses before mainnet deploy
const ASTER_DEX_ROUTER  = process.env.ASTER_DEX_ROUTER  || "0x0000000000000000000000000000000000000001";
const ASTER_DEX_POOL    = process.env.ASTER_DEX_POOL    || "0x0000000000000000000000000000000000000002";
const ASTER_DEX_PRO     = process.env.ASTER_DEX_PRO     || "0x0000000000000000000000000000000000000003";
const AS_BNB_MINTER     = process.env.AS_BNB_MINTER     || "0x0000000000000000000000000000000000000004";
const AS_BNB_TOKEN      = process.env.AS_BNB_TOKEN      || "0x0000000000000000000000000000000000000005";
const LP_TOKEN          = process.env.LP_TOKEN          || "0x0000000000000000000000000000000000000006";
const TREASURY          = process.env.TREASURY_ADDRESS  || "0x0000000000000000000000000000000000000007";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");

    // ── 1. Deploy Strategy Modules ────────────────────────────
    console.log("1. Deploying LPYieldStrategy (M1)...");
    const LPYield = await ethers.getContractFactory("LPYieldStrategy");
    const m1 = await LPYield.deploy(
        ethers.ZeroAddress, // vault — set later
        ethers.ZeroAddress, // brain — set later
        WBNB, USDF, ASTER_DEX_ROUTER, ASTER_DEX_POOL, LP_TOKEN
    );
    await m1.waitForDeployment();
    console.log("   M1 (LP):", await m1.getAddress());

    console.log("2. Deploying StakingStrategy (M2)...");
    const Staking = await ethers.getContractFactory("StakingStrategy");
    const m2 = await Staking.deploy(
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        WBNB, AS_BNB_TOKEN, AS_BNB_MINTER
    );
    await m2.waitForDeployment();
    console.log("   M2 (Staking):", await m2.getAddress());

    console.log("3. Deploying LendingStrategy (M3)...");
    const Lending = await ethers.getContractFactory("LendingStrategy");
    const m3 = await Lending.deploy(
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        WBNB, USDF, XVS, V_USDT, VENUS_COMPTROLLER, PANCAKE_ROUTER
    );
    await m3.waitForDeployment();
    console.log("   M3 (Lending):", await m3.getAddress());

    console.log("4. Deploying HedgeStrategy (M4)...");
    const Hedge = await ethers.getContractFactory("HedgeStrategy");
    const m4 = await Hedge.deploy(
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        WBNB, USDF, ASTER_DEX_PRO, await m1.getAddress()
    );
    await m4.waitForDeployment();
    console.log("   M4 (Hedge):", await m4.getAddress());

    const strategies: [string, string, string, string] = [
        await m1.getAddress(),
        await m2.getAddress(),
        await m3.getAddress(),
        await m4.getAddress(),
    ];

    // ── 2. Deploy APEXBrain ───────────────────────────────────
    console.log("\n5. Deploying APEXBrain...");
    const Brain = await ethers.getContractFactory("APEXBrain");
    const brain = await Brain.deploy(ethers.ZeroAddress, strategies, ASTER_DEX_POOL);
    await brain.waitForDeployment();
    console.log("   Brain:", await brain.getAddress());

    // ── 3. Deploy APEXCompounder ──────────────────────────────
    console.log("6. Deploying APEXCompounder...");
    const Compounder = await ethers.getContractFactory("APEXCompounder");
    const compounder = await Compounder.deploy(
        ethers.ZeroAddress, await brain.getAddress(), WBNB, strategies
    );
    await compounder.waitForDeployment();
    console.log("   Compounder:", await compounder.getAddress());

    // ── 4. Deploy APEXVault ───────────────────────────────────
    console.log("7. Deploying APEXVault...");
    const Vault = await ethers.getContractFactory("APEXVault");
    const vault = await Vault.deploy(
        WBNB,
        await brain.getAddress(),
        TREASURY,
        strategies,
        await compounder.getAddress()
    );
    await vault.waitForDeployment();
    console.log("   Vault:", await vault.getAddress());

    // ── 5. Wire: setVault on all components ───────────────────
    console.log("\n8. Wiring components...");
    await (brain as any).connect(deployer)
        .transferOwnership(await vault.getAddress())
        .catch(() => console.log("   Brain ownership transfer skipped (no owner fn)"));

    // Set vault address in compounder
    await (compounder as any).setVault(await vault.getAddress());

    // ── Summary ───────────────────────────────────────────────
    console.log("\n=== DEPLOYMENT COMPLETE ===");
    console.log("Vault:      ", await vault.getAddress());
    console.log("Brain:      ", await brain.getAddress());
    console.log("Compounder: ", await compounder.getAddress());
    console.log("M1 (LP):    ", await m1.getAddress());
    console.log("M2 (Stake): ", await m2.getAddress());
    console.log("M3 (Lend):  ", await m3.getAddress());
    console.log("M4 (Hedge): ", await m4.getAddress());

    console.log("\n⚠️  Remember to:");
    console.log("  - Confirm AsterDEX contract addresses (Router, Pool, Pro, asBNB)");
    console.log("  - Verify contracts on BscScan");
    console.log("  - Grant reviewer access: cryptocoder0x, tggeth");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
