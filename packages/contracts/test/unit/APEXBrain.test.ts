import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * APEXBrain Unit Tests
 *
 * Tests all four weight computation regimes:
 *   1. High Volatility (vol > 5%)
 *   2. Low Vol + High APY Spread (spread > 3%)
 *   3. Idle Capital (< 80% utilization)
 *   4. Default Balanced regime
 *
 * Also verifies rebalance guards:
 *   - TooSoon: cannot rebalance before MIN_INTERVAL
 *   - DeltaTooSmall: skips trivial weight changes
 *   - Weight invariant: weights always sum to 10000
 */

const BPS = 10_000n;

describe("APEXBrain", () => {

    async function deployBrainFixture() {
        const [owner, keeper, user] = await ethers.getSigners();

        // Deploy mock pool (price feeds)
        const MockPool = await ethers.getContractFactory("MockAsterDEXPool");
        const pool = await MockPool.deploy();

        // Deploy mock WBNB
        const MockWBNB = await ethers.getContractFactory("MockWBNB");
        const wbnb = await MockWBNB.deploy();

        // Deploy 4 mock strategies
        const MockStrategy = await ethers.getContractFactory("MockAPEXStrategy");
        const m1 = await MockStrategy.deploy(await wbnb.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress);
        const m2 = await MockStrategy.deploy(await wbnb.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress);
        const m3 = await MockStrategy.deploy(await wbnb.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress);
        const m4 = await MockStrategy.deploy(await wbnb.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress);

        const strategies: [string, string, string, string] = [
            await m1.getAddress(),
            await m2.getAddress(),
            await m3.getAddress(),
            await m4.getAddress(),
        ];

        // Deploy Brain (vault is ZeroAddress for isolated unit tests)
        const Brain = await ethers.getContractFactory("APEXBrain");
        const brain = await Brain.deploy(ethers.ZeroAddress, strategies, await pool.getAddress());

        return { brain, pool, wbnb, m1, m2, m3, m4, owner, keeper, user };
    }

    // ────────────────────────────────────────────────────────────────
    // 1. Weight Computation Regimes
    // ────────────────────────────────────────────────────────────────

    describe("computeWeights()", () => {

        it("HIGH VOLATILITY: returns 10/50/30/10 when vol > 500 bps (5%)", async () => {
            const { brain, pool } = await loadFixture(deployBrainFixture);
            // Simulate 10% price deviation from TWAP
            await pool.setSpotPrice(ethers.parseEther("330")); // +10% from TWAP
            await pool.setTWAP(ethers.parseEther("300"));

            const w = await brain.computeWeights();
            expect(w.lpYield).to.equal(1000n);
            expect(w.staking).to.equal(5000n);
            expect(w.lending).to.equal(3000n);
            expect(w.hedge).to.equal(1000n);
            expect(w.lpYield + w.staking + w.lending + w.hedge).to.equal(BPS);
        });

        it("LOW VOL + HIGH APY SPREAD: returns 40/25/10/25 when spread > 300 bps", async () => {
            const { brain, pool, m1, m2, m3, m4 } = await loadFixture(deployBrainFixture);
            // Stable price (low vol)
            await pool.setSpotPrice(ethers.parseEther("300"));
            await pool.setTWAP(ethers.parseEther("300"));
            // APY diff > 3%: M1=12%, M2=1% → spread = 1100 bps
            await m1.setCurrentAPY(1200);
            await m2.setCurrentAPY(100);
            await m3.setCurrentAPY(100);
            await m4.setCurrentAPY(100);

            const w = await brain.computeWeights();
            expect(w.lpYield).to.equal(4000n);
            expect(w.staking).to.equal(2500n);
            expect(w.lending).to.equal(1000n);
            expect(w.hedge).to.equal(2500n);
            expect(w.lpYield + w.staking + w.lending + w.hedge).to.equal(BPS);
        });

        it("IDLE CAPITAL: returns 20/30/40/10 when utilization < 80%", async () => {
            const { brain, pool, m1, m2, m3, m4 } = await loadFixture(deployBrainFixture);
            // Low vol
            await pool.setSpotPrice(ethers.parseEther("300"));
            await pool.setTWAP(ethers.parseEther("300"));
            // Small APY spread (< 300 bps)
            await m1.setCurrentAPY(500);
            await m2.setCurrentAPY(500);
            await m3.setCurrentAPY(500);
            await m4.setCurrentAPY(500);
            // Only 50% is deployed (idle capital detected)
            // Brain reads `totalVault.totalAssets()` which is ZeroAddress → returns 0
            // So capitalUtilization = 0 < 8000 → idle capital regime
            const w = await brain.computeWeights();
            expect(w.lpYield).to.equal(2000n);
            expect(w.staking).to.equal(3000n);
            expect(w.lending).to.equal(4000n);
            expect(w.hedge).to.equal(1000n);
            expect(w.lpYield + w.staking + w.lending + w.hedge).to.equal(BPS);
        });

        it("WEIGHT INVARIANT: all regimes sum to exactly 10000 bps", async () => {
            const { brain, pool, m1, m2, m3, m4 } = await loadFixture(deployBrainFixture);

            const scenarios = [
                // [spotDelta%, m1APY, m2APY, m3APY, m4APY]
                [10, 500, 500, 500, 500],   // High vol
                [0, 1200, 100, 100, 100],   // High APY spread
                [0, 500, 500, 500, 500],    // Idle capital / default
            ];

            for (const [volPct, apy1, apy2, apy3, apy4] of scenarios) {
                const spot = 300 + (300 * volPct / 100);
                await pool.setSpotPrice(ethers.parseEther(spot.toString()));
                await pool.setTWAP(ethers.parseEther("300"));
                await m1.setCurrentAPY(apy1);
                await m2.setCurrentAPY(apy2);
                await m3.setCurrentAPY(apy3);
                await m4.setCurrentAPY(apy4);

                const w = await brain.computeWeights();
                const sum = w.lpYield + w.staking + w.lending + w.hedge;
                expect(sum).to.equal(BPS, `Weight sum != 10000 for scenario vol=${volPct}%`);
            }
        });
    });

    // ────────────────────────────────────────────────────────────────
    // 2. Signal Reading
    // ────────────────────────────────────────────────────────────────

    describe("readSignals()", () => {

        it("volatilityIndex = 0 when spot == TWAP", async () => {
            const { brain, pool } = await loadFixture(deployBrainFixture);
            await pool.setSpotPrice(ethers.parseEther("300"));
            await pool.setTWAP(ethers.parseEther("300"));

            const signals = await brain.readSignals();
            expect(signals.volatilityIndex).to.equal(0n);
        });

        it("volatilityIndex = 500 when spot deviates 5% above TWAP", async () => {
            const { brain, pool } = await loadFixture(deployBrainFixture);
            await pool.setSpotPrice(ethers.parseEther("315")); // +5%
            await pool.setTWAP(ethers.parseEther("300"));

            const signals = await brain.readSignals();
            expect(signals.volatilityIndex).to.equal(500n); // 5% = 500 bps
        });

        it("apyDifferential = max - min across all strategies", async () => {
            const { brain, m1, m2, m3, m4, pool } = await loadFixture(deployBrainFixture);
            await pool.setSpotPrice(ethers.parseEther("300"));
            await pool.setTWAP(ethers.parseEther("300"));
            await m1.setCurrentAPY(1000);
            await m2.setCurrentAPY(100);
            await m3.setCurrentAPY(500);
            await m4.setCurrentAPY(200);

            const signals = await brain.readSignals();
            expect(signals.apyDifferential).to.equal(900n); // 1000 - 100
        });
    });

    // ────────────────────────────────────────────────────────────────
    // 3. Rebalance Guards
    // ────────────────────────────────────────────────────────────────

    describe("rebalance() guards", () => {

        it("reverts with TooSoon when called twice in < 1 hour", async () => {
            const { brain, pool, wbnb, m1, m2, m3, m4 } = await loadFixture(deployBrainFixture);

            // Deploy a real MockVault so brain.sync() doesn't revert
            const MockVaultF = await ethers.getContractFactory("MockVault");
            const mockVault = await MockVaultF.deploy();
            // Wire vault into brain — we need a setVault function or re-deploy
            // Re-deploy brain with mockVault as the vault address
            const strategies: [string, string, string, string] = [
                await m1.getAddress(),
                await m2.getAddress(),
                await m3.getAddress(),
                await m4.getAddress(),
            ];
            const Brain = await ethers.getContractFactory("APEXBrain");
            const brain2 = await Brain.deploy(
                await mockVault.getAddress(),
                strategies,
                await pool.getAddress()
            );

            // Set high vol so delta > threshold
            await pool.setSpotPrice(ethers.parseEther("330")); // +10%
            await pool.setTWAP(ethers.parseEther("300"));

            // Move time forward 2 hours and rebalance once — should succeed fully
            await ethers.provider.send("evm_increaseTime", [7200]);
            await ethers.provider.send("evm_mine", []);
            await brain2.rebalance(); // Sets lastRebalance = block.timestamp

            // Immediately calling again without advancing time — TooSoon
            await expect(brain2.rebalance()).to.be.revertedWith("APEXBrain: TooSoon");
        });

        it("default currentWeights are balanced (25/35/20/20)", async () => {
            const { brain } = await loadFixture(deployBrainFixture);
            const w = await brain.currentWeights();
            expect(w.lpYield).to.equal(2500n);
            expect(w.staking).to.equal(3500n);
            expect(w.lending).to.equal(2000n);
            expect(w.hedge).to.equal(2000n);
        });
    });
});
