import { ethers, network } from "hardhat";
import { expect } from "chai";
import * as dotenv from "dotenv";

dotenv.config();

describe("AsterStrategy Swap Approach", function () {
    const ASBNB_TOKEN = process.env.ASBNB_TOKEN!;
    const WBNB_ADDRESS = process.env.WBNB!;
    const PANCAKE_ROUTER = process.env.PANCAKE_ROUTER!;
    const PANCAKE_FACTORY = process.env.PANCAKE_FACTORY!;
    const MASTERCHEF_V2 = process.env.MASTERCHEF_V2!;
    const USDT = process.env.USDT!;
    const CAKE = process.env.CAKE!;

    it("Should deposit wBNB and swap for asBNB", async function () {
        console.log("Forking Mainnet...");
        await network.provider.request({
            method: "hardhat_reset",
            params: [{
                forking: {
                    jsonRpcUrl: process.env.BSC_RPC_URL,
                    blockNumber: 44000000,
                },
            }],
        });

        const [deployer] = await ethers.getSigners();
        console.log("Deployer:", deployer.address);

        // 1. Get contracts & Resolve PID
        const wbnb = await ethers.getContractAt("IERC20", WBNB_ADDRESS);
        const asBNB = await ethers.getContractAt("IERC20", ASBNB_TOKEN);

        // Find PID for WBNB-USDT
        const factory = await ethers.getContractAt("IPancakeFactory", PANCAKE_FACTORY);
        const lpToken = await factory.getPair(WBNB_ADDRESS, USDT);
        console.log("LP Pair:", lpToken);

        const masterChef = await ethers.getContractAt("IMasterChefV2", MASTERCHEF_V2);
        const poolLength = await masterChef.poolLength();
        console.log("MasterChef Pools:", poolLength.toString());

        let poolId = -1;
        // Optimization: Check typical range or loop
        for (let i = 0; i < Number(poolLength) && i < 400; i++) {
            try {
                const token = await masterChef.lpToken(i);
                if (token.toLowerCase() === lpToken.toLowerCase()) {
                    poolId = i;
                    console.log("Found WBNB-USDT PID:", poolId);
                    break;
                }
            } catch (e) { }
        }

        if (poolId === -1) {
            throw new Error("Could not find WBNB-USDT Pool ID on Fork. Cannot deploy strategy.");
        }

        // 2. Wrap BNB to WBNB for testing
        const wrapAmount = ethers.parseEther("10");
        const IWBNB = await ethers.getContractAt("IWBNB", WBNB_ADDRESS);
        await IWBNB.deposit({ value: wrapAmount });
        console.log("Wrapped 10 BNB to WBNB");

        // 3. Deploy Strategy
        // Note: In real app, Vault deploys Strategy. Here we mock vault as deployer.
        const mockVault = deployer.address;

        const AsterStrategy = await ethers.getContractFactory("AsterStrategy");
        const strategy = await AsterStrategy.deploy(
            mockVault,
            ASBNB_TOKEN,
            PANCAKE_ROUTER,
            PANCAKE_FACTORY,
            MASTERCHEF_V2,
            WBNB_ADDRESS,
            USDT,
            CAKE,
            poolId
        );
        await strategy.waitForDeployment();
        const strategyAddress = await strategy.getAddress();
        console.log("AsterStrategy deployed at:", strategyAddress);

        // 4. Transfer WBNB to Strategy (Mocking Vault transfer)
        const depositAmount = ethers.parseEther("1");
        await wbnb.transfer(strategyAddress, depositAmount);
        console.log("Transferred 1 WBNB to Strategy");

        // 5. Call Deposit
        console.log("Calling deposit()...");
        const initialAsBNB = await asBNB.balanceOf(strategyAddress);
        expect(initialAsBNB).to.equal(0);

        // DEBUG: Find valid path
        const router = await ethers.getContractAt("IPancakeRouter02", PANCAKE_ROUTER);
        let validPath = [WBNB_ADDRESS, ASBNB_TOKEN];
        let canSwap = false;

        console.log("Checking Liquidity Paths...");

        // 1. Direct
        try {
            const out = await router.getAmountsOut(depositAmount, [WBNB_ADDRESS, ASBNB_TOKEN]);
            console.log("Path [WBNB -> asBNB] Valid. Est Output:", ethers.formatEther(out[1]));
            canSwap = true;
        } catch (e) {
            console.log("Path [WBNB -> asBNB] Invalid/No Liquidity.");
        }

        // 2. Via USDT
        if (!canSwap) {
            try {
                const out = await router.getAmountsOut(depositAmount, [WBNB_ADDRESS, USDT, ASBNB_TOKEN]);
                console.log("Path [WBNB -> USDT -> asBNB] Valid. Est Output:", ethers.formatEther(out[2]));
                validPath = [WBNB_ADDRESS, USDT, ASBNB_TOKEN];
                canSwap = true;
            } catch (e) {
                console.log("Path [WBNB -> USDT -> asBNB] Invalid.");
            }
        }

        if (!canSwap) {
            throw new Error("Cannot find liquid path on Fork to swap BNB -> asBNB. Verify ASBNB_TOKEN address or Fork State.");
        }

        // Note: Strategy currently hardcodes [WBNB, asBNB]. If that path is invalid, we expect failure here.
        await strategy.deposit(depositAmount);

        const finalAsBNB = await asBNB.balanceOf(strategyAddress);
        console.log("asBNB Balance after deposit:", ethers.formatEther(finalAsBNB));
        expect(finalAsBNB).to.be.gt(0);

        // 6. Test Withdraw
        console.log("Calling withdraw()...");
        // We want to withdraw 0.5 BNB worth
        const withdrawAmount = ethers.parseEther("0.5");

        await strategy.withdraw(withdrawAmount);

        const vaultWBNB = await wbnb.balanceOf(mockVault);
        // Vault (deployer) started with 9 (10-1) + gas used
        // But verifying accurate return might be tricky due to gas. 
        // Just verify we received WBNB back.
        console.log("Vault (Deployer) WBNB Balance:", ethers.formatEther(vaultWBNB));

        // Rough check: We had 9 remaining after transfer. + 0.5 withdraw = 9.5
        // (Assuming no swap fees/slippage for simplicity in check, but logic dictates some loss)
        expect(vaultWBNB).to.be.closeTo(ethers.parseEther("9.5"), ethers.parseEther("0.1"));
    });
});
