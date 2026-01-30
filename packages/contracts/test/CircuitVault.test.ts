import { expect } from "chai";
import { ethers } from "hardhat";
import { CircuitVault, IAsBNBMinter } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("CircuitVault", function () {
    let vault: CircuitVault;
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    const ASBNB_TOKEN = process.env.ASBNB_TOKEN!;
    const ASBNB_MINTER = process.env.ASBNB_MINTER!;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy CircuitVault
        const CircuitVault = await ethers.getContractFactory("CircuitVault");
        vault = await CircuitVault.deploy(ASBNB_TOKEN, ASBNB_MINTER);
        await vault.waitForDeployment();
    });

    describe("Deployment", function () {
        it("should set correct asBNB token address", async function () {
            expect(await vault.asset()).to.equal(ASBNB_TOKEN);
        });

        it("should set correct asBNB minter address", async function () {
            expect(await vault.asterMinter()).to.equal(ASBNB_MINTER);
        });

        it("should initialize with name and symbol", async function () {
            expect(await vault.name()).to.equal("AsterCircuit Vault");
            expect(await vault.symbol()).to.equal("acBNB");
        });

        it("should start unpaused", async function () {
            expect(await vault.paused()).to.equal(false);
        });
    });

    describe("BNB Deposits", function () {
        it("should accept BNB deposit and mint shares", async function () {
            const depositAmount = ethers.parseEther("1.0");

            const tx = await vault.connect(user1).depositBNB({ value: depositAmount });
            await tx.wait();

            const shares = await vault.balanceOf(user1.address);
            expect(shares).to.be.gt(0);
        });

        it("should revert on zero BNB deposit", async function () {
            await expect(
                vault.connect(user1).depositBNB({ value: 0 })
            ).to.be.reverted;
        });

        it("should correctly calculate shares for multiple deposits", async function () {
            const deposit1 = ethers.parseEther("1.0");
            const deposit2 = ethers.parseEther("2.0");

            await vault.connect(user1).depositBNB({ value: deposit1 });
            const shares1 = await vault.balanceOf(user1.address);

            await vault.connect(user2).depositBNB({ value: deposit2 });
            const shares2 = await vault.balanceOf(user2.address);

            // Second deposit should get roughly 2x shares
            expect(shares2).to.be.closeTo(shares1 * 2n, ethers.parseEther("0.01"));
        });
    });

    describe("Withdrawals", function () {
        beforeEach(async function () {
            // Deposit first
            const depositAmount = ethers.parseEther("1.0");
            await vault.connect(user1).depositBNB({ value: depositAmount });
        });

        it("should allow user to withdraw their shares", async function () {
            const shares = await vault.balanceOf(user1.address);
            const balanceBefore = await ethers.provider.getBalance(user1.address);

            const tx = await vault.connect(user1).redeem(
                shares,
                user1.address,
                user1.address
            );
            const receipt = await tx.wait();
            const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

            const balanceAfter = await ethers.provider.getBalance(user1.address);

            // User should have received BNB back (minus gas)
            expect(balanceAfter).to.be.gt(balanceBefore - gasUsed);
        });

        it("should burn shares on withdrawal", async function () {
            const sharesBefore = await vault.balanceOf(user1.address);

            await vault.connect(user1).redeem(
                sharesBefore,
                user1.address,
                user1.address
            );

            const sharesAfter = await vault.balanceOf(user1.address);
            expect(sharesAfter).to.equal(0);
        });

        it("should revert if withdrawing more than owned", async function () {
            const shares = await vault.balanceOf(user1.address);
            const tooMany = shares + ethers.parseEther("1.0");

            await expect(
                vault.connect(user1).redeem(tooMany, user1.address, user1.address)
            ).to.be.reverted;
        });
    });

    describe("Total Assets", function () {
        it("should track total assets correctly", async function () {
            const deposit1 = ethers.parseEther("1.0");
            const deposit2 = ethers.parseEther("2.0");

            await vault.connect(user1).depositBNB({ value: deposit1 });
            await vault.connect(user2).depositBNB({ value: deposit2 });

            const totalAssets = await vault.totalAssets();
            expect(totalAssets).to.be.gt(0);
        });
    });

    describe("Pause Functionality", function () {
        it("should allow owner to pause", async function () {
            await vault.connect(owner).pause();
            expect(await vault.paused()).to.equal(true);
        });

        it("should prevent deposits when paused", async function () {
            await vault.connect(owner).pause();

            await expect(
                vault.connect(user1).depositBNB({ value: ethers.parseEther("1.0") })
            ).to.be.revertedWithCustomError(vault, "EnforcedPause");
        });

        it("should allow owner to unpause", async function () {
            await vault.connect(owner).pause();
            await vault.connect(owner).unpause();
            expect(await vault.paused()).to.equal(false);
        });

        it("should revert if non-owner tries to pause", async function () {
            await expect(
                vault.connect(user1).pause()
            ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
        });
    });

    describe("Strategy Integration", function () {
        it("should allow owner to set strategy", async function () {
            const mockStrategy = user2.address; // Using address as mock

            await vault.connect(owner).setStrategy(mockStrategy);
            expect(await vault.strategy()).to.equal(mockStrategy);
        });

        it("should revert if non-owner tries to set strategy", async function () {
            await expect(
                vault.connect(user1).setStrategy(user2.address)
            ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
        });
    });
});
