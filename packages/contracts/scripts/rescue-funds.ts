import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * Fund Rescue Script
 * ──────────────────
 * Sweeps all BNB from one wallet to another, keeping just enough for gas.
 *
 * Add to packages/contracts/.env:
 *   RESCUE_PRIVATE_KEY=<private key of the source wallet>
 *   RESCUE_TO_ADDRESS=<destination wallet address>
 *
 * Run:
 *   npx ts-node scripts/rescue-funds.ts
 */

const RESCUE_PRIVATE_KEY = process.env.RESCUE_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
const RESCUE_TO_ADDRESS  = process.env.RESCUE_TO_ADDRESS;

const BSC_RPC = "https://bsc-dataseed1.defibit.io"; // public BSC mainnet node

async function main() {
  if (!RESCUE_PRIVATE_KEY) {
    throw new Error("Set RESCUE_PRIVATE_KEY in .env");
  }
  if (!RESCUE_TO_ADDRESS) {
    throw new Error("Set RESCUE_TO_ADDRESS in .env");
  }

  const provider = new ethers.JsonRpcProvider(BSC_RPC, { chainId: 56, name: "bnb" });
  const wallet   = new ethers.Wallet(RESCUE_PRIVATE_KEY.startsWith("0x") ? RESCUE_PRIVATE_KEY : "0x" + RESCUE_PRIVATE_KEY, provider);

  const fromAddress = wallet.address;
  const balance     = await provider.getBalance(fromAddress);

  console.log("\n🔑 Rescue Wallet:", fromAddress);
  console.log("📬 Destination:  ", RESCUE_TO_ADDRESS);
  console.log("💰 Balance:      ", ethers.formatEther(balance), "BNB");

  if (balance === 0n) {
    console.log("\n⚠️  No BNB to sweep — balance is 0.");
    return;
  }

  // Estimate gas: simple transfer = 21000 gas units, BSC gas price ~1-3 gwei
  const feeData  = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("3", "gwei");
  const gasCost  = gasPrice * 21000n;
  const sendAmt  = balance - gasCost;

  if (sendAmt <= 0n) {
    console.log("\n⚠️  Balance too low to cover gas. Need more BNB.");
    return;
  }

  console.log("\nGas price:  ", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("Gas cost:   ", ethers.formatEther(gasCost), "BNB");
  console.log("Sending:    ", ethers.formatEther(sendAmt), "BNB");
  console.log("\nSending...");

  const tx = await wallet.sendTransaction({
    to:       RESCUE_TO_ADDRESS,
    value:    sendAmt,
    gasLimit: 21000n,
    gasPrice: gasPrice,
  });

  console.log("TX hash:    ", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("\n✅ Confirmed in block", receipt?.blockNumber);
  console.log(`BscScan: https://bscscan.com/tx/${tx.hash}`);
}

main().catch(err => { console.error("\n❌", err.message); process.exit(1); });
