/**
 * keeper.ts — APEX Auto-Rebalancer + Auto-Compounder
 * ────────────────────────────────────────────────────
 * Runs as a background Node.js process. Checks the Brain every
 * REBALANCE_INTERVAL_MS and calls rebalance() if the cooldown has elapsed.
 * Also calls compound() on the Compounder every COMPOUND_INTERVAL_MS.
 *
 * Run:
 *   npx hardhat run scripts/keeper.ts --network bscTestnet
 *
 * Or as a background process:
 *   npx ts-node scripts/keeper.ts &
 */

import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../frontend/.env.local"), override: false });

const REBALANCE_INTERVAL_MS = 5 * 60 * 1000;  // check every 5 min
const COMPOUND_INTERVAL_MS  = 15 * 60 * 1000; // compound every 15 min

const BRAIN_ADDR    = process.env.NEXT_PUBLIC_APEX_BRAIN_ADDRESS     as string;
const COMPOUNDER_ADDR = process.env.NEXT_PUBLIC_APEX_COMPOUNDER_ADDRESS as string;

const BRAIN_ABI = [
  "function lastRebalance() external view returns (uint256)",
  "function REBALANCE_COOLDOWN() external view returns (uint256)",
  "function rebalance() external",
];

const COMPOUNDER_ABI = [
  "function lastCompound() external view returns (uint256)",
  "function compound() external",
];

function timestamp() {
  return new Date().toISOString().slice(11, 19);
}

async function tryRebalance(brain: ethers.Contract) {
  try {
    const lastRebalance = await brain.lastRebalance();
    const cooldown      = await brain.REBALANCE_COOLDOWN();
    const now           = BigInt(Math.floor(Date.now() / 1000));
    const nextAt        = lastRebalance + cooldown;

    if (now < nextAt) {
      const secsLeft = Number(nextAt - now);
      console.log(`[${timestamp()}] 🕐 Rebalance cooldown: ${secsLeft}s remaining`);
      return;
    }

    console.log(`[${timestamp()}] ⚡ Rebalancing Brain...`);
    const tx = await brain.rebalance();
    console.log(`[${timestamp()}] ⏳ TX submitted: ${tx.hash}`);
    await tx.wait();
    console.log(`[${timestamp()}] ✅ Rebalanced! TX: ${tx.hash}`);
  } catch (err: any) {
    console.error(`[${timestamp()}] ❌ Rebalance failed: ${err.message?.slice(0, 120)}`);
  }
}

async function tryCompound(compounder: ethers.Contract) {
  try {
    console.log(`[${timestamp()}] 🌀 Compounding...`);
    const tx = await compounder.compound();
    console.log(`[${timestamp()}] ⏳ TX submitted: ${tx.hash}`);
    await tx.wait();
    console.log(`[${timestamp()}] ✅ Compounded! TX: ${tx.hash}`);
  } catch (err: any) {
    // MinHarvestThreshold not met is expected — not an error
    if (err.message?.includes('InsufficientHarvest')) {
      console.log(`[${timestamp()}] ℹ️  Harvest below threshold — skipped`);
    } else {
      console.error(`[${timestamp()}] ❌ Compound failed: ${err.message?.slice(0, 120)}`);
    }
  }
}

async function main() {
  const [keeper] = await ethers.getSigners();
  console.log(`\n🤖 APEX Keeper Bot`);
  console.log(`═══════════════════════════════════`);
  console.log(`Keeper:      ${keeper.address}`);
  console.log(`Brain:       ${BRAIN_ADDR}`);
  console.log(`Compounder:  ${COMPOUNDER_ADDR}`);
  console.log(`Rebalance:   every ${REBALANCE_INTERVAL_MS / 60000}min (when cooldown allows)`);
  console.log(`Compound:    every ${COMPOUND_INTERVAL_MS  / 60000}min`);
  console.log(`═══════════════════════════════════\n`);

  if (!BRAIN_ADDR || !COMPOUNDER_ADDR) {
    throw new Error("Missing NEXT_PUBLIC_APEX_BRAIN_ADDRESS or NEXT_PUBLIC_APEX_COMPOUNDER_ADDRESS");
  }

  const brain      = await ethers.getContractAt(BRAIN_ABI,      BRAIN_ADDR,      keeper);
  const compounder = await ethers.getContractAt(COMPOUNDER_ABI, COMPOUNDER_ADDR, keeper);

  // Run immediately on startup
  await tryRebalance(brain);

  // Schedule rebalance loop
  setInterval(() => tryRebalance(brain), REBALANCE_INTERVAL_MS);

  // Schedule compound loop (offset by 2min to avoid collisions)
  setTimeout(() => {
    tryCompound(compounder);
    setInterval(() => tryCompound(compounder), COMPOUND_INTERVAL_MS);
  }, 2 * 60 * 1000);

  console.log(`[${timestamp()}] 🟢 Keeper running. Ctrl+C to stop.\n`);

  // Keep process alive
  await new Promise(() => {});
}

main().catch(err => {
  console.error("❌ Keeper crashed:", err.message);
  process.exit(1);
});
