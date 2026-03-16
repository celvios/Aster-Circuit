const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
    const rpcUrl = process.env.BSC_RPC_URL;
    console.log(`Connecting to RPC: ${rpcUrl}`);

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Check Chain ID
    const network = await provider.getNetwork();
    const block = await provider.getBlock("latest");
    console.log(`Connected to Chain ID: ${network.chainId}`);
    console.log(`Current Block Number: ${block.number}`);

    // Addresses
    const factoryAddr = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
    const wbnb = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
    const cake = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";

    // Standard Code Check
    const code = await provider.getCode(factoryAddr);
    console.log(`Factory Code Length: ${code.length}`);
    if (code === "0x") throw new Error("No code at Factory!");

    // Call getPair
    const abi = ["function getPair(address, address) view returns (address)"];
    const factory = new ethers.Contract(factoryAddr, abi, provider);

    console.log(`Calling getPair(${wbnb}, ${cake})...`);
    let lpAddress;
    try {
        lpAddress = await factory.getPair(wbnb, cake);
        console.log(`SUCCESS: Pair Address: ${lpAddress}`);
    } catch (e) {
        console.error("FAILURE: getPair threw error:");
        console.error(e);
        return;
    }

    // Verify Router Quote
    const routerAddr = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
    const routerAbi = ["function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)"];
    const router = new ethers.Contract(routerAddr, routerAbi, provider);

    const amountIn = ethers.parseEther("10"); // 10 BNB
    console.log(`Checking getAmountsOut for 10 BNB -> CAKE...`);
    try {
        const amounts = await router.getAmountsOut(amountIn, [wbnb, cake]);
        console.log(`Quote: ${ethers.formatEther(amounts[0])} BNB -> ${ethers.formatEther(amounts[1])} CAKE`);
    } catch (e) {
        console.error("Quote Failed:", e);
    }

    // Scan MasterChef for PID (Optional verification)
    const masterChefAddr = "0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652";
    const mcAbi = [
        "function poolLength() view returns (uint256)",
        "function lpToken(uint256) view returns (address)"
    ];
    const masterChef = new ethers.Contract(masterChefAddr, mcAbi, provider);

    console.log("Scanning MasterChef for PID...");
    // We expect PID 2
    try {
        const tokenAt2 = await masterChef.lpToken(2);
        console.log(`PID 2 Token: ${tokenAt2}`);
        if (tokenAt2.toLowerCase() === lpAddress.toLowerCase()) {
            console.log("Confirmed: PID 2 is WBNB-CAKE LP");
        } else {
            console.log("WARNING: PID 2 mismatch!");
        }
    } catch (e) { console.error("Could not check PID 2", e); }
}

main().catch(console.error);
