import { ethers, run } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
dotenv.config();

/**
 * APEX Testnet / Mainnet Deploy Script
 * ─────────────────────────────────────
 * Usage:
 *   BSC Testnet:  npx hardhat run scripts/deployAPEX.ts --network bscTestnet
 *   BSC Mainnet:  npx hardhat run scripts/deployAPEX.ts --network bscMainnet
 *
 * Required .env:
 *   DEPLOYER_PRIVATE_KEY   — wallet that pays gas
 *   BSCSCAN_API_KEY        — for contract verification (optional but recommended)
 *   TREASURY_ADDRESS       — receives exit fees
 *
 * Optional .env (defaults to mock placeholders if missing):
 *   ASTER_DEX_ROUTER, ASTER_DEX_POOL, ASTER_DEX_PRO
 *   AS_BNB_MINTER, AS_BNB_TOKEN, LP_TOKEN
 */

// ── Known BNB Chain Addresses ──────────────────────────────────────────────
const WBNB_MAINNET     = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const WBNB_TESTNET     = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd"; // BSC Chapel testnet
const USDT               = "0x55d398326f99059fF775485246999027B3197955";
const XVS                = "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63";
const V_USDT             = "0xfD5840Cd36d94D7229439859C0112a4185BC0255"; // Venus vUSDT
const VENUS_COMPTROLLER  = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const PANCAKE_ROUTER     = "0x10ED43C718714eb63d5aA57B78B54704E256024E";

// AsterDEX — replace with real addresses before mainnet
const ASTER_DEX_ROUTER   = process.env.ASTER_DEX_ROUTER  || "0x0000000000000000000000000000000000000001";
const ASTER_DEX_POOL     = process.env.ASTER_DEX_POOL    || "0x0000000000000000000000000000000000000002";
const ASTER_DEX_PRO      = process.env.ASTER_DEX_PRO     || "0x0000000000000000000000000000000000000003";
const AS_BNB_MINTER      = process.env.AS_BNB_MINTER     || process.env.ASBNB_MINTER || "0x2F31ab8950c50080E77999fa456372f276952fD8";
const AS_BNB_TOKEN       = process.env.AS_BNB_TOKEN      || process.env.ASBNB_TOKEN  || "0x77734e70b6E88b4d82fE632a168EDf6e700912b6";
const LP_TOKEN           = process.env.LP_TOKEN          || "0x0000000000000000000000000000000000000006";
const TREASURY           = process.env.TREASURY_ADDRESS  || "0x0000000000000000000000000000000000000007";

const USDF               = process.env.USDF_TOKEN        || USDT; // Use USDT as proxy for USDF

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verify(address: string, constructorArgs: any[]) {
  if (!process.env.BSCSCAN_API_KEY) return;
  try {
    await run("verify:verify", { address, constructorArguments: constructorArgs });
    console.log(`   ✅ Verified: ${address}`);
  } catch (e: any) {
    if (e.message?.includes("Already Verified")) {
      console.log(`   ✓ Already verified: ${address}`);
    } else {
      console.log(`   ⚠️  Verification failed: ${e.message?.slice(0, 60)}`);
    }
  }
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const chainId = Number(network.chainId);

  // Select correct WBNB for the target network
  const WBNB = chainId === 97 ? WBNB_TESTNET : WBNB_MAINNET;
  console.log("\n⚡ APEX Protocol Deployment");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`Network:   ${network.name} (chainId: ${network.chainId})`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Balance:   ${ethers.formatEther(balance)} BNB`);
  console.log(`Treasury:  ${TREASURY}`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (parseFloat(ethers.formatEther(balance)) < 0.05) {
    throw new Error("Insufficient BNB balance — need at least 0.05 BNB for gas");
  }

  // ── 1. Deploy M1: LPYieldStrategy ──────────────────────────────────────
  console.log("1/7  Deploying M1 — LPYieldStrategy...");
  const LPYield = await ethers.getContractFactory("LPYieldStrategy");
  const m1Args  = [ethers.ZeroAddress, ethers.ZeroAddress, WBNB, USDF, ASTER_DEX_ROUTER, ASTER_DEX_POOL, LP_TOKEN];
  const m1      = await LPYield.deploy(...m1Args);
  await m1.waitForDeployment();
  const m1Addr  = await m1.getAddress();
  console.log(`     ✅ M1: ${m1Addr}`);

  // ── 2. Deploy M2: StakingStrategy ──────────────────────────────────────
  console.log("2/7  Deploying M2 — StakingStrategy...");
  const Staking = await ethers.getContractFactory("StakingStrategy");
  const m2Args  = [ethers.ZeroAddress, ethers.ZeroAddress, WBNB, AS_BNB_TOKEN, AS_BNB_MINTER];
  const m2      = await Staking.deploy(...m2Args);
  await m2.waitForDeployment();
  const m2Addr  = await m2.getAddress();
  console.log(`     ✅ M2: ${m2Addr}`);

  // ── 3. Deploy M3: LendingStrategy ──────────────────────────────────────
  console.log("3/7  Deploying M3 — LendingStrategy...");
  const Lending = await ethers.getContractFactory("LendingStrategy");
  const m3Args  = [ethers.ZeroAddress, ethers.ZeroAddress, WBNB, USDF, XVS, V_USDT, VENUS_COMPTROLLER, PANCAKE_ROUTER];
  const m3      = await Lending.deploy(...m3Args);
  await m3.waitForDeployment();
  const m3Addr  = await m3.getAddress();
  console.log(`     ✅ M3: ${m3Addr}`);

  // ── 4. Deploy M4: HedgeStrategy ────────────────────────────────────────
  console.log("4/7  Deploying M4 — HedgeStrategy...");
  const Hedge  = await ethers.getContractFactory("HedgeStrategy");
  const m4Args = [ethers.ZeroAddress, ethers.ZeroAddress, WBNB, USDF, ASTER_DEX_PRO, m1Addr];
  const m4     = await Hedge.deploy(...m4Args);
  await m4.waitForDeployment();
  const m4Addr = await m4.getAddress();
  console.log(`     ✅ M4: ${m4Addr}`);

  const strategies: [string, string, string, string] = [m1Addr, m2Addr, m3Addr, m4Addr];

  // ── 5. Deploy APEXBrain ─────────────────────────────────────────────────
  console.log("5/7  Deploying APEXBrain...");
  const Brain    = await ethers.getContractFactory("APEXBrain");
  const brainArgs = [ethers.ZeroAddress, strategies, ASTER_DEX_POOL];
  const brain    = await Brain.deploy(...brainArgs);
  await brain.waitForDeployment();
  const brainAddr = await brain.getAddress();
  console.log(`     ✅ Brain: ${brainAddr}`);

  // ── 6. Deploy APEXCompounder ────────────────────────────────────────────
  console.log("6/7  Deploying APEXCompounder...");
  const Compounder    = await ethers.getContractFactory("APEXCompounder");
  const compounderArgs = [ethers.ZeroAddress, brainAddr, WBNB, strategies];
  const compounder    = await Compounder.deploy(...compounderArgs);
  await compounder.waitForDeployment();
  const compounderAddr = await compounder.getAddress();
  console.log(`     ✅ Compounder: ${compounderAddr}`);

  // ── 7. Deploy APEXVault ─────────────────────────────────────────────────
  console.log("7/7  Deploying APEXVault...");
  const Vault    = await ethers.getContractFactory("APEXVault");
  const vaultArgs = [WBNB, brainAddr, TREASURY, strategies, compounderAddr];
  const vault    = await Vault.deploy(...vaultArgs);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`     ✅ Vault: ${vaultAddr}`);

  // ── Wire components ─────────────────────────────────────────────────────
  console.log("\n🔗 Wiring components...");
  await vault.setBrain(brainAddr);
  console.log("   vault.setBrain ✓");

  // Set vault on compounder if function exists
  try {
    await (compounder as any).setVault(vaultAddr);
    console.log("   compounder.setVault ✓");
  } catch { console.log("   compounder.setVault — skipped (no setter)"); }

  // ── BscScan verification ────────────────────────────────────────────────
  console.log("\n🔍 Verifying contracts on BscScan (30s delay)...");
  await sleep(30_000); // wait for propagation
  await verify(m1Addr,           m1Args);
  await verify(m2Addr,           m2Args);
  await verify(m3Addr,           m3Args);
  await verify(m4Addr,           m4Args);
  await verify(brainAddr,        brainArgs);
  await verify(compounderAddr,   compounderArgs);
  await verify(vaultAddr,        vaultArgs);

  // ── Write frontend .env.local ────────────────────────────────────────────
  const envContent = `# APEX ${network.name} Deployment — ${new Date().toISOString()}
NEXT_PUBLIC_CHAIN_ID=${chainId}
NEXT_PUBLIC_APEX_VAULT_ADDRESS=${vaultAddr}
NEXT_PUBLIC_APEX_BRAIN_ADDRESS=${brainAddr}
NEXT_PUBLIC_APEX_COMPOUNDER_ADDRESS=${compounderAddr}
NEXT_PUBLIC_WBNB_ADDRESS=${WBNB}
`;
  const envPath = path.resolve(__dirname, "../../frontend/.env.local");
  // Merge: read existing, replace/add APEX vars
  let existing = "";
  if (fs.existsSync(envPath)) {
    existing = fs.readFileSync(envPath, "utf8")
      .split("\n")
      .filter(l => !l.startsWith("NEXT_PUBLIC_APEX_") && !l.startsWith("NEXT_PUBLIC_CHAIN_ID="))
      .join("\n");
  }
  fs.writeFileSync(envPath, existing.trimEnd() + "\n\n" + envContent);
  console.log(`\n📝 Frontend .env.local updated: ${envPath}`);

  // ── Subgraph addresses ───────────────────────────────────────────────────
  const sgYamlPath = path.resolve(__dirname, "../../subgraph/subgraph.yaml");
  if (fs.existsSync(sgYamlPath)) {
    let sg = fs.readFileSync(sgYamlPath, "utf8");
    sg = sg.replace(/address: "0x0000000000000000000000000000000000000000"\n(\s*abi: APEXVault)/, `address: "${vaultAddr}"\n$1`);
    sg = sg.replace(/address: "0x0000000000000000000000000000000000000000"\n(\s*abi: APEXBrain)/, `address: "${brainAddr}"\n$1`);
    sg = sg.replace(/address: "0x0000000000000000000000000000000000000000"\n(\s*abi: APEXCompounder)/, `address: "${compounderAddr}"\n$1`);
    fs.writeFileSync(sgYamlPath, sg);
    console.log(`📝 subgraph.yaml updated with real addresses`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("🎉 DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`APEXVault:      ${vaultAddr}`);
  console.log(`APEXBrain:      ${brainAddr}`);
  console.log(`APEXCompounder: ${compounderAddr}`);
  console.log(`M1 LP Yield:    ${m1Addr}`);
  console.log(`M2 Staking:     ${m2Addr}`);
  console.log(`M3 Lending:     ${m3Addr}`);
  console.log(`M4 Hedge:       ${m4Addr}`);
  const bscscan = chainId === 97 ? "https://testnet.bscscan.com" : "https://bscscan.com";
  console.log(`\nBscScan: ${bscscan}/address/${vaultAddr}`);
  console.log("\n⚠️  Next steps:");
  console.log("  1. Run frontend: cd packages/frontend && npm run dev");
  console.log("  2. Deploy subgraph: cd packages/subgraph && npm run deploy");
  console.log("  3. Confirm AsterDEX addresses if using mocks");
}

main().catch(err => { console.error(err); process.exit(1); });
