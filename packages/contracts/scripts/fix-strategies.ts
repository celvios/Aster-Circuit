import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

// Load contracts .env (private key) + frontend .env.local (contract addresses)
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../frontend/.env.local"), override: false });

/**
 * fix-strategies.ts
 * ─────────────────────────────────────────────────
 * Replaces the 4 real strategy contracts on the deployed APEXVault
 * with MockAPEXStrategy contracts. The real strategies call external
 * protocols (AsterDEX, Venus) that don't exist on BSC testnet, causing
 * vault.totalAssets() to revert and deposits to fail.
 *
 * MockAPEXStrategy.totalAssets() simply returns 0 — no external calls.
 *
 * Run:
 *   npx hardhat run scripts/fix-strategies.ts --network bscTestnet
 */

const VAULT_ADDR = process.env.NEXT_PUBLIC_APEX_VAULT_ADDRESS as string;
const WBNB_ADDR  = process.env.NEXT_PUBLIC_WBNB_ADDRESS as string;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n🔧 Strategy Fix Script");
  console.log("═══════════════════════════════════════");
  console.log("Deployer:", deployer.address);
  console.log("Vault:   ", VAULT_ADDR);
  console.log("WBNB:    ", WBNB_ADDR);
  console.log("");

  if (!VAULT_ADDR || !WBNB_ADDR) {
    throw new Error("Missing NEXT_PUBLIC_APEX_VAULT_ADDRESS or NEXT_PUBLIC_WBNB_ADDRESS in .env");
  }

  const vault = await ethers.getContractAt("APEXVault", VAULT_ADDR);
  const MockStrategy = await ethers.getContractFactory("MockAPEXStrategy");

  const strategyNames = ["M1 LP Yield", "M2 Staking", "M3 Lending", "M4 Hedge"];
  const newStrategies: string[] = [];

  for (let i = 0; i < 4; i++) {
    console.log(`Deploying mock ${strategyNames[i]}...`);
    const mock = await MockStrategy.deploy(WBNB_ADDR, VAULT_ADDR, ethers.ZeroAddress);
    await mock.waitForDeployment();
    const addr = await mock.getAddress();
    console.log(`  ✅ ${strategyNames[i]}: ${addr}`);
    newStrategies.push(addr);
  }

  console.log("\nUpdating vault strategies...");
  for (let i = 0; i < 4; i++) {
    const tx = await vault.setStrategy(i, newStrategies[i]);
    await tx.wait();
    console.log(`  ✅ Strategy[${i}] set to ${newStrategies[i]}`);
  }

  console.log("\n✅ Done! Vault is now using mock strategies.");
  console.log("Deposits will work — totalAssets() returns 0 without reverting.");
  console.log("\n→ Add these to your .env.local if needed:");
  newStrategies.forEach((addr, i) => {
    console.log(`  NEXT_PUBLIC_APEX_STRATEGY_M${i+1}=${addr}`);
  });
}

main().catch(err => { console.error("\n❌", err.message); process.exit(1); });
