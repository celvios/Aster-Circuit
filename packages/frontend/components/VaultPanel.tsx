'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { CONTRACTS, VAULT_ABI } from '@/lib/web3-config';

export default function VaultPanel() {
    const { address, isConnected } = useAccount();
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawShares, setWithdrawShares] = useState('');

    // Read user's vault shares
    const { data: userShares } = useReadContract({
        address: CONTRACTS.VAULT as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: !!address },
    });

    // Read user's value in BNB
    const { data: userValueBNB } = useReadContract({
        address: CONTRACTS.VAULT as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'userValueInBNB',
        args: address ? [address] : undefined,
        query: { enabled: !!address },
    });

    // Write contracts
    const { data: depositHash, writeContract: deposit, isPending: isDepositing } = useWriteContract();
    const { data: withdrawHash, writeContract: withdraw, isPending: isWithdrawing } = useWriteContract();

    // Wait for transactions
    const { isLoading: isDepositConfirming } = useWaitForTransactionReceipt({ hash: depositHash });
    const { isLoading: isWithdrawConfirming } = useWaitForTransactionReceipt({ hash: withdrawHash });

    const handleDeposit = () => {
        if (!depositAmount || parseFloat(depositAmount) <= 0) return;

        deposit({
            address: CONTRACTS.VAULT as `0x${string}`,
            abi: VAULT_ABI,
            functionName: 'depositBNB',
            value: parseEther(depositAmount),
        });
    };

    const handleWithdraw = () => {
        if (!withdrawShares || parseFloat(withdrawShares) <= 0) return;

        withdraw({
            address: CONTRACTS.VAULT as `0x${string}`,
            abi: VAULT_ABI,
            functionName: 'withdrawBNB',
            args: [parseEther(withdrawShares)],
        });
    };

    if (!isConnected) {
        return (
            <div className="glass-panel p-16 text-center rounded-3xl">
                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Connect Wallet</h2>
                <p className="text-gray-500 max-w-sm mx-auto">Please connect your wallet to view your balance and interact with the vault.</p>
            </div>
        );
    }

    return (
        <div className="grid md:grid-cols-2 gap-8">
            {/* Deposit Panel */}
            <div className="glass-panel rounded-3xl p-8 flex flex-col h-full">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-xl bg-gray-900 text-white flex items-center justify-center shadow-lg">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Deposit</h2>
                        <p className="text-sm text-gray-500 font-medium">Stake BNB & Earn</p>
                    </div>
                </div>

                <div className="space-y-6 flex-1">
                    <div>
                        <label className="block text-sm font-semibold mb-2 text-gray-700 ml-1">
                            Amount to Deposit
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                value={depositAmount}
                                onChange={(e) => setDepositAmount(e.target.value)}
                                placeholder="0.00"
                                className="input-minimal pr-16 font-mono"
                                step="0.01"
                                min="0"
                            />
                            <div className="absolute right-4 top-1/2 -trangray-y-1/2 text-sm font-bold text-gray-400 pointer-events-none">
                                BNB
                            </div>
                        </div>
                        <div className="mt-3 flex justify-between text-xs font-medium text-gray-500 px-1">
                            <span>Exchange Rate</span>
                            <span className="font-mono">1 BNB ≈ 1 asBNB</span>
                        </div>
                    </div>

                    <div className="pt-4 mt-auto">
                        <button
                            onClick={handleDeposit}
                            disabled={isDepositing || isDepositConfirming || !depositAmount}
                            className="btn-primary w-full py-4 text-base tracking-wide"
                        >
                            {isDepositing || isDepositConfirming ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Processing...
                                </span>
                            ) : (
                                'Deposit BNB'
                            )}
                        </button>

                        {depositHash && (
                            <div className="mt-4 text-center">
                                <a
                                    href={`https://bscscan.com/tx/${depositHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-wider"
                                >
                                    View Transaction →
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Withdraw Panel */}
            <div className="glass-panel rounded-3xl p-8 flex flex-col h-full">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 text-gray-900 flex items-center justify-center shadow-sm">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4m0 0l6-6m-6 6l6 6" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Withdraw</h2>
                        <p className="text-sm text-gray-500 font-medium">Redeem Shares</p>
                    </div>
                </div>

                <div className="space-y-6 flex-1">
                    <div>
                        <label className="block text-sm font-semibold mb-2 text-gray-700 ml-1">
                            Shares to Redeem
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                value={withdrawShares}
                                onChange={(e) => setWithdrawShares(e.target.value)}
                                placeholder="0.00"
                                className="input-minimal pr-16 font-mono"
                                step="0.01"
                                min="0"
                            />
                            <div className="absolute right-4 top-1/2 -trangray-y-1/2 text-sm font-bold text-gray-400 pointer-events-none">
                                SHARES
                            </div>
                        </div>

                        {userShares !== undefined && (
                            <div className="mt-3 flex justify-between text-xs px-1">
                                <span className="text-gray-500 font-medium">Available</span>
                                <button
                                    onClick={() => setWithdrawShares(formatEther(userShares as bigint))}
                                    className="text-blue-600 hover:text-blue-700 font-bold tracking-tight hover:underline"
                                >
                                    MAX: {parseFloat(formatEther(userShares as bigint)).toFixed(4)}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="pt-4 mt-auto">
                        <button
                            onClick={handleWithdraw}
                            disabled={isWithdrawing || isWithdrawConfirming || !withdrawShares}
                            className="bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 w-full py-4 text-base tracking-wide font-semibold rounded-xl transition-all shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isWithdrawing || isWithdrawConfirming ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5 text-gray-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Processing...
                                </span>
                            ) : (
                                'Withdraw BNB'
                            )}
                        </button>

                        {withdrawHash && (
                            <div className="mt-4 text-center">
                                <a
                                    href={`https://bscscan.com/tx/${withdrawHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-wider"
                                >
                                    View Transaction →
                                </a>
                            </div>
                        )}
                    </div>
                </div>

                {userValueBNB !== undefined && (
                    <div className="mt-8 pt-6 border-t border-gray-100">
                        <div className="flex justify-between items-center group cursor-default">
                            <span className="text-gray-400 font-medium text-sm group-hover:text-gray-600 transition-colors">Your Position</span>
                            <div className="text-right">
                                <div className="text-xl font-bold text-gray-900 tracking-tight font-mono">
                                    {parseFloat(formatEther(userValueBNB as bigint)).toFixed(4)} BNB
                                </div>
                                <div className="text-xs text-gray-400 font-medium mt-0.5">
                                    ≈ ${(parseFloat(formatEther(userValueBNB as bigint)) * 600).toFixed(2)} USD
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
