import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * APEXVault Unit Tests
 *
 * Validates:
 *   1. ERC-4626 share minting on deposit
 *   2. MIN_DEPOSIT guard enforcement
 *   3. 0.1% exit fee on withdraw
 *   4. pricePerShare() math
 *   5. totalAssets() aggregates all 4 strategies
 *   6. blendedAPY() computes weighted average correctly
 *   7. Pause functionality
 */

const BPS = 10_000n;
const EXIT_FEE_BPS = 10n;
const MIN_DEPOSIT = ethers.parseEther("0.01");

describe("APEXVault", () => {

    async function deployVaultFixture() {
        const [owner, alice, bob, treasury] = await ethers.getSigners();

        // Deploy MockWBNB as the vault asset
        const MockWBNB = await ethers.getContractFactory("MockWBNB");
        const wbnb = await MockWBNB.deploy();

        // Deploy mock pool (for Brain)
        const MockPool = await ethers.getContractFactory("MockAsterDEXPool");
        const pool = await MockPool.deploy();

        // Deploy 4 mock strategies
        const MockStrategy = await ethers.getContractFactory("MockAPEXStrategy");

        // We need the vault address before strategies, so use a placeholder
        const strategies: [string, string, string, string] = [
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
        ];

        // Deploy Brain
        const Brain = await ethers.getContractFactory("APEXBrain");
        const brain = await Brain.deploy(ethers.ZeroAddress, strategies, await pool.getAddress());

        // Deploy Vault
        const Vault = await ethers.getContractFactory("APEXVault");
        const vault = await Vault.deploy(
            await wbnb.getAddress(),
            await brain.getAddress(),
            treasury.address,
            strategies,
            ethers.ZeroAddress  // compounder
        );

        // Now deploy strategies with the real vault address
        const m1 = await MockStrategy.deploy(await wbnb.getAddress(), await vault.getAddress(), await brain.getAddress());
        const m2 = await MockStrategy.deploy(await wbnb.getAddress(), await vault.getAddress(), await brain.getAddress());
        const m3 = await MockStrategy.deploy(await wbnb.getAddress(), await vault.getAddress(), await brain.getAddress());
        const m4 = await MockStrategy.deploy(await wbnb.getAddress(), await vault.getAddress(), await brain.getAddress());

        // Wire strategies into vault
        await vault.setStrategy(0, await m1.getAddress());
        await vault.setStrategy(1, await m2.getAddress());
        await vault.setStrategy(2, await m3.getAddress());
        await vault.setStrategy(3, await m4.getAddress());

        // Set default APYs (5%)
        await m1.setCurrentAPY(500);
        await m2.setCurrentAPY(500);
        await m3.setCurrentAPY(500);
        await m4.setCurrentAPY(500);

        return { vault, wbnb, brain, pool, m1, m2, m3, m4, owner, alice, bob, treasury };
    }

    // ─────────────────────────────────────────────────────────────
    // 1. Deposit Guards
    // ─────────────────────────────────────────────────────────────

    describe("deposit()", () => {

        it("mints correct shares on first deposit (1:1 parity)", async () => {
            const { vault, wbnb, alice } = await loadFixture(deployVaultFixture);
            const depositAmt = ethers.parseEther("1");
            await wbnb.mint(alice.address, depositAmt);
            await wbnb.connect(alice).approve(await vault.getAddress(), depositAmt);

            await vault.connect(alice).deposit(depositAmt, alice.address);

            const shares = await vault.balanceOf(alice.address);
            expect(shares).to.equal(depositAmt); // 1:1 on first deposit
        });

        it("reverts when deposit is below MIN_DEPOSIT (0.01 WBNB)", async () => {
            const { vault, wbnb, alice } = await loadFixture(deployVaultFixture);
            const tooSmall = ethers.parseEther("0.009");
            await wbnb.mint(alice.address, tooSmall);
            await wbnb.connect(alice).approve(await vault.getAddress(), tooSmall);

            await expect(
                vault.connect(alice).deposit(tooSmall, alice.address)
            ).to.be.revertedWithCustomError(vault, "BelowMinDeposit");
        });

        it("correctly splits shares between two depositors", async () => {
            const { vault, wbnb, alice, bob } = await loadFixture(deployVaultFixture);
            const amt = ethers.parseEther("1");

            // Alice deposits first
            await wbnb.mint(alice.address, amt);
            await wbnb.connect(alice).approve(await vault.getAddress(), amt);
            await vault.connect(alice).deposit(amt, alice.address);

            // Bob deposits same amount
            await wbnb.mint(bob.address, amt);
            await wbnb.connect(bob).approve(await vault.getAddress(), amt);
            await vault.connect(bob).deposit(amt, bob.address);

            // Both should have equal shares
            expect(await vault.balanceOf(alice.address)).to.equal(await vault.balanceOf(bob.address));
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 2. Withdraw with Exit Fee
    // ─────────────────────────────────────────────────────────────

    describe("withdraw() exit fee", () => {

        it("applies 0.1% exit fee, sending remainder to receiver and fee to treasury", async () => {
            const { vault, wbnb, alice, treasury } = await loadFixture(deployVaultFixture);
            const depositAmt = ethers.parseEther("10");

            await wbnb.mint(alice.address, depositAmt);
            await wbnb.connect(alice).approve(await vault.getAddress(), depositAmt);
            await vault.connect(alice).deposit(depositAmt, alice.address);

            const shares = await vault.balanceOf(alice.address);
            const withdrawAmt = ethers.parseEther("5");
            const expectedFee = withdrawAmt * EXIT_FEE_BPS / BPS; // 0.005 WBNB
            const expectedNet = withdrawAmt - expectedFee;

            const treasuryBefore = await wbnb.balanceOf(treasury.address);
            const aliceBefore    = await wbnb.balanceOf(alice.address);

            // Burn shares to withdraw 5 WBNB
            await vault.connect(alice).approve(await vault.getAddress(), shares);
            await vault.connect(alice).withdraw(withdrawAmt, alice.address, alice.address);

            const treasuryAfter = await wbnb.balanceOf(treasury.address);
            const aliceAfter    = await wbnb.balanceOf(alice.address);

            expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);
            expect(aliceAfter - aliceBefore).to.equal(expectedNet);
        });

        it("reverts withdraw of 0 assets", async () => {
            const { vault, alice } = await loadFixture(deployVaultFixture);
            await expect(
                vault.connect(alice).withdraw(0n, alice.address, alice.address)
            ).to.be.revertedWithCustomError(vault, "ZeroAmount");
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 3. totalAssets() Aggregation
    // ─────────────────────────────────────────────────────────────

    describe("totalAssets()", () => {

        it("sums assets across all 4 strategies and idle vault balance", async () => {
            const { vault, wbnb, m1, m2, m3, m4 } = await loadFixture(deployVaultFixture);

            // Deposit 1 WBNB directly into each mock strategy
            await m1.setTotalAssets(ethers.parseEther("10"));
            await m2.setTotalAssets(ethers.parseEther("20"));
            await m3.setTotalAssets(ethers.parseEther("15"));
            await m4.setTotalAssets(ethers.parseEther("5"));

            // Also put 2 WBNB idle in the vault
            await wbnb.mint(await vault.getAddress(), ethers.parseEther("2"));

            const total = await vault.totalAssets();
            expect(total).to.equal(ethers.parseEther("52")); // 10+20+15+5+2
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 4. pricePerShare()
    // ─────────────────────────────────────────────────────────────

    describe("pricePerShare()", () => {

        it("returns 1e18 when supply is 0", async () => {
            const { vault } = await loadFixture(deployVaultFixture);
            expect(await vault.pricePerShare()).to.equal(ethers.parseEther("1"));
        });

        it("pricePerShare increases when strategies accrue yield", async () => {
            const { vault, wbnb, alice, m1 } = await loadFixture(deployVaultFixture);
            const depositAmt = ethers.parseEther("10");

            await wbnb.mint(alice.address, depositAmt);
            await wbnb.connect(alice).approve(await vault.getAddress(), depositAmt);
            await vault.connect(alice).deposit(depositAmt, alice.address);

            const initialPPS = await vault.pricePerShare();

            // Simulate yield: M1 gains 1 WBNB of yield
            await m1.setTotalAssets(ethers.parseEther("1"));

            const newPPS = await vault.pricePerShare();
            expect(newPPS).to.be.gt(initialPPS);
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 5. blendedAPY()
    // ─────────────────────────────────────────────────────────────

    describe("blendedAPY()", () => {

        it("returns correctly weighted APY from Brain weights and strategy APYs", async () => {
            const { vault, m1, m2, m3, m4 } = await loadFixture(deployVaultFixture);

            // Set all APYs to 1000 bps (10%), brain default weights 25/35/20/20
            await m1.setCurrentAPY(1000);
            await m2.setCurrentAPY(1000);
            await m3.setCurrentAPY(1000);
            await m4.setCurrentAPY(1000);

            const blended = await vault.blendedAPY();
            // All same APY → blended = 1000 regardless of weights
            // (1000*2500 + 1000*3500 + 1000*2000 + 1000*2000) / 10000 = 1000
            expect(blended).to.equal(1000n);
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 6. Pause
    // ─────────────────────────────────────────────────────────────

    describe("pause / unpause", () => {

        it("blocks deposits when paused", async () => {
            const { vault, wbnb, alice, owner } = await loadFixture(deployVaultFixture);
            await vault.connect(owner).pause();

            await wbnb.mint(alice.address, ethers.parseEther("1"));
            await wbnb.connect(alice).approve(await vault.getAddress(), ethers.parseEther("1"));

            await expect(
                vault.connect(alice).deposit(ethers.parseEther("1"), alice.address)
            ).to.be.reverted; // EnforcedPause
        });

        it("allows deposits again after unpause", async () => {
            const { vault, wbnb, alice, owner } = await loadFixture(deployVaultFixture);
            await vault.connect(owner).pause();
            await vault.connect(owner).unpause();

            await wbnb.mint(alice.address, ethers.parseEther("1"));
            await wbnb.connect(alice).approve(await vault.getAddress(), ethers.parseEther("1"));
            await expect(
                vault.connect(alice).deposit(ethers.parseEther("1"), alice.address)
            ).to.not.be.reverted;
        });
    });
});
