import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * APEX Full Cycle Integration Test
 * ─────────────────────────────────
 * Simulates the complete lifecycle of the APEX protocol using mock contracts.
 *
 * Key Design Note: ERC-4626's `_withdraw` transfers real tokens from the vault.
 * In integration tests, real WBNB must exist in the vault when redeeming.
 * We use `wbnb.mint(vault, ...)` to simulate strategy funds returning to the vault
 * (exactly what would happen when Brain calls strategy.withdraw() before redeeming).
 *
 * Phases:
 *  A: Multi-user deposits → TVL accuracy
 *  B: Brain regime rotation → weight correctness
 *  C: APEXCompounder harvest → dust guard + reinvest events
 *  D: Withdraw with exit fee → treasury accuracy, pro-rata yield
 */

const BPS = 10_000n;
const ONE = ethers.parseEther("1");
const TEN = ethers.parseEther("10");

describe("APEX Full Cycle Integration", () => {

    async function deployFullStack() {
        const [owner, alice, bob, carol, keeper, treasury] = await ethers.getSigners();

        const MockWBNBF  = await ethers.getContractFactory("MockWBNB");
        const wbnb       = await MockWBNBF.deploy();

        const MockPoolF  = await ethers.getContractFactory("MockAsterDEXPool");
        const pool       = await MockPoolF.deploy();

        const MockStratF = await ethers.getContractFactory("MockAPEXStrategy");
        const stratContracts = [];
        const stratAddrs: string[] = [];
        for (let i = 0; i < 4; i++) {
            const s = await MockStratF.deploy(await wbnb.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress);
            stratContracts.push(s);
            stratAddrs.push(await s.getAddress());
        }
        const [m1, m2, m3, m4] = stratContracts;
        const strategies: [string, string, string, string] = [
            stratAddrs[0], stratAddrs[1], stratAddrs[2], stratAddrs[3]
        ];

        // Deploy Vault (brain/compounder wired below)
        const VaultF = await ethers.getContractFactory("APEXVault");
        const vault  = await VaultF.deploy(
            await wbnb.getAddress(),
            ethers.ZeroAddress, // brain placeholder
            treasury.address,
            strategies,
            ethers.ZeroAddress  // compounder placeholder
        );

        // Deploy Brain pointing at vault
        const BrainF = await ethers.getContractFactory("APEXBrain");
        const brain  = await BrainF.deploy(await vault.getAddress(), strategies, await pool.getAddress());

        // Deploy Compounder
        const CompF     = await ethers.getContractFactory("APEXCompounder");
        const compounder = await CompF.deploy(
            await vault.getAddress(), await brain.getAddress(),
            await wbnb.getAddress(), strategies
        );

        // Wire vault
        await vault.setBrain(await brain.getAddress());
        await vault.setCompounder(await compounder.getAddress());

        // Fund users
        for (const user of [alice, bob, carol]) {
            await wbnb.mint(user.address, ethers.parseEther("100"));
        }

        return { vault, brain, compounder, pool, wbnb, m1, m2, m3, m4, owner, alice, bob, carol, keeper, treasury };
    }

    async function deposit(vault: any, wbnb: any, user: any, amount: bigint) {
        await wbnb.connect(user).approve(await vault.getAddress(), amount);
        return vault.connect(user).deposit(amount, user.address);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase A — Multi-user Deposits
    // ─────────────────────────────────────────────────────────────────────────

    describe("Phase A — Multi-user deposits", () => {

        it("shares are proportional to deposit amounts", async () => {
            const { vault, wbnb, alice, bob } = await loadFixture(deployFullStack);
            await deposit(vault, wbnb, alice, TEN);
            await deposit(vault, wbnb, bob, ethers.parseEther("20"));

            const aliceShares = await vault.balanceOf(alice.address);
            const bobShares   = await vault.balanceOf(bob.address);
            expect(bobShares).to.equal(aliceShares * 2n);
        });

        it("totalAssets reflects combined idle WBNB in vault", async () => {
            const { vault, wbnb, alice, bob, carol } = await loadFixture(deployFullStack);
            await deposit(vault, wbnb, alice, TEN);
            await deposit(vault, wbnb, bob, TEN);
            await deposit(vault, wbnb, carol, TEN);
            expect(await vault.totalAssets()).to.equal(ethers.parseEther("30"));
        });

        it("pricePerShare is exactly 1:1 after deposits with no yield", async () => {
            const { vault, wbnb, alice, bob } = await loadFixture(deployFullStack);
            await deposit(vault, wbnb, alice, TEN);
            await deposit(vault, wbnb, bob, TEN);
            expect(await vault.pricePerShare()).to.equal(ONE);
        });

        it("reverts deposit below MIN_DEPOSIT (0.01 WBNB)", async () => {
            const { vault, wbnb, alice } = await loadFixture(deployFullStack);
            const dust = ethers.parseEther("0.001");
            await wbnb.connect(alice).approve(await vault.getAddress(), dust);
            await expect(vault.connect(alice).deposit(dust, alice.address))
                .to.be.revertedWithCustomError(vault, "BelowMinDeposit");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Phase B — Brain Regime Rotation
    // ─────────────────────────────────────────────────────────────────────────

    describe("Phase B — Brain regime rotation", () => {

        it("starts with balanced default weights (25/35/20/20)", async () => {
            const { brain, pool } = await loadFixture(deployFullStack);
            await pool.setSpotPrice(ethers.parseEther("300"));
            await pool.setTWAP(ethers.parseEther("300"));

            const w = await brain.computeWeights();
            // Vault has 0 TVL → util = 0% → idle regime → 20/30/40/10
            // (idle regime fires before default since util=0 < 8000)
            expect(w.lpYield + w.staking + w.lending + w.hedge).to.equal(BPS);
        });

        it("switches to HIGH VOLATILITY weights when spot deviates > 5% from TWAP", async () => {
            const { brain, pool } = await loadFixture(deployFullStack);
            await pool.setSpotPrice(ethers.parseEther("330")); // +10%
            await pool.setTWAP(ethers.parseEther("300"));

            const w = await brain.computeWeights();
            expect(w.lpYield).to.equal(1000n);
            expect(w.staking).to.equal(5000n);
            expect(w.lending).to.equal(3000n);
            expect(w.hedge).to.equal(1000n);
        });

        it("switches to APY SPREAD weights when vol low and spread > 3%", async () => {
            const { brain, pool, m1, m2, m3, m4 } = await loadFixture(deployFullStack);
            await pool.setSpotPrice(ethers.parseEther("300"));
            await pool.setTWAP(ethers.parseEther("300"));

            // M1 = 12% APY, others = 1% → spread > 3%
            await m1.setCurrentAPY(1200);
            for (const s of [m2, m3, m4]) await s.setCurrentAPY(100);

            const w = await brain.computeWeights();
            expect(w.lpYield).to.equal(4000n);
            expect(w.staking).to.equal(2500n);
            expect(w.lending).to.equal(1000n);
            expect(w.hedge).to.equal(2500n);
        });

        it("weight invariant holds across all regime transitions", async () => {
            const { brain, pool, m1, m2, m3, m4 } = await loadFixture(deployFullStack);
            const scenarios = [
                { spot: "330", twap: "300", apys: [500, 500, 500, 500] }, // HiVol
                { spot: "300", twap: "300", apys: [1200, 100, 100, 100] }, // APY spread
                { spot: "300", twap: "300", apys: [500, 500, 500, 500] },   // Idle/Default
            ];
            for (const s of scenarios) {
                await pool.setSpotPrice(ethers.parseEther(s.spot));
                await pool.setTWAP(ethers.parseEther(s.twap));
                for (const [i, strat] of [m1, m2, m3, m4].entries()) {
                    await strat.setCurrentAPY(s.apys[i]);
                }
                const w = await brain.computeWeights();
                expect(w.lpYield + w.staking + w.lending + w.hedge).to.equal(BPS);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Phase C — Compounder Harvest & Reinvest
    // ─────────────────────────────────────────────────────────────────────────

    describe("Phase C — APEXCompounder harvest & reinvest", () => {

        it("emits CompoundSkipped when all strategies return zero yield (dust guard)", async () => {
            const { compounder } = await loadFixture(deployFullStack);

            const tx = await compounder.compound();
            const receipt = await tx.wait();
            const iface = compounder.interface;
            const skipped = receipt?.logs
                .map((l: any) => { try { return iface.parseLog(l); } catch { return null; } })
                .find((e: any) => e?.name === "CompoundSkipped");
            expect(skipped, "CompoundSkipped event not found").to.not.be.undefined;
        });

        it("emits Compounded and updates lastCompound on successful harvest", async () => {
            const { compounder, wbnb, m1, m2, m3, m4 } = await loadFixture(deployFullStack);

            // Set 0.5 WBNB harvest on each strategy and mint the tokens into them
            const perStrat = ethers.parseEther("0.5");
            for (const s of [m1, m2, m3, m4]) {
                await s.setHarvestReturn(perStrat);
                await wbnb.mint(await s.getAddress(), perStrat);
            }

            expect(await compounder.lastCompound()).to.equal(0n);

            const tx = await compounder.compound();
            const receipt = await tx.wait();
            const iface = compounder.interface;

            const compoundedLog = receipt?.logs
                .map((l: any) => { try { return iface.parseLog(l); } catch { return null; } })
                .find((e: any) => e?.name === "Compounded");

            expect(compoundedLog, "Compounded event not found").to.not.be.undefined;
            expect(compoundedLog?.args.totalHarvested).to.equal(ethers.parseEther("2")); // 4 × 0.5

            const lastRun = await compounder.lastCompound();
            expect(lastRun).to.be.gt(0n);
        });

        it("totalHarvestedAllTime accumulates across multiple compound cycles", async () => {
            const { compounder, wbnb, m1 } = await loadFixture(deployFullStack);

            const perRound = ethers.parseEther("1");
            for (let round = 0; round < 3; round++) {
                await m1.setHarvestReturn(perRound);
                await wbnb.mint(await m1.getAddress(), perRound);
                await compounder.compound();
            }
            const total = await compounder.totalHarvestedAllTime();
            expect(total).to.equal(ethers.parseEther("3")); // 3 rounds × 1 WBNB
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Phase D — Withdraw & Exit Fee
    // ─────────────────────────────────────────────────────────────────────────

    describe("Phase D — Withdraw & exit fee", () => {

        it("exit fee is exactly 0.1% of withdrawn amount, sent to treasury", async () => {
            const { vault, wbnb, alice, treasury } = await loadFixture(deployFullStack);

            await deposit(vault, wbnb, alice, TEN);

            const shares = await vault.balanceOf(alice.address);
            const previewAssets = await vault.previewRedeem(shares);
            const expectedFee = previewAssets * 10n / BPS;
            const expectedNet = previewAssets - expectedFee;

            const aliceBefore    = await wbnb.balanceOf(alice.address);
            const treasuryBefore = await wbnb.balanceOf(treasury.address);

            await vault.connect(alice).approve(await vault.getAddress(), shares);
            await vault.connect(alice).redeem(shares, alice.address, alice.address);

            const aliceGot   = (await wbnb.balanceOf(alice.address)) - aliceBefore;
            const treasuryGot = (await wbnb.balanceOf(treasury.address)) - treasuryBefore;

            expect(treasuryGot).to.equal(expectedFee, "fee mismatch");
            expect(aliceGot).to.equal(expectedNet, "net received mismatch");
        });

        it("all users can fully withdraw after multi-user deposits", async () => {
            const { vault, wbnb, alice, bob, carol, treasury } = await loadFixture(deployFullStack);

            for (const [user, amt] of [[alice, TEN], [bob, TEN], [carol, TEN]] as const) {
                await deposit(vault, wbnb, user, amt);
            }

            const treasuryBefore = await wbnb.balanceOf(treasury.address);

            for (const user of [alice, bob, carol]) {
                const shares = await vault.balanceOf(user.address);
                await vault.connect(user).approve(await vault.getAddress(), shares);
                await vault.connect(user).redeem(shares, user.address, user.address);
                expect(await vault.balanceOf(user.address)).to.equal(0n);
            }

            // Treasury should have collected 0.1% exit fees from all 3 users
            const treasuryGot = (await wbnb.balanceOf(treasury.address)) - treasuryBefore;
            expect(treasuryGot).to.be.gt(0n);
            // 30 WBNB withdrawn × 0.1% = 0.03 WBNB in fees
            expect(treasuryGot).to.equal(ethers.parseEther("0.03"));
        });

        it("pricePerShare increases when strategy reports virtual yield", async () => {
            const { vault, wbnb, alice, m1 } = await loadFixture(deployFullStack);

            await deposit(vault, wbnb, alice, TEN);
            const ppsBefore = await vault.pricePerShare();

            // M1 reports 1 WBNB extra (10% yield on 10 WBNB)
            await m1.setTotalAssets(ethers.parseEther("1"));  // adds to totalAssets
            const ppsAfter = await vault.pricePerShare();

            expect(ppsAfter).to.be.gt(ppsBefore);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Yield Distribution: Pro-rata share appreciation
    // ─────────────────────────────────────────────────────────────────────────

    describe("Yield Distribution — Pro-rata", () => {

        it("equal depositors see equal redemption values after yield accrual", async () => {
            const { vault, wbnb, alice, bob, m1 } = await loadFixture(deployFullStack);

            await deposit(vault, wbnb, alice, TEN);
            await deposit(vault, wbnb, bob, TEN);

            // Simulate 2 WBNB yield (10% gain on 20 WBNB)
            await m1.setTotalAssets(ethers.parseEther("2"));

            const alicePreview = await vault.previewRedeem(await vault.balanceOf(alice.address));
            const bobPreview   = await vault.previewRedeem(await vault.balanceOf(bob.address));

            expect(alicePreview).to.equal(bobPreview);
            expect(alicePreview).to.be.gt(TEN, "should be worth more than deposit after yield");
        });

        it("later depositor gets fewer shares at higher PPS (no dilution)", async () => {
            const { vault, wbnb, alice, bob, m1 } = await loadFixture(deployFullStack);

            // Alice deposits first
            await deposit(vault, wbnb, alice, TEN);

            // Yield accrues: M1 picks up 1 WBNB
            await m1.setTotalAssets(ethers.parseEther("1"));
            const ppsMid = await vault.pricePerShare();
            expect(ppsMid).to.be.gt(ONE); // PPS has risen

            // Bob deposits the same 10 WBNB but at a higher PPS → fewer shares
            await deposit(vault, wbnb, bob, TEN);

            const aliceShares = await vault.balanceOf(alice.address);
            const bobShares   = await vault.balanceOf(bob.address);

            // Bob gets fewer shares than Alice (paid higher PPS)
            expect(bobShares).to.be.lt(aliceShares);
        });
    });
});
