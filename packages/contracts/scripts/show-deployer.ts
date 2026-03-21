import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("\n🔑 Deployer Address:", deployer.address);
  console.log("💰 tBNB Balance:    ", ethers.formatEther(balance), "tBNB");
  console.log("\n→ Send testnet BNB to:", deployer.address);
  console.log("→ Faucet: https://www.bnbchain.org/en/testnet-faucet");

  if (parseFloat(ethers.formatEther(balance)) < 0.05) {
    console.log("\n⚠️  Need at least 0.05 tBNB to deploy. Current balance is insufficient.");
  } else {
    console.log("\n✅ Balance sufficient — ready to deploy!");
    console.log("   Run: npx hardhat run scripts/deployAPEX.ts --network bscTestnet");
  }
}

main().catch(err => { console.error(err); process.exit(1); });
