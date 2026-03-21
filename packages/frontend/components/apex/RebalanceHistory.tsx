'use client';

import { useWeightHistory, useRecentHarvests } from '@/lib/useSubgraph';

function shortHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const REGIME_LABEL: Record<string, { label: string; color: string }> = {
  '1000-5000-3000-1000': { label: 'High Volatility',  color: 'text-amber-600 bg-amber-50' },
  '4000-2500-1000-2500': { label: 'APY Chase',        color: 'text-purple-600 bg-purple-50' },
  '2000-3000-4000-1000': { label: 'Idle Capital',     color: 'text-blue-600 bg-blue-50' },
  '2500-3500-2000-2000': { label: 'Balanced',         color: 'text-emerald-600 bg-emerald-50' },
};

function regimeTag(lp: number, st: number, le: number, he: number) {
  const key = `${lp}-${st}-${le}-${he}`;
  const regime = REGIME_LABEL[key] ?? { label: 'Custom', color: 'text-gray-600 bg-gray-100' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${regime.color}`}>
      {regime.label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-32 flex flex-col items-center justify-center gap-2 text-gray-300">
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

export function RebalanceHistory() {
  const { data: rows, isLoading } = useWeightHistory();
  const BSCSCAN = 'https://testnet.bscscan.com/tx/';

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-gray-900">Rebalance History</h3>
          <p className="text-xs text-gray-400 mt-0.5">Brain weight regime rotations</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-32 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-indigo-500 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState message="No rebalances yet — trigger one from Brain Controls" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="pb-3 text-left font-semibold">Regime</th>
                <th className="pb-3 text-right font-semibold">M1</th>
                <th className="pb-3 text-right font-semibold">M2</th>
                <th className="pb-3 text-right font-semibold">M3</th>
                <th className="pb-3 text-right font-semibold">M4</th>
                <th className="pb-3 text-right font-semibold">Vol</th>
                <th className="pb-3 text-right font-semibold">When</th>
                <th className="pb-3 text-right font-semibold">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/70">
              {rows.map(r => (
                <tr key={r.id} className="group hover:bg-gray-50/50 transition-colors">
                  <td className="py-3">{regimeTag(r.lpYield, r.staking, r.lending, r.hedge)}</td>
                  <td className="py-3 text-right tabular-nums text-gray-600">{(r.lpYield / 100).toFixed(0)}%</td>
                  <td className="py-3 text-right tabular-nums text-gray-600">{(r.staking / 100).toFixed(0)}%</td>
                  <td className="py-3 text-right tabular-nums text-gray-600">{(r.lending / 100).toFixed(0)}%</td>
                  <td className="py-3 text-right tabular-nums text-gray-600">{(r.hedge / 100).toFixed(0)}%</td>
                  <td className="py-3 text-right tabular-nums">
                    <span className={`font-semibold ${r.volatilityIndex > 5 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {r.volatilityIndex.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 text-right text-gray-400 text-xs">{timeAgo(r.timestamp)}</td>
                  <td className="py-3 text-right">
                    {r.txHash.length > 10 ? (
                      <a href={`${BSCSCAN}${r.txHash}`} target="_blank" rel="noreferrer"
                         className="text-indigo-500 hover:text-indigo-700 font-mono text-xs transition-colors">
                        {shortHash(r.txHash)}
                      </a>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function HarvestFeed() {
  const { data: rows, isLoading } = useRecentHarvests();
  const BSCSCAN = 'https://testnet.bscscan.com/tx/';

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-gray-900">Harvest Feed</h3>
          <p className="text-xs text-gray-400 mt-0.5">Recent compounder cycles</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-32 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-emerald-500 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState message="No harvests yet — click Compound Now to start" />
      ) : (
        <div className="space-y-3">
          {rows.map(h => (
            <div key={h.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50/60 hover:bg-gray-100/60 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">{h.totalHarvested.toFixed(4)} WBNB harvested</div>
                  <div className="text-xs text-gray-400">{timeAgo(h.timestamp)}</div>
                </div>
              </div>
              <div className="text-right">
                <a href={`${BSCSCAN}${h.txHash}`} target="_blank" rel="noreferrer"
                   className="text-indigo-500 hover:text-indigo-700 font-mono text-xs transition-colors">
                  {shortHash(h.txHash)}
                </a>
                <div className="text-xs text-gray-400 mt-0.5">
                  M1:{(h.allocLPYield).toFixed(3)} M2:{(h.allocStaking).toFixed(3)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
