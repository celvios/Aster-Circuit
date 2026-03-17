import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * APEX Local Deploy Script
 * ────────────────────────
 * Deploys the full APEX stack using mock contracts to a local Hardhat node.
 * After deployment, writes a `.env.local` snippet for the frontend.
 *
 * Usage:
 *   Terminal 1:  npx hardhat node
 *   Terminal 2:  npx hardhat run scripts/deploy-local.ts --network localhost
 */

async function main() {
  const [deployer, , , , , treasury] = await ethers.getSigners();
  console.log("\n⚡ APEX Local Deployment");
  console.log("═══════════════════════════════════════════════");
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Treasury:  ${treasury.address}`);
  console.log("");

  // ── 1. Deploy MockWBNB ──────────────────────────────────────────────────
  const MockWBNB = await ethers.getContractFactory("MockWBNB");
  const wbnb = await MockWBNB.deploy();
  await wbnb.waitForDeployment();
  const wbnbAddr = await wbnb.getAddress();
  console.log(`✅ MockWBNB:          ${wbnbAddr}`);

  // ── 2. Deploy MockAsterDEXPool ──────────────────────────────────────────
  const MockPool = await ethers.getContractFactory("MockAsterDEXPool");
  const pool = await MockPool.deploy();
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log(`✅ MockAsterDEXPool:  ${poolAddr}`);

  // ── 3. Deploy 4 MockAPEXStrategies ──────────────────────────────────────
  const MockStrat = await ethers.getContractFactory("MockAPEXStrategy");
  const stratNames = ["M1 LP Yield", "M2 Staking", "M3 Lending", "M4 Hedge"];
  const stratAddrs: string[] = [];
  const strats: any[] = [];

  for (let i = 0; i < 4; i++) {
    const s = await MockStrat.deploy(wbnbAddr, ethers.ZeroAddress, ethers.ZeroAddress);
    await s.waitForDeployment();
    const addr = await s.getAddress();
    stratAddrs.push(addr);
    strats.push(s);
    console.log(`✅ ${stratNames[i]}:  ${addr}`);
  }

  const strategies: [string, string, string, string] = [
    stratAddrs[0], stratAddrs[1], stratAddrs[2], stratAddrs[3]
  ];

  // ── 4. Deploy APEXVault ─────────────────────────────────────────────────
  const VaultF = await ethers.getContractFactory("APEXVault");
  const vault = await VaultF.deploy(
    wbnbAddr,
    ethers.ZeroAddress,    // brain placeholder
    treasury.address,
    strategies,
    ethers.ZeroAddress     // compounder placeholder
  );
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`✅ APEXVault:         ${vaultAddr}`);

  // ── 5. Deploy APEXBrain ─────────────────────────────────────────────────
  const BrainF = await ethers.getContractFactory("APEXBrain");
  const brain = await BrainF.deploy(vaultAddr, strategies, poolAddr);
  await brain.waitForDeployment();
  const brainAddr = await brain.getAddress();
  console.log(`✅ APEXBrain:         ${brainAddr}`);

  // ── 6. Deploy APEXCompounder ────────────────────────────────────────────
  const CompF = await ethers.getContractFactory("APEXCompounder");
  const compounder = await CompF.deploy(vaultAddr, brainAddr, wbnbAddr, strategies);
  await compounder.waitForDeployment();
  const compounderAddr = await compounder.getAddress();
  console.log(`✅ APEXCompounder:    ${compounderAddr}`);

  // ── 7. Wire everything ──────────────────────────────────────────────────
  console.log("\n🔗 Wiring contracts...");
  await vault.setBrain(brainAddr);
  await vault.setCompounder(compounderAddr);
  console.log("   Vault → Brain ✓");
  console.log("   Vault → Compounder ✓");

  // ── 8. Seed: Mint WBNB to deployer + deposit ───────────────────────────
  console.log("\n🌱 Seeding initial state...");
  const seedAmount = ethers.parseEther("100");
  await wbnb.mint(deployer.address, seedAmount);
  console.log(`   Minted 100 WBNB to deployer`);

  // Set initial APYs on strategies
  const apys = [1200, 800, 600, 400]; // 12%, 8%, 6%, 4%
  for (let i = 0; i < 4; i++) {
    await strats[i].setCurrentAPY(apys[i]);
  }
  console.log(`   Set strategy APYs: ${apys.map(a => `${a/100}%`).join(", ")}`);

  // Deposit 50 WBNB into vault
  const depositAmt = ethers.parseEther("50");
  await wbnb.approve(vaultAddr, depositAmt);
  await vault.deposit(depositAmt, deployer.address);
  console.log(`   Deposited 50 WBNB into vault`);

  // Set mock pool prices
  await pool.setSpotPrice(ethers.parseEther("310"));
  await pool.setTWAP(ethers.parseEther("300"));
  console.log(`   Pool: spot=310, twap=300 (3.3% vol)`);

  // ── 9. Output summary ──────────────────────────────────────────────────
  const totalAssets = await vault.totalAssets();
  const pps = await vault.pricePerShare();
  console.log("\n═══════════════════════════════════════════════");
  console.log("📊 Post-Deploy Stats:");
  console.log(`   TVL:           ${ethers.formatEther(totalAssets)} WBNB`);
  console.log(`   PricePerShare: ${ethers.formatEther(pps)}`);
  console.log(`   Shares:        ${ethers.formatEther(await vault.balanceOf(deployer.address))}`);
  console.log("═══════════════════════════════════════════════");

  // ── 10. Write .env.local for frontend ──────────────────────────────────
  const envContent = `# APEX Local Deployment — Generated ${new Date().toISOString()}
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_APEX_VAULT_ADDRESS=${vaultAddr}
NEXT_PUBLIC_APEX_BRAIN_ADDRESS=${brainAddr}
NEXT_PUBLIC_APEX_COMPOUNDER_ADDRESS=${compounderAddr}
NEXT_PUBLIC_WBNB_ADDRESS=${wbnbAddr}
NEXT_PUBLIC_POOL_ADDRESS=${poolAddr}
`;

  const envPath = path.resolve(__dirname, "../../frontend/.env.local.apex");
  fs.writeFileSync(envPath, envContent);
  console.log(`\n📝 Frontend env written to: ${envPath}`);
  console.log("   Copy to .env.local or merge with existing.\n");

  // Print Hardhat accounts for MetaMask import
  console.log("🔑 Import these into MetaMask (localhost:8545):");
  console.log("   Account 0 (deployer): 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  console.log("   Account 5 (treasury): 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
