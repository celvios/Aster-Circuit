'use client';

import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { CONTRACTS, HEARTBEAT_ABI } from '@/lib/web3-config';
import { useState, useEffect } from 'react';

export default function EngineControls() {
    const { isConnected } = useAccount();

    const { data: canBeatData, refetch: refetchCanBeat } = useReadContract({
        address: CONTRACTS.HEARTBEAT as `0x${string}`,
        abi: HEARTBEAT_ABI,
        functionName: 'canBeatNow',
    });

    const [canBeat, rewardAmt] = (canBeatData as [boolean, bigint]) || [false, 0n];

    const { writeContract, data: hash, isPending } = useWriteContract();

    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
        hash,
    });

    useEffect(() => {
        if (isSuccess) {
            refetchCanBeat();
        }
    }, [isSuccess, refetchCanBeat]);

    const handleForceBeat = () => {
        writeContract({
            address: CONTRACTS.HEARTBEAT as `0x${string}`,
            abi: HEARTBEAT_ABI,
            functionName: 'beat',
        });
    };

    if (!isConnected) return null;

    return (
        <div className="glass-panel p-6 rounded-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Engine Diagnostics & Controls
            </h3>

            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-6">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-500">Autonomous Status</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${canBeat ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {canBeat ? 'READY TO PULSE' : 'CHARGING'}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-500">Caller Reward</span>
                    <span className="font-mono text-gray-900 font-bold">
                        {rewardAmt ? parseFloat(formatEther(rewardAmt)).toFixed(6) : '0.000'} BNB
                    </span>
                </div>
            </div>

            <button
                onClick={handleForceBeat}
                disabled={isPending || isConfirming}
                className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${canBeat
                        ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg hover:shadow-rose-500/25'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
            >
                {isPending || isConfirming ? (
                    'Running Sequence...'
                ) : (
                    <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Manual Heartbeat Override
                    </>
                )}
            </button>
            <p className="text-xs text-center text-gray-400 mt-3">
                * Triggers Strategy Compounding & Rebalancing manually.
            </p>
        </div>
    );
}
