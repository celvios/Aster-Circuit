'use client';

import { useAccount } from 'wagmi';
import { useVaultStats, useUserPosition } from '@/lib/useVault';
import { useBrainStats } from '@/lib/useBrain';

export default function UserPosition() {
  const { address, isConnected } = useAccount();
  const vault  = useVaultStats();
  const pos    = useUserPosition(address);
  const brain  = useBrainStats();

  if (!isConnected) {
    return (
      <div className="glass-panel rounded-2xl p-6 flex items-center gap-4">
        <div className="p-3 bg-gray-50 rounded-xl">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <div>
          <div className="text-sm font-bold text-gray-900">Connect wallet to view your position</div>
          <div className="text-xs text-gray-400 mt-0.5">See your shares, value, and yield earned</div>
        </div>
      </div>
    );
  }

  const hasPosition = pos.shares > 0n;
  const sharesFormatted = (Number(pos.shares) / 1e18).toFixed(4);
  const valueNum = parseFloat(pos.valueWBNB);

  // PnL: value - shares (at 1:1 cost basis; simplified since PPS starts at 1.0)
  const sharesNum = Number(pos.shares) / 1e18;
  const pnlWBNB = valueNum - sharesNum;
  const pnlPct  = sharesNum > 0 ? (pnlWBNB / sharesNum) * 100 : 0;
  const pnlPositive = pnlWBNB >= 0;

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-gray-900">Your Position</h3>
        {hasPosition && (
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${pnlPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {pnlPositive ? '+' : ''}{pnlPct.toFixed(2)}% PnL
          </span>
        )}
      </div>

      {!hasPosition ? (
        <div className="text-center py-4">
          <div className="text-3xl font-bold text-gray-200 mb-1">—</div>
          <div className="text-xs text-gray-400">No position. Deposit to start earning.</div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-gray-400 mb-1">Shares</div>
            <div className="text-lg font-bold text-gray-900 tabular-nums">{sharesFormatted}</div>
            <div className="text-xs text-gray-400">APEX-LP</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Current Value</div>
            <div className="text-lg font-bold text-gray-900 tabular-nums">{pos.valueWBNB}</div>
            <div className="text-xs text-gray-400">WBNB</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Yield Earned</div>
            <div className={`text-lg font-bold tabular-nums ${pnlPositive ? 'text-emerald-600' : 'text-red-500'}`}>
              {pnlPositive ? '+' : ''}{pnlWBNB.toFixed(6)}
            </div>
            <div className="text-xs text-gray-400">WBNB</div>
          </div>
        </div>
      )}

      {/* Protocol info strip */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
        <span>PPS: <span className="font-mono text-gray-600">{vault.pricePerShare}</span></span>
        <span>Next rebalance: <span className="text-gray-600">{brain.nextRebalanceIn}</span></span>
        <span>APY: <span className="font-semibold text-emerald-600">{vault.blendedAPY.toFixed(2)}%</span></span>
      </div>
    </div>
  );
}
