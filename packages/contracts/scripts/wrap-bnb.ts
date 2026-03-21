import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * Wrap BNB → WBNB on BSC Testnet
 * ────────────────────────────────
 * Calls deposit() on the WBNB contract, converting 0.1 tBNB to WBNB.
 * The WBNB lands in your deployer wallet — ready to deposit into APEX.
 *
 * Run:
 *   npx hardhat run scripts/wrap-bnb.ts --network bscTestnet
 */

const WBNB_TESTNET = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const WBNB_ABI = ["function deposit() external payable", "function balanceOf(address) external view returns (uint256)"];
const WRAP_AMOUNT = ethers.parseEther("0.05"); // wrap 0.05 tBNB

async function main() {
  const [signer] = await ethers.getSigners();
  const bnbBalance = await ethers.provider.getBalance(signer.address);

  console.log("\n🔄 WBNB Wrap Script");
  console.log("═══════════════════════════════════");
  console.log("Wallet:      ", signer.address);
  console.log("tBNB balance:", ethers.formatEther(bnbBalance), "tBNB");

  if (bnbBalance < WRAP_AMOUNT + ethers.parseEther("0.002")) {
    throw new Error("Not enough tBNB. Need at least 0.052 tBNB (0.05 to wrap + gas).");
  }

  const wbnb = new ethers.Contract(WBNB_TESTNET, WBNB_ABI, signer);
  const beforeBalance = await wbnb.balanceOf(signer.address);
  console.log("WBNB before:", ethers.formatEther(beforeBalance), "WBNB");

  console.log("\nWrapping 0.05 tBNB → WBNB...");
  const tx = await wbnb.deposit({ value: WRAP_AMOUNT });
  console.log("TX hash:    ", tx.hash);
  await tx.wait();

  const afterBalance = await wbnb.balanceOf(signer.address);
  console.log("\n✅ Done!");
  console.log("WBNB after: ", ethers.formatEther(afterBalance), "WBNB");
  console.log(`BscScan:     https://testnet.bscscan.com/tx/${tx.hash}`);
  console.log("\n→ Import WBNB token in MetaMask:");
  console.log("  Address:", WBNB_TESTNET);
  console.log("  Symbol: WBNB | Decimals: 18");
}

main().catch(err => { console.error("\n❌", err.message); process.exit(1); });
