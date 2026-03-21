/**
 * deploy-lending.ts
 * ────────────────────────────────────────────────────────
 * Deploys VenusDirectLendingStrategy for M3 (Lending) slot.
 * Updates vault.setStrategy(2, newAddr) to replace the mock M3.
 *
 * Venus BSC Testnet addresses used:
 *   vBNB        0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c
 *   Comptroller 0x94d1820b2D1c7c7452A163983Dc888CEC546b77d
 *   XVS         0xB9e0E753630434d7863528cc73CB7AC638a7c8ff
 *   PCS Router  0xD99D1c33F9fC3444f8101754aBC46c52416550D1
 *
 * Run:
 *   npx hardhat run scripts/deploy-lending.ts --network bscTestnet
 */

import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../frontend/.env.local"), override: false });

// ── Venus BSC Testnet Addresses (lowercase to avoid ethers v6 checksum errors) ─
const VENUS_vBNB        = "0x2e7222e51c0f6e98610a1543aa3836e092cde62c";
const VENUS_COMPTROLLER = "0x94d1820b2d1c7c7452a163983dc888cec546b77d";
const XVS               = "0xb9e0e753630434d7863528cc73cb7ac638a7c8ff";
const PANCAKE_ROUTER    = "0xd99d1c33f9fc3444f8101754abc46c52416550d1";
const WBNB              = "0xae13d989dac2f0debff460ac112a837c89baa7cd";

// ── From env ─────────────────────────────────────────────────────
const VAULT_ADDR = process.env.NEXT_PUBLIC_APEX_VAULT_ADDRESS as string;
const BRAIN_ADDR = process.env.NEXT_PUBLIC_APEX_BRAIN_ADDRESS as string;

const VAULT_ABI = ["function setStrategy(uint256 index, address strategy) external"];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n⚡ Venus Direct Lending Strategy — Deploy");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`Deployer:   ${deployer.address}`);
  console.log(`Vault:      ${VAULT_ADDR}`);
  console.log(`Brain:      ${BRAIN_ADDR}`);
  console.log(`vBNB:       ${VENUS_vBNB}`);
  console.log(`Comptroller:${VENUS_COMPTROLLER}`);
  console.log(`XVS:        ${XVS}`);
  console.log(`PCS Router: ${PANCAKE_ROUTER}`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (!VAULT_ADDR || !BRAIN_ADDR) {
    throw new Error("Missing NEXT_PUBLIC_APEX_VAULT_ADDRESS or NEXT_PUBLIC_APEX_BRAIN_ADDRESS in .env");
  }

  // 1. Deploy VenusDirectLendingStrategy
  console.log("1/2  Deploying VenusDirectLendingStrategy...");
  const Strategy = await ethers.getContractFactory("VenusDirectLendingStrategy");
  const strategy = await Strategy.deploy(
    VAULT_ADDR,
    BRAIN_ADDR,
    WBNB,
    XVS,
    VENUS_vBNB,
    VENUS_COMPTROLLER,
    PANCAKE_ROUTER
  );
  await strategy.waitForDeployment();
  const strategyAddr = await strategy.getAddress();
  console.log(`     ✅ VenusDirectLendingStrategy: ${strategyAddr}`);

  // 2. Wire into vault at M3 slot (index 2)
  console.log("\n2/2  Wiring into vault as M3 (index 2)...");
  const vault = await ethers.getContractAt(VAULT_ABI, VAULT_ADDR);
  const tx = await vault.setStrategy(2, strategyAddr);
  await tx.wait();
  console.log(`     ✅ vault.setStrategy(2, ${strategyAddr})`);

  // 3. Verify APY reads correctly
  const strategyContract = await ethers.getContractAt(
    ["function currentAPY() external view returns (uint256)"],
    strategyAddr
  );
  const apy = await strategyContract.currentAPY();
  console.log(`\n📈 Current Venus vBNB APY: ${(Number(apy) / 100).toFixed(2)}%`);

  console.log("\n✅ Lending strategy deployed and active!");
  console.log("\n→ Add to frontend/.env.local:");
  console.log(`   NEXT_PUBLIC_APEX_STRATEGY_M3=${strategyAddr}`);
  console.log("\n→ To fund M3:");
  console.log("   1. Trigger Rebalance on Brain (allocates 20% of TVL to M3)");
  console.log("   2. M3 receives WBNB, unwraps → BNB, supplies to Venus vBNB");
  console.log("   3. Dashboard Strategy Breakdown will show M3 WBNB + APY %");
  console.log(`\n→ Verify on BscScan: https://testnet.bscscan.com/address/${strategyAddr}`);
}

main().catch(err => {
  console.error("\n❌", err.message);
  process.exit(1);
});
