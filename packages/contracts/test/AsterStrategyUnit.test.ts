import { ethers } from "hardhat";
import { expect } from "chai";

describe("AsterStrategy Unit Tests (Mocks)", function () {
    let deployer: any, vault: any;
    let strategy: any;
    let wbnb: any, usdt: any, asbnb: any, cake: any;
    let router: any, factory: any, masterChef: any;
    let lpToken: any;

    beforeEach(async function () {
        [deployer, vault] = await ethers.getSigners();

        // 1. Deploy Mocks
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        wbnb = await MockERC20.deploy("Wrapped BNB", "WBNB");
        usdt = await MockERC20.deploy("Tether", "USDT");
        asbnb = await MockERC20.deploy("Aster BNB", "asBNB");
        cake = await MockERC20.deploy("Pancake", "CAKE");

        const MockFactory = await ethers.getContractFactory("MockPancakeFactory");
        factory = await MockFactory.deploy();

        const MockRouter = await ethers.getContractFactory("MockPancakeRouter");
        router = await MockRouter.deploy(await factory.getAddress(), await wbnb.getAddress());

        const MockMasterChef = await ethers.getContractFactory("MockMasterChef");
        masterChef = await MockMasterChef.deploy();

        // 2. Setup Environment
        // Create LP Pair WBNB-USDT
        await factory.createPair(await wbnb.getAddress(), await usdt.getAddress());
        lpToken = await ethers.getContractAt("MockERC20", await factory.getPair(await wbnb.getAddress(), await usdt.getAddress()));

        // Add to MasterChef (PID 0)
        await masterChef.addPool(await lpToken.getAddress());

        // 3. Deploy Strategy
        const AsterStrategy = await ethers.getContractFactory("AsterStrategy");
        strategy = await AsterStrategy.deploy(
            vault.address,
            await asbnb.getAddress(),
            await router.getAddress(),
            await factory.getAddress(),
            await masterChef.getAddress(),
            await wbnb.getAddress(),
            await usdt.getAddress(),
            await cake.getAddress(),
            0 // PID 0
        );
        await strategy.waitForDeployment();
    });

    it("Should initialize correctly", async function () {
        expect(await strategy.vault()).to.equal(vault.address);
    });

    it("Should deposit and swap BNB to asBNB", async function () {
        const depositAmount = ethers.parseEther("1");

        // Mock WBNB deposit (Strategy treats msg.value as BNB to swap)
        // Note: Strategy uses msg.value -> router (which mocks swap)

        // We need to send BNB to strategy via 'deposit'
        // Strategy.deposit() is called by Vault
        // Strategy implementation:
        // checks wbnb balance or uses ETH? 
        // My implementation: checks wbnb balance OR address(this).balance.
        // It calls `_swapBNBForAsBNB`.

        // Fund Strategy with WBNB first? 
        // Logic: "Unwrap WBNB to BNB ... Swap BNB -> asBNB"

        // Let's send ETH to strategy first (simulating Vault transfer)
        await deployer.sendTransaction({
            to: await strategy.getAddress(),
            value: depositAmount
        });

        // Call deposit
        await strategy.connect(vault).deposit(depositAmount);

        // Check asBNB balance
        // MockRouter mints asBNB 1:1
        const balance = await asbnb.balanceOf(await strategy.getAddress());
        expect(balance).to.equal(depositAmount);
    });

    it("Should withdraw and swap asBNB to BNB", async function () {
        // Setup state: Strategy has asBNB
        const amount = ethers.parseEther("1");
        await asbnb.mint(await strategy.getAddress(), amount);

        // Force update tracking variables (only way is if logic allows or we cheat state? 
        // Strategy uses `totalAsBNBHeld`. If we mint directly, `totalAsBNBHeld` is 0.
        // `withdraw` subtracts from `totalAsBNBHeld`.
        // So we must deposit first to set state.

        // Deposit 1 BNB
        await deployer.sendTransaction({ to: await strategy.getAddress(), value: amount });
        await strategy.connect(vault).deposit(amount);

        // Now withdraw
        const initialVaultBal = await ethers.provider.getBalance(vault.address);

        // Note: `withdraw` sends WBNB to vault (wrapped).
        // My mock router sends ETH back? 
        // Strategy: `_swapAsBNBForBNB` -> `IWBNB.deposit` -> `wbnb.transfer(vault)`

        await strategy.connect(vault).withdraw(amount);

        const vaultWBNB = await wbnb.balanceOf(vault.address);
        expect(vaultWBNB).to.equal(amount);
    });
});
