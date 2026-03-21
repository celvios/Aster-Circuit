'use client';

import { useVaultStats } from '@/lib/useVault';
import { useBrainStats } from '@/lib/useBrain';

export default function VaultStats() {
  const vault = useVaultStats();
  const brain = useBrainStats();

  const regime = (() => {
    const { lpYield, staking } = brain.weights;
    if (staking > 4500) return { label: 'High Volatility', color: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-500' };
    if (lpYield > 3500) return { label: 'APY Chase',       color: 'text-purple-600', bg: 'bg-purple-50', dot: 'bg-purple-500' };
    if (lpYield < 2200) return { label: 'Idle Capital',    color: 'text-blue-600',   bg: 'bg-blue-50',  dot: 'bg-blue-500' };
    return                       { label: 'Balanced',       color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-500' };
  })();

  const stats = [
    {
      label: 'Total Value Locked',
      value: vault.isLoading ? '—' : `${vault.totalAssets} WBNB`,
      sub: 'Across 4 strategies',
      icon: (
        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
        </svg>
      ),
      bg: 'bg-blue-50',
    },
    {
      label: 'Blended APY',
      value: vault.isLoading ? '—' : `${vault.blendedAPY.toFixed(2)}%`,
      sub: 'Weight-averaged across M1–M4',
      icon: (
        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
        </svg>
      ),
      bg: 'bg-emerald-50',
    },
    {
      label: 'Price Per Share',
      value: vault.isLoading ? '—' : vault.pricePerShare,
      sub: 'WBNB per APEX-LP token',
      icon: (
        <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
        </svg>
      ),
      bg: 'bg-purple-50',
    },
    {
      label: 'Total Harvested',
      value: brain.isLoading ? '—' : `${brain.totalHarvested} WBNB`,
      sub: 'All-time compounder yield',
      icon: (
        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      ),
      bg: 'bg-amber-50',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Regime pill */}
      <div className="flex items-center gap-2">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${regime.bg} text-sm font-semibold ${regime.color}`}>
          <span className={`w-2 h-2 rounded-full ${regime.dot} animate-pulse`}/>
          Brain Regime: {regime.label}
        </div>
        {!brain.isLoading && (
          <span className="text-xs text-gray-400">
            Next rebalance in {brain.nextRebalanceIn}
          </span>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="glass-panel rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 rounded-xl ${s.bg}`}>{s.icon}</div>
              {vault.paused && s.label === 'Total Value Locked' && (
                <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">PAUSED</span>
              )}
            </div>
            <div className="text-2xl font-bold text-gray-900 tabular-nums truncate">
              {s.value}
            </div>
            <div className="text-xs text-gray-400 mt-1 truncate">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
