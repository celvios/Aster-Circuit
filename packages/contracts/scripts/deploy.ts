import { ethers } from "hardhat";

async function main() {
    console.log("🚀 Deploying AsterCircuit contracts to BSC Fork...\n");

    // Get signers
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");

    // Contract addresses from .env
    const ASBNB_TOKEN = process.env.ASBNB_TOKEN!;
    const ASBNB_MINTER = process.env.ASBNB_MINTER!;
    const PANCAKE_ROUTER = process.env.PANCAKE_ROUTER!;
    const PANCAKE_FACTORY = process.env.PANCAKE_FACTORY!;
    const MASTERCHEF_V2 = process.env.MASTERCHEF_V2!;
    const WBNB = process.env.WBNB!;
    const USDT = process.env.USDT!;
    const CAKE = process.env.CAKE!;

    // TODO: Find BNB-USDT pool ID in MasterChef
    const POOL_ID = 1; // Placeholder - need to find actual pool ID

    console.log("📋 Contract Addresses:");
    console.log("  asBNB Token:", ASBNB_TOKEN);
    console.log("  asBNB Minter:", ASBNB_MINTER);
    console.log("  PancakeSwap Router:", PANCAKE_ROUTER);
    console.log(" MasterChef V2:", MASTERCHEF_V2);
    console.log("  Pool ID:", POOL_ID, "\n");

    // Deploy CircuitVault
    console.log("1️⃣  Deploying CircuitVault...");
    const CircuitVault = await ethers.getContractFactory("CircuitVault");
    const vault = await CircuitVault.deploy(ASBNB_TOKEN, ASBNB_MINTER);
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();
    console.log("✅ CircuitVault deployed to:", vaultAddress, "\n");

    // Deploy AsterStrategy
    console.log("2️⃣  Deploying AsterStrategy...");
    const AsterStrategy = await ethers.getContractFactory("AsterStrategy");
    const strategy = await AsterStrategy.deploy(
        vaultAddress,
        ASBNB_TOKEN,
        ASBNB_MINTER,
        PANCAKE_ROUTER,
        PANCAKE_FACTORY,
        MASTERCHEF_V2,
        WBNB,
        USDT,
        CAKE,
        POOL_ID
    );
    await strategy.waitForDeployment();
    const strategyAddress = await strategy.getAddress();
    console.log("✅ AsterStrategy deployed to:", strategyAddress, "\n");

    // Deploy Heartbeat
    console.log("3️⃣  Deploying Heartbeat...");
    const BEAT_INTERVAL = process.env.BEAT_INTERVAL || "3600"; // 1 hour
    const CALLER_REWARD_BPS = process.env.CALLER_REWARD_BPS || "10"; // 0.1%

    const Heartbeat = await ethers.getContractFactory("Heartbeat");
    const heartbeat = await Heartbeat.deploy(
        strategyAddress,
        BEAT_INTERVAL,
        CALLER_REWARD_BPS
    );
    await heartbeat.waitForDeployment();
    const heartbeatAddress = await heartbeat.getAddress();
    console.log("✅ Heartbeat deployed to:", heartbeatAddress, "\n");

    // Wire contracts together
    console.log("4️⃣  Wiring contracts together...");

    // Set strategy in vault
    const setStrategyTx = await vault.setStrategy(strategyAddress);
    await setStrategyTx.wait();
    console.log("✅ Vault.setStrategy() called");

    console.log("\n🎉 Deployment Complete!");
    console.log("\n📝 Deployed Contracts:");
    console.log("  CircuitVault:", vaultAddress);
    console.log("  AsterStrategy:", strategyAddress);
    console.log("  Heartbeat:", heartbeatAddress);

    console.log("\n📌 Next Steps:");
    console.log("  1. Find correct BNB-USDT pool ID in MasterChef");
    console.log("  2. Test deposit/withdraw on vault");
    console.log("  3. Test compound logic");
    console.log("  4. Test heartbeat automation");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
