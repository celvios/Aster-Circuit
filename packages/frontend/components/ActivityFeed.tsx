'use client';

import { useState, useEffect } from 'react';
import { useWatchContractEvent } from 'wagmi';
import { formatEther } from 'viem';
import { CONTRACTS, STRATEGY_ABI, HEARTBEAT_ABI } from '@/lib/web3-config';

type Log = {
    id: string;
    timestamp: Date;
    type: 'BEAT' | 'TRADE' | 'SYSTEM' | 'INFO';
    message: string;
    hash?: string;
};

export default function ActivityFeed() {
    const [logs, setLogs] = useState<Log[]>([
        {
            id: 'init',
            timestamp: new Date(),
            type: 'SYSTEM',
            message: 'Autonomous Yield Engine Initialized. Listening for on-chain events...'
        }
    ]);

    const addLog = (log: Omit<Log, 'id' | 'timestamp'>) => {
        setLogs(prev => [{
            id: Math.random().toString(36),
            timestamp: new Date(),
            ...log
        }, ...prev].slice(0, 50));
    };

    // Watch Heartbeats
    useWatchContractEvent({
        address: CONTRACTS.HEARTBEAT as `0x${string}`,
        abi: HEARTBEAT_ABI,
        eventName: 'Beat',
        onLogs(logs) {
            logs.forEach(log => {
                const { reward } = (log as any).args ?? {};
                addLog({
                    type: 'BEAT',
                    message: `Heartbeat Pulse Verified. Keeper Rewarded: ${parseFloat(formatEther(reward || 0n)).toFixed(6)} BNB`,
                    hash: log.transactionHash ?? undefined
                });
            });
        },
    });

    // Watch Compounding
    useWatchContractEvent({
        address: CONTRACTS.STRATEGY as `0x${string}`,
        abi: STRATEGY_ABI,
        eventName: 'Compounded',
        onLogs(logs) {
            logs.forEach(log => {
                const { yieldHarvested, lpTokensReceived } = (log as any).args ?? {};
                addLog({
                    type: 'TRADE',
                    message: `AUTO-COMPOUND: Harvested ${parseFloat(formatEther(yieldHarvested || 0n)).toFixed(4)} asBNB yield -> Minted ${parseFloat(formatEther(lpTokensReceived || 0n)).toFixed(4)} LP Tokens`,
                    hash: log.transactionHash ?? undefined
                });
            });
        },
    });

    // Watch Deposits
    useWatchContractEvent({
        address: CONTRACTS.STRATEGY as `0x${string}`,
        abi: STRATEGY_ABI,
        eventName: 'Deposited',
        onLogs(logs) {
            logs.forEach(log => {
                const { bnbAmount, asBNBReceived } = (log as any).args ?? {};
                addLog({
                    type: 'INFO',
                    message: `Capital Injection: ${parseFloat(formatEther(bnbAmount || 0n)).toFixed(2)} BNB Swapped -> ${parseFloat(formatEther(asBNBReceived || 0n)).toFixed(2)} asBNB`,
                    hash: log.transactionHash ?? undefined
                });
            });
        },
    });

    // Watch IL Exits
    useWatchContractEvent({
        address: CONTRACTS.STRATEGY as `0x${string}`,
        abi: STRATEGY_ABI,
        eventName: 'LPExited',
        onLogs(logs) {
            logs.forEach(log => {
                const { reason } = (log as any).args ?? {};
                addLog({
                    type: 'SYSTEM',
                    message: `⚠️ DEFENSIVE EXIT TRIGGERED: ${reason}. Unwound LP position to protect principal.`,
                    hash: log.transactionHash ?? undefined
                });
            });
        },
    });

    return (
        <div className="glass-panel rounded-2xl p-6 h-[400px] flex flex-col">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Autonomous Decision Log
            </h3>

            <div className="flex-1 overflow-y-auto space-y-3 font-mono text-sm pr-2 custom-scrollbar">
                {logs.map((log) => (
                    <div key={log.id} className="flex gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                        <span className="text-gray-500 whitespace-nowrap">
                            [{log.timestamp.toLocaleTimeString()}]
                        </span>
                        <div className="flex-1">
                            <span className={`font-bold mr-2 ${log.type === 'BEAT' ? 'text-pink-500' :
                                    log.type === 'TRADE' ? 'text-emerald-500' :
                                        log.type === 'SYSTEM' ? 'text-amber-500' :
                                            'text-blue-500'
                                }`}>
                                {log.type}:
                            </span>
                            <span className="text-gray-300">
                                {log.message}
                            </span>
                            {log.hash && (
                                <a
                                    href={`https://testnet.bscscan.com/tx/${log.hash}`} // Using testnet link as placeholder
                                    target="_blank"
                                    rel="noreferrer"
                                    className="ml-2 text-xs text-gray-600 hover:text-gray-400 underline"
                                >
                                    view tx
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
