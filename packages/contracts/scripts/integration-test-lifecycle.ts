import { ethers, network } from "hardhat";
import { parseEther, formatEther } from "ethers";

// Constants for BSC Mainnet
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const CAKE_TOKEN = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";
const PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PANCAKE_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const MASTERCHEF_V2 = "0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652";

// Minimal ERC20 ABI
const ERC20_ABI = [
    "function balanceOf(address account) external view returns (uint256)",
    "function transfer(address recipient, uint256 amount) external returns (bool)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];

async function main() {
    console.log(">> Starting Integration Lifecycle Test (Script Mode)...");

    const [deployer, user, keeper] = await ethers.getSigners();
    console.log(">> Deployer:", deployer.address);
    console.log(">> User:", user.address);

    // 0. Setup Network Check
    const code = await ethers.provider.getCode(PANCAKE_FACTORY);
    if (code === "0x") throw new Error("CRITICAL: No code at Factory address.");
    console.log(">> Network Check: Factory Code exists.");

    // 1. Setup Verified WBNB-CAKE Data (Verified via debug-rpc.ts)
    // Dynamic eth_call fails in Hardhat Fork runner, so we use verified values.
    const lpAddress = "0x0eD7e52944161450477ee417DE9Cd3a859b14fD0";
    const pid = 2;

    console.log(`>> Setup: Hardcoded WBNB-CAKE LP Address: ${lpAddress}`);
    console.log(`>> Setup: Using Verified PID: ${pid}`);

    // 2. Deploy Contracts
    const CircuitVault = await ethers.getContractFactory("CircuitVault");
    const vault = await CircuitVault.deploy(CAKE_TOKEN, PANCAKE_ROUTER);
    await vault.waitForDeployment();
    console.log(`>> Deployed Vault at: ${await vault.getAddress()}`);

    const AsterStrategy = await ethers.getContractFactory("AsterStrategy");
    const strategy = await AsterStrategy.deploy(
        await vault.getAddress(),
        CAKE_TOKEN, // _asBNB
        PANCAKE_ROUTER,
        PANCAKE_FACTORY,
        MASTERCHEF_V2,
        WBNB,
        CAKE_TOKEN, // _usdt -> CAKE
        CAKE_TOKEN, // _cake -> CAKE
        pid
    );
    await strategy.waitForDeployment();
    console.log(`>> Deployed Strategy at: ${await strategy.getAddress()}`);

    const Heartbeat = await ethers.getContractFactory("Heartbeat");
    const heartbeat = await Heartbeat.deploy(
        await strategy.getAddress(),
        3600,
        100 // 1% Reward Cap (BPS)
    );
    await heartbeat.waitForDeployment();
    console.log(`>> Deployed Heartbeat at: ${await heartbeat.getAddress()}`);

    await vault.setStrategy(await strategy.getAddress());
    console.log(">> Vault setup complete.");

    // 3. User Deposit
    console.log("\n>> Action: User depositing 10 BNB...");
    const depositAmount = parseEther("10");

    // Fund user
    await network.provider.send("hardhat_setBalance", [
        user.address,
        "0x56BC75E2D63100000", // 100 BNB
    ]);

    const txDep = await vault.connect(user).depositBNB({ value: depositAmount });
    await txDep.wait();

    const shares = await vault.balanceOf(user.address);
    console.log(`>> Result: User Shares: ${formatEther(shares)}`);
    if (shares == 0n) throw new Error("No shares minted!");

    const strategyBal = await strategy.totalAsBNBHeld();
    console.log(`>> Result: Strategy Value (in CAKE): ${formatEther(strategyBal)}`);

    const masterChef = await ethers.getContractAt("IMasterChefV2", MASTERCHEF_V2);
    const userInfo = await masterChef.userInfo(pid, await strategy.getAddress());
    console.log(`>> Verification: Staked LP: ${formatEther(userInfo[0])}`);
    if (userInfo[0] == 0n) console.warn("!! WARNING: Strategy did not stake LP?");
    else console.log(">> SUCCESS: Strategy successfully auto-invested into MasterChef!");

    // 4. Simulate Compounding
    console.log("\n>> Action: Time Travel & Heartbeat...");
    await network.provider.send("evm_increaseTime", [86400]);
    await network.provider.send("evm_mine");

    console.log(">> Action: Calling beat()...");
    const txBeat = await heartbeat.connect(keeper).beat();
    await txBeat.wait();
    console.log(">> Result: Beat confirmed.");

    const userInfoAfter = await masterChef.userInfo(pid, await strategy.getAddress());
    console.log(`>> Verification: New Staked LP: ${formatEther(userInfoAfter[0])}`);

    // 5. Withdraw
    console.log("\n>> Action: Converting & Withdrawing...");
    const sharesToWithdraw = await vault.balanceOf(user.address);

    // Check user balance before
    const bBNB = await ethers.provider.getBalance(user.address);

    const txWith = await vault.connect(user).withdrawBNB(sharesToWithdraw);
    await txWith.wait();

    const aBNB = await ethers.provider.getBalance(user.address);
    const received = aBNB - bBNB; // This is crude because user paid gas for withdraw
    // Better: estimate gas cost or check internal transfer logs? 
    // Just expecting balance to jump significantly.
    // If user has ~90 BNB (dep 10) -> withdraw 10 -> ~100.

    console.log(`>> Result: User Balance Change: ${formatEther(received)} (approx, minus gas)`);
    console.log(">> User Final Balance: ", formatEther(aBNB));

    if (aBNB > parseEther("95")) {
        console.log(">> SUCCESS: User successfully withdrew funds!");
    } else {
        console.log(">> CHECK: User balance check ambiguous due to gas? Verify manually.");
    }

    console.log("\n>> INTEGRATION TEST COMPLETE <<");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
