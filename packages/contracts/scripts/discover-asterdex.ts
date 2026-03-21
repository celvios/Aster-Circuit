/**
 * discover-asterdex.ts
 * ─────────────────────────────────
 * Reverse-engineers AsterDEX router, factory, and pool addresses
 * by calling common getter functions on the known AsterDEX contracts.
 *
 * Run:
 *   npx hardhat run scripts/discover-asterdex.ts --network bscMainnet
 */

import { ethers } from "hardhat";

// ── Known addresses from AsterDEX docs ──────────────────────────
const ASTER_MAIN      = "0x1b6F2d3844C6ae7D56ceb3C3643b9060ba28FEb0";
const ASTER_TREASURY  = "0x128463A60784c4D3f46c23Af3f65Ed859Ba87974";
const AS_BNB_TOKEN    = "0x77734e70b6E88b4d82fE632a168EDf6e700912b6";
const AS_BNB_MINTING  = "0x2F31ab8950c50080E77999fa456372f276952fD8";
const AS_USDF_TOKEN   = "0x917AF46B3C3c6e1Bb7286B9F59637Fb7C65851Fb";
const AS_USDF_MINTING = "0xdB57a53C428a9faFcbFefFB6dd80d0f427543695";

// WBNB on mainnet (for pool lookup)
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

// Generic ABI covering common DeFi getter patterns
const UNIVERSAL_ABI = [
  "function router() external view returns (address)",
  "function factory() external view returns (address)",
  "function getRouter() external view returns (address)",
  "function getFactory() external view returns (address)",
  "function ROUTER() external view returns (address)",
  "function FACTORY() external view returns (address)",
  "function pool() external view returns (address)",
  "function pair() external view returns (address)",
  "function wbnb() external view returns (address)",
  "function WBNB() external view returns (address)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function totalAssets() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function owner() external view returns (address)",
  "function admin() external view returns (address)",
  "function treasury() external view returns (address)",
  "function minter() external view returns (address)",
  "function vault() external view returns (address)",
];

// PancakeSwap-style factory ABI (may also work for AsterDEX if it's a fork)
const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
  "function allPairsLength() external view returns (uint256)",
];

// PancakeSwap-style router ABI
const ROUTER_ABI = [
  "function factory() external view returns (address)",
  "function WETH() external view returns (address)",      // returns WBNB on BSC
  "function WBNB() external view returns (address)",
];

async function tryCall(contract: ethers.Contract, fn: string, ...args: any[]): Promise<string | null> {
  try {
    const result = await contract[fn](...args);
    return result.toString();
  } catch {
    return null;
  }
}

async function probeContract(label: string, address: string) {
  console.log(`\n🔍 Probing: ${label}`);
  console.log(`   Address: ${address}`);

  const contract = new ethers.Contract(address, UNIVERSAL_ABI, ethers.provider);
  const fns = [
    "router", "factory", "getRouter", "getFactory", "ROUTER", "FACTORY",
    "pool", "pair", "wbnb", "WBNB", "token0", "token1",
    "owner", "admin", "treasury", "minter", "vault",
    "totalAssets", "totalSupply",
  ];

  for (const fn of fns) {
    const result = await tryCall(contract, fn);
    if (result !== null) {
      console.log(`   ✅ ${fn}() = ${result}`);
    }
  }
}

async function probeFactory(label: string, address: string) {
  console.log(`\n🏭 Factory probe: ${label} @ ${address}`);
  const factory = new ethers.Contract(address, FACTORY_ABI, ethers.provider);

  // Try to get BNB/USDF pair
  const pairsToCheck = [
    [WBNB, AS_USDF_TOKEN, "WBNB/asUSDF"],
    [WBNB, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", "WBNB/USDC"], // USDC mainnet
    [WBNB, "0x55d398326f99059fF775485246999027B3197955", "WBNB/USDT"], // USDT mainnet
    [AS_BNB_TOKEN, AS_USDF_TOKEN, "asBNB/asUSDF"],
    [AS_BNB_TOKEN, WBNB, "asBNB/WBNB"],
  ];

  for (const [tokenA, tokenB, pairLabel] of pairsToCheck) {
    const pair = await tryCall(factory, "getPair", tokenA, tokenB);
    if (pair && pair !== "0x0000000000000000000000000000000000000000") {
      console.log(`   ✅ getPair(${pairLabel}) = ${pair}`);
    }
  }

  const len = await tryCall(factory, "allPairsLength");
  if (len) console.log(`   ✅ allPairsLength() = ${len}`);
}

async function main() {
  console.log("🕵️  AsterDEX Address Discovery");
  console.log("═══════════════════════════════════════════════════");
  console.log("Reading from BSC mainnet via RPC...\n");

  // 1. Probe main AsterDEX contract
  await probeContract("AsterDEX Main", ASTER_MAIN);

  // 2. Probe token + minting contracts
  await probeContract("asBNB Token",    AS_BNB_TOKEN);
  await probeContract("asBNB Minting",  AS_BNB_MINTING);
  await probeContract("asUSDF Token",   AS_USDF_TOKEN);
  await probeContract("asUSDF Minting", AS_USDF_MINTING);
  await probeContract("Aster Treasury", ASTER_TREASURY);

  // 3. If main contract returned a factory, probe it
  const mainContract = new ethers.Contract(ASTER_MAIN, UNIVERSAL_ABI, ethers.provider);
  const possibleFactory = await tryCall(mainContract, "factory") 
    ?? await tryCall(mainContract, "getFactory")
    ?? await tryCall(mainContract, "FACTORY");

  if (possibleFactory && possibleFactory !== "null") {
    await probeFactory("AsterDEX Factory (from main)", possibleFactory);
  }

  // 4. Same for router
  const possibleRouter = await tryCall(mainContract, "router")
    ?? await tryCall(mainContract, "getRouter")
    ?? await tryCall(mainContract, "ROUTER");

  if (possibleRouter && possibleRouter !== "null") {
    const routerContract = new ethers.Contract(possibleRouter, ROUTER_ABI, ethers.provider);
    const routerFactory = await tryCall(routerContract, "factory");
    if (routerFactory) {
      console.log(`\n🔗 Router factory: ${routerFactory}`);
      await probeFactory("Factory (from router)", routerFactory);
    }
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("Discovery complete. Copy any ✅ addresses above.");
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
