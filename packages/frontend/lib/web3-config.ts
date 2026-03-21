'use client';

import { bsc, bscTestnet, hardhat } from 'wagmi/chains';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { cookieStorage, createStorage } from 'wagmi';
import { http } from 'viem';

// Determine chain based on environment — no hardcoding
export const APEX_CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '31337');
export const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'YOUR_PROJECT_ID';

// All supported networks
export const networks = [bsc, bscTestnet, hardhat];

// Resolve the active chain from env — used as defaultNetwork in AppKit
export const targetChain = networks.find(n => n.id === APEX_CHAIN_ID) ?? bscTestnet;

// 1. Create WagmiAdapter with reliable RPC transports
export const wagmiAdapter = new WagmiAdapter({
    storage: createStorage({
        storage: cookieStorage
    }) as any,
    ssr: true,
    projectId,
    networks,
    transports: {
        [bsc.id]:        http('https://bsc-dataseed1.defibit.io'),
        [bscTestnet.id]: http('https://bsc-testnet.publicnode.com'),
        [hardhat.id]:    http('http://127.0.0.1:8545'),
    },
});

export const config = wagmiAdapter.wagmiConfig;

// Contract addresses (Loaded from Env)
export const CONTRACTS = {
    VAULT: process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}`,
    STRATEGY: process.env.NEXT_PUBLIC_STRATEGY_ADDRESS as `0x${string}`,
    HEARTBEAT: process.env.NEXT_PUBLIC_HEARTBEAT_ADDRESS as `0x${string}`,
    ASBNB: (process.env.NEXT_PUBLIC_ASBNB_ADDRESS || '0x77734e70b6E88b4d82fE632a168EDf6e700912b6') as `0x${string}`,
    WBNB: (process.env.NEXT_PUBLIC_WBNB_ADDRESS || '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c') as `0x${string}`,
} as const;

// Contract ABIs (simplified for frontend)
export const VAULT_ABI = [
    'function depositBNB() external payable returns (uint256)',
    'function withdrawBNB(uint256 shares) external returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
    'function totalAssets() external view returns (uint256)',
    'function totalSupply() external view returns (uint256)',
    'function totalValueInBNB() external view returns (uint256)',
    'function userValueInBNB(address user) external view returns (uint256)',
    'function previewDeposit(uint256 assets) external view returns (uint256)',
    'function previewRedeem(uint256 shares) external view returns (uint256)',
] as const;

export const STRATEGY_ABI = [
    'function totalAsBNBHeld() external view returns (uint256)',
    'function baseAsBNBDeposits() external view returns (uint256)',
    'function totalAsBNBYield() external view returns (uint256)',
    'function getPendingRewards() external view returns (uint256)',
    'function hasActiveLP() external view returns (bool)',
    'function calculateImpermanentLoss() external view returns (uint256)',
    // Events
    'event Compounded(uint256 yieldHarvested, uint256 lpTokensReceived)',
    'event LPExited(uint256 lpTokens, uint256 bnbRecovered, uint256 usdtRecovered, string reason)',
    'event Deposited(uint256 bnbAmount, uint256 asBNBReceived)',
    'event Withdrawn(uint256 bnbAmount, uint256 asBNBSold)'
] as const;

export const HEARTBEAT_ABI = [
    'function beat() external returns (uint256)',
    'function canBeatNow() external view returns (bool, uint256)',
    'function previewBeatReward() external view returns (uint256)',
    'function getStats() external view returns (uint256, uint256, uint256, uint256)',
    // Events
    'event Beat(address indexed caller, uint256 indexed beatNumber, uint256 reward, uint256 timestamp)'
] as const;
