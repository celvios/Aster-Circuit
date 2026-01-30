import { ethers } from "hardhat";

async function main() {
    console.log("Testing AsterDEX asBNB Minter on Fork...\n");

    const [signer] = await ethers.getSigners();
    console.log("Signer:", signer.address);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(signer.address)), "BNB\n");

    const ASBNB_MINTER = process.env.ASBNB_MINTER!;
    const ASBNB_TOKEN = process.env.ASBNB_TOKEN!;

    // Get minter contract
    const minter = await ethers.getContractAt("IAsBNBMinter", ASBNB_MINTER);
    const asBNB = await ethers.getContractAt("IERC20", ASBNB_TOKEN);

    console.log("AsterDEX asBNB Minter:", ASBNB_MINTER);
    console.log("AsterDEX asBNB Token:", ASBNB_TOKEN);

    // Try to mint 0.1 BNB worth of asBNB
    try {
        const depositAmount = ethers.parseEther("0.1");
        console.log("\nAttempting to mint asBNB with", ethers.formatEther(depositAmount), "BNB...");

        const tx = await minter.mint({ value: depositAmount });
        const receipt = await tx.wait();

        console.log("✅ Mint successful!");
        console.log("Gas used:", receipt?.gasUsed.toString());

        const balance = await asBNB.balanceOf(signer.address);
        console.log("asBNB received:", ethers.formatEther(balance));
    } catch (error: any) {
        console.log("❌ Mint failed!");
        console.log("Error:", error.message);
        if (error.data) {
            console.log("Data:", error.data);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
