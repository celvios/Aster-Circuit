'use client';

import { useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { CONTRACTS, STRATEGY_ABI, VAULT_ABI } from '@/lib/web3-config';

export default function SystemMonitor() {
    // Vault metrics
    const { data: totalAssets } = useReadContract({
        address: CONTRACTS.VAULT as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'totalAssets',
    });

    const { data: totalValueBNB } = useReadContract({
        address: CONTRACTS.VAULT as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'totalValueInBNB',
    });

    // Strategy metrics
    const { data: totalAsBNB } = useReadContract({
        address: CONTRACTS.STRATEGY as `0x${string}`,
        abi: STRATEGY_ABI,
        functionName: 'totalAsBNBHeld',
    });

    const { data: baseDeposits } = useReadContract({
        address: CONTRACTS.STRATEGY as `0x${string}`,
        abi: STRATEGY_ABI,
        functionName: 'baseAsBNBDeposits',
    });

    const { data: totalYield } = useReadContract({
        address: CONTRACTS.STRATEGY as `0x${string}`,
        abi: STRATEGY_ABI,
        functionName: 'totalAsBNBYield',
    });

    const { data: pendingRewards } = useReadContract({
        address: CONTRACTS.STRATEGY as `0x${string}`,
        abi: STRATEGY_ABI,
        functionName: 'getPendingRewards',
    });

    const { data: hasActiveLP } = useReadContract({
        address: CONTRACTS.STRATEGY as `0x${string}`,
        abi: STRATEGY_ABI,
        functionName: 'hasActiveLP',
    });

    const { data: currentIL } = useReadContract({
        address: CONTRACTS.STRATEGY as `0x${string}`,
        abi: STRATEGY_ABI,
        functionName: 'calculateImpermanentLoss',
    });

    const metrics = [
        {
            label: 'Total Value Locked',
            value: totalValueBNB !== undefined ? `${parseFloat(formatEther(totalValueBNB as bigint)).toFixed(2)} BNB` : '---',
            subtitle: totalValueBNB !== undefined ? `$${(parseFloat(formatEther(totalValueBNB as bigint)) * 600).toFixed(0)}` : '',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
        },
        {
            label: 'Total Yield Generated',
            value: totalYield !== undefined ? `${parseFloat(formatEther(totalYield as bigint)).toFixed(4)} asBNB` : '---',
            subtitle: 'Lifetime earnings',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
            ),
        },
        {
            label: 'Pending CAKE Rewards',
            value: pendingRewards !== undefined ? `${parseFloat(formatEther(pendingRewards as bigint)).toFixed(2)} CAKE` : '---',
            subtitle: 'Ready to harvest',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                </svg>
            ),
        },
        {
            label: 'Impermanent Loss',
            value: currentIL !== undefined ? `${Number(currentIL) / 100}%` : '0%',
            subtitle: hasActiveLP ? 'Active LP position' : 'No LP active',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-gray-900">System Metrics</h2>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <p className="text-sm text-gray-500 font-medium">Live Protocol Data</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {metrics.map((metric, i) => (
                    <div
                        key={i}
                        className="glass-panel p-6 rounded-2xl flex flex-col justify-between h-[160px]"
                    >
                        <div className="flex justify-between items-start">
                            <div className="p-2.5 rounded-xl bg-gray-50 text-gray-700 border border-gray-100">
                                {metric.icon}
                            </div>
                        </div>

                        <div>
                            <div className="text-2xl font-bold text-gray-900 stat-value tracking-tight">
                                {metric.value}
                            </div>
                            <div className="text-sm font-medium text-gray-500 mt-1">
                                {metric.label}
                            </div>
                            {metric.subtitle && (
                                <div className="text-xs text-gray-400 mt-1 font-medium">
                                    {metric.subtitle}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Strategy Detail Card */}
            <div className="glass-panel rounded-2xl p-8">
                <h3 className="text-base font-semibold text-gray-900 mb-6 flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    Strategy Breakdown
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                    <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total asBNB</div>
                        <div className="font-mono text-xl text-gray-700">
                            {totalAsBNB !== undefined ? parseFloat(formatEther(totalAsBNB as bigint)).toFixed(4) : '---'}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Base Deposits</div>
                        <div className="font-mono text-xl text-gray-700">
                            {baseDeposits !== undefined ? parseFloat(formatEther(baseDeposits as bigint)).toFixed(4) : '---'}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">LP Status</div>
                        <div className="flex items-center gap-2">
                            <span className={`inline-block w-2 h-2 rounded-full ${hasActiveLP ? 'bg-emerald-500' : 'bg-gray-300'}`}></span>
                            <span className="text-lg text-gray-700 font-medium">{hasActiveLP ? 'Active' : 'Idle'}</span>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">IL Threshold</div>
                        <div className="font-mono text-xl text-gray-700">5.00%</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
