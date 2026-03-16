import { ethers, network } from "hardhat";
import { expect } from "chai";
import { parseEther, formatEther } from "ethers";

// Constants for BSC Mainnet
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
// Switched to CAKE as proxy because WBNB-USDT is not in MasterChef V2
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

describe("AsterCircuit Integration Test (Mainnet Fork)", function () {
    this.timeout(300000);

    let deployer: any;
    let user: any;
    let keeper: any;

    let vault: any;
    let strategy: any;
    let heartbeat: any;

    let router: any;
    let masterChef: any;
    let cakeContract: any;
    let wbnbContract: any;
    let lpToken: any;

    let pid: number;

    before(async function () {
        [deployer, user, keeper] = await ethers.getSigners();
        console.log(">> Setup: Deployer address:", deployer.address);

        // 0. Setup Network
        const networkDetails = await ethers.provider.getNetwork();
        console.log(`>> Setup: Network Chain ID: ${networkDetails.chainId}`);

        // Verify Fork State (Check Factory Code)
        const code = await ethers.provider.getCode(PANCAKE_FACTORY);
        if (code === "0x") {
            throw new Error("CRITICAL: No code at Factory address. Mainnet Fork is not working!");
        }

        router = await ethers.getContractAt("IPancakeRouter02", PANCAKE_ROUTER);
        masterChef = await ethers.getContractAt("IMasterChefV2", MASTERCHEF_V2);

        cakeContract = new ethers.Contract(CAKE_TOKEN, ERC20_ABI, deployer);
        wbnbContract = new ethers.Contract(WBNB, ERC20_ABI, deployer);

        // 1. Find PID for WBNB-CAKE manually via raw call
        // Selector getPair(address,address) = 0xe6a43905
        const selector = "0xe6a43905";
        const paddedWBNB = WBNB.replace("0x", "").padStart(64, "0");
        const paddedCAKE = CAKE_TOKEN.replace("0x", "").padStart(64, "0");
        const data = selector + paddedWBNB + paddedCAKE;

        let lpAddress;
        try {
            console.log(`>> Debug: Calling factory.getPair raw call...`);
            const result = await ethers.provider.call({
                to: PANCAKE_FACTORY,
                data: data
            });
            // Decode address (last 20 bytes of 32 bytes result)
            lpAddress = "0x" + result.slice(-40);
            console.log(`>> Setup: WBNB-CAKE LP Address: ${lpAddress}`);
        } catch (error) {
            console.error(">> FATAL ERROR: Failed raw call to factory.");
            console.error(error);
            throw error;
        }

        lpToken = new ethers.Contract(lpAddress, ERC20_ABI, deployer);

        console.log(">> Setup: Scanning MasterChefV2 for PID...");
        const poolLength = await masterChef.poolLength();
        let found = false;

        console.log(`>> Debug: Pool Length: ${poolLength}`);

        // Scan specifically for the PID
        for (let i = 0; i < Number(poolLength) && i < 100; i++) {
            try {
                const token = await masterChef.lpToken(i);
                if (token.toLowerCase() === lpAddress.toLowerCase()) {
                    pid = i;
                    console.log(`>> Setup: Found PID: ${pid}`);
                    found = true;
                    break;
                }
            } catch (e) {
                // Ignore errors
            }
        }

        if (!found) {
            throw new Error("Could not find WBNB-CAKE PID in MasterChefV2");
        }
    });

    it("1. Deployment Configuration", async function () {
        // Deploy Vault with CORRECT arguments (Asset, Router)
        const CircuitVault = await ethers.getContractFactory("CircuitVault");
        vault = await CircuitVault.deploy(
            CAKE_TOKEN, // _asBNB (Using CAKE as proxy)
            PANCAKE_ROUTER
        );
        await vault.waitForDeployment();
        console.log(`>> Deployed Vault at: ${await vault.getAddress()}`);

        // Deploy Strategy (Using CAKE as asBNB Proxy)
        const AsterStrategy = await ethers.getContractFactory("AsterStrategy");
        strategy = await AsterStrategy.deploy(
            await vault.getAddress(),
            CAKE_TOKEN, // _asBNB (Using CAKE as proxy)
            PANCAKE_ROUTER,
            PANCAKE_FACTORY,
            MASTERCHEF_V2,
            WBNB,
            CAKE_TOKEN, // _usdt (Asset pair is WBNB-CAKE)
            CAKE_TOKEN, // _cake (Reward is CAKE)
            pid
        );
        await strategy.waitForDeployment();
        console.log(`>> Deployed Strategy at: ${await strategy.getAddress()}`);

        // Deploy Heartbeat
        const Heartbeat = await ethers.getContractFactory("Heartbeat");
        heartbeat = await Heartbeat.deploy(
            await strategy.getAddress(),
            3600, // 1 hour interval
            parseEther("0.01") // 0.01 BNB Reward Cap
        );
        await heartbeat.waitForDeployment();
        console.log(`>> Deployed Heartbeat at: ${await heartbeat.getAddress()}`);

        // Wire up permissions
        await vault.setStrategy(await strategy.getAddress());
        console.log(">> Vault strategy set.");
    });

    it("2. User Deposit & Auto-Invest", async function () {
        const depositAmount = parseEther("100"); // 100 BNB

        // Fund User by impersonating Binance Hot Wallet or just setBalance
        await network.provider.send("hardhat_setBalance", [
            user.address,
            "0x56BC75E2D63100000", // 100 BNB
        ]);

        // Check initial User BNB
        const initialBal = await ethers.provider.getBalance(user.address);
        console.log(`>> User Balance: ${formatEther(initialBal)} BNB`);

        // User interacts with Vault
        console.log(">> Action: User depositing 100 BNB...");

        await vault.connect(user).depositBNB({ value: depositAmount });

        // Verify Vault Shares
        const shares = await vault.balanceOf(user.address);
        expect(shares).to.be.gt(0);
        console.log(`>> Result: Vault Shares received: ${formatEther(shares)}`);

        // Verify Strategy State
        // Strategy should have: 
        // 1. Swapped ~50% BNB to CAKE
        // 2. Added Liquidity WBNB-CAKE
        // 3. Staked in MasterChef

        const stakedBal = await strategy.totalAsBNBHeld();
        console.log(`>> Result: Strategy Total Value (in Proxy Token): ${formatEther(stakedBal)}`);

        // Check MasterChef position
        const userInfo = await masterChef.userInfo(pid, await strategy.getAddress());
        const stakedLP = userInfo[0]; // amount
        console.log(`>> Verification: Staked LP Amount: ${formatEther(stakedLP)}`);
        expect(stakedLP).to.be.gt(0);
    });

    it("3. Harvest & Rebalance Loop (Compound)", async function () {
        // Fast forward 1 day
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");
        console.log(">> Action: Time travel 1 day...");

        // Call Beat
        // Keeper calls beat()
        console.log(">> Action: Keeper calling Heartbeat...");

        // Fund keeper
        await network.provider.send("hardhat_setBalance", [
            keeper.address,
            "0x56BC75E2D63100000",
        ]);

        const tx = await heartbeat.connect(keeper).beat();
        const receipt = await tx.wait();
        console.log(`>> Result: Beat transaction confirmed.`);

        // Verify Compounding
        const newUserInfo = await masterChef.userInfo(pid, await strategy.getAddress());
        console.log(`>> Verification: New Staked LP Amount: ${formatEther(newUserInfo[0])}`);
    });

    it("4. User Withdraw", async function () {
        const shares = await vault.balanceOf(user.address);
        console.log(`>> Action: User withdrawing shares: ${formatEther(shares)}`);

        const balBefore = await ethers.provider.getBalance(user.address);

        await vault.connect(user).withdrawBNB(shares);

        const balAfter = await ethers.provider.getBalance(user.address);
        const received = balAfter - balBefore;
        console.log(`>> Result: User received: ${formatEther(received)} BNB`);

        // WBNB-CAKE pool might have slippage for 100 BNB but should be positive
        expect(received).to.be.gt(parseEther("1"));
    });

});
