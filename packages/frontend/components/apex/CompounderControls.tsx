'use client';

import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useBrainStats } from '@/lib/useBrain';
import { APEX_CONTRACTS, APEX_COMPOUNDER_ABI } from '@/lib/useVault';
import { useToast } from './Toast';

export default function CompounderControls() {
  const { lastCompound, totalHarvested, isLoading } = useBrainStats();
  const { addToast, updateToast } = useToast();
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const [lastTotal, setLastTotal] = useState<string | null>(null);

  const { writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: pendingHash,
    query: { enabled: !!pendingHash },
  });

  const isWorking = isPending || isConfirming;

  // Time since last compound
  const timeSinceCompound = lastCompound
    ? (() => {
        const diff = Math.floor((Date.now() - lastCompound.getTime()) / 1000);
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        return `${Math.floor(diff / 3600)}h ago`;
      })()
    : 'Never';

  const handleCompound = () => {
    setLastTotal(totalHarvested);
    const toastId = addToast({ type: 'pending', title: 'Compound in progress…', message: 'Harvesting yield from all 4 strategies and reinvesting' });
    writeContract({
      address: APEX_CONTRACTS.COMPOUNDER,
      abi: APEX_COMPOUNDER_ABI,
      functionName: 'compound',
    }, {
      onSuccess: (hash) => {
        setPendingHash(hash);
        updateToast(toastId, { type: 'success', title: 'Compound successful!', message: 'Yield harvested and reinvested across strategies', txHash: hash });
      },
      onError: (err) => {
        const msg = err.message.includes('BelowThreshold') ? 'Harvest below minimum threshold — try again later'
          : err.message.slice(0, 100);
        updateToast(toastId, { type: 'error', title: 'Compound skipped', message: msg });
      },
    });
  };

  return (
    <div className="glass-panel rounded-2xl p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900">Compounder</h3>
          <p className="text-xs text-gray-400 mt-0.5">Permissionless harvest &amp; reinvest</p>
        </div>
        <div className="p-2.5 rounded-xl bg-emerald-50">
          <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="text-xs text-gray-400 mb-1">All-Time Harvested</div>
          <div className="text-lg font-bold text-gray-900 tabular-nums">
            {isLoading ? '…' : `${totalHarvested} WBNB`}
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="text-xs text-gray-400 mb-1">Last Compound</div>
          <div className="text-lg font-bold text-gray-900">
            {isLoading ? '…' : timeSinceCompound}
          </div>
        </div>
      </div>

      {/* Harvest threshold info */}
      <div className="text-xs text-gray-500 flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2.5">
        <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Compound is permissionless — anyone can call it. If harvest &lt; 0.001 WBNB, it will be skipped.</span>
      </div>

      {/* Compound button */}
      <button
        onClick={handleCompound}
        disabled={isWorking}
        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
      >
        {isWorking ? (
          <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          {isPending ? 'Confirm in wallet…' : 'Harvesting…'}</>
        ) : '🌱 Compound Now'}
      </button>
    </div>
  );
}
