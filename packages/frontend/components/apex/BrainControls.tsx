'use client';

import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useState } from 'react';
import { useBrainStats } from '@/lib/useBrain';
import { useVaultStats } from '@/lib/useVault';
import { APEX_CONTRACTS, APEX_BRAIN_ABI } from '@/lib/useVault';
import { useToast } from './Toast';

const WEIGHT_LABELS = [
  { key: 'lpYield', label: 'M1 LP Yield',   color: '#6366f1', bg: 'bg-indigo-500' },
  { key: 'staking', label: 'M2 Staking',     color: '#10b981', bg: 'bg-emerald-500' },
  { key: 'lending', label: 'M3 Lending',     color: '#f59e0b', bg: 'bg-amber-500' },
  { key: 'hedge',   label: 'M4 Hedge',       color: '#ef4444', bg: 'bg-red-500' },
] as const;

export default function BrainControls() {
  const { weights, lastRebalance, nextRebalanceIn, isLoading } = useBrainStats();
  const vault = useVaultStats();
  const { addToast, updateToast } = useToast();
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();

  const { writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: pendingHash,
    query: { enabled: !!pendingHash },
  });

  const isWorking = isPending || isConfirming;
  const canRebalance = nextRebalanceIn === 'Ready';

  const handleRebalance = () => {
    const toastId = addToast({ type: 'pending', title: 'Rebalancing Brain…', message: 'Computing new weight vector and allocating capital' });
    writeContract({
      address: APEX_CONTRACTS.BRAIN,
      abi: APEX_BRAIN_ABI,
      functionName: 'rebalance',
    }, {
      onSuccess: (hash) => {
        setPendingHash(hash);
        updateToast(toastId, { type: 'success', title: 'Rebalanced!', message: 'Strategy weights updated', txHash: hash });
      },
      onError: (err) => {
        const msg = err.message.includes('TooSoon') ? 'Rebalance cooldown not elapsed yet' : err.message.slice(0, 100);
        updateToast(toastId, { type: 'error', title: 'Rebalance failed', message: msg });
      },
    });
  };

  // Regime detection
  const regime = (() => {
    const { lpYield, staking } = weights;
    if (staking > 4500) return { label: 'High Volatility',  dot: 'bg-amber-500',  ring: 'ring-amber-200',  text: 'text-amber-700',  bg: 'bg-amber-50' };
    if (lpYield > 3500) return { label: 'APY Chase',        dot: 'bg-purple-500', ring: 'ring-purple-200', text: 'text-purple-700', bg: 'bg-purple-50' };
    if (lpYield < 2200) return { label: 'Idle Capital',     dot: 'bg-blue-500',   ring: 'ring-blue-200',   text: 'text-blue-700',   bg: 'bg-blue-50' };
    return               { label: 'Balanced',               dot: 'bg-emerald-500',ring: 'ring-emerald-200',text: 'text-emerald-700',bg: 'bg-emerald-50' };
  })();

  return (
    <div className="glass-panel rounded-2xl p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900">APEX Brain</h3>
          <p className="text-xs text-gray-400 mt-0.5">Autonomous weight allocation engine</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${regime.bg} ${regime.text} ring-1 ${regime.ring}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${regime.dot} ${canRebalance ? 'animate-pulse' : ''}`}/>
          {regime.label}
        </span>
      </div>

      {/* Weight bars */}
      <div className="space-y-3">
        {WEIGHT_LABELS.map(w => {
          const pct = weights[w.key] / 100;
          return (
            <div key={w.key}>
              <div className="flex items-center justify-between mb-1 text-xs">
                <span className="font-semibold text-gray-700">{w.label}</span>
                <span className="font-bold tabular-nums" style={{ color: w.color }}>{pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: w.color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Last rebalance */}
      <div className="text-xs text-gray-400 flex items-center justify-between">
        <span>Last: {lastRebalance ? lastRebalance.toLocaleTimeString() : '—'}</span>
        <span>Next: <span className={`font-semibold ${canRebalance ? 'text-emerald-600' : 'text-gray-600'}`}>{nextRebalanceIn}</span></span>
      </div>

      {/* Rebalance button */}
      <button
        onClick={handleRebalance}
        disabled={isWorking || isLoading}
        className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all
          ${canRebalance
            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          } disabled:opacity-60`}
      >
        {isWorking ? (
          <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          {isPending ? 'Confirm in wallet…' : 'Rebalancing…'}</>
        ) : canRebalance ? '⚡ Trigger Rebalance' : `Cooldown: ${nextRebalanceIn}`}
      </button>
    </div>
  );
}
