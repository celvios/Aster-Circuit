'use client';

import { useReadContracts } from 'wagmi';
import { formatEther } from 'viem';
import { APEX_CONTRACTS } from '@/lib/useVault';

const VAULT_ABI_WITH_STRATEGIES = [
  { name: 'strategies', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
] as const;

const STRATEGY_ABI = [
  { name: 'totalAssets', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'currentAPY',  type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

const STRATEGY_META = [
  { name: 'M1 LP Yield',  protocol: 'AsterDEX LP',   color: '#6366f1', dot: 'bg-indigo-500',  bar: 'bg-indigo-500'  },
  { name: 'M2 Staking',   protocol: 'asBNB Staking',  color: '#10b981', dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
  { name: 'M3 Lending',   protocol: 'Venus Supply',    color: '#f59e0b', dot: 'bg-amber-500',   bar: 'bg-amber-500'   },
  { name: 'M4 Hedge',     protocol: 'AsterDEX Pro',   color: '#ef4444', dot: 'bg-red-500',     bar: 'bg-red-500'     },
];

// APEX_CHAIN_ID needs to be a number literal for wagmi
const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '97') as 97;

export default function StrategyBreakdown() {
  // Step 1: Read strategy addresses from vault
  const { data: addrsData, isLoading: addrsLoading } = useReadContracts({
    contracts: [0, 1, 2, 3].map(i => ({
      address: APEX_CONTRACTS.VAULT,
      abi: VAULT_ABI_WITH_STRATEGIES,
      functionName: 'strategies' as const,
      args: [BigInt(i)] as const,
      chainId: CHAIN_ID,
    })),
    query: { refetchInterval: 30_000 },
  });

  const strategyAddrs = addrsData?.map(d => d.result as `0x${string}` | undefined) ?? [undefined, undefined, undefined, undefined];
  const hasAddrs = strategyAddrs.some(a => a && a !== '0x0000000000000000000000000000000000000000');

  // Step 2: Read totalAssets + currentAPY from each strategy
  const { data: statsData, isLoading: statsLoading } = useReadContracts({
    contracts: strategyAddrs.flatMap((addr) => [
      { address: addr ?? '0x0000000000000000000000000000000000000001' as `0x${string}`, abi: STRATEGY_ABI, functionName: 'totalAssets' as const, chainId: CHAIN_ID },
      { address: addr ?? '0x0000000000000000000000000000000000000001' as `0x${string}`, abi: STRATEGY_ABI, functionName: 'currentAPY' as const,  chainId: CHAIN_ID },
    ]),
    query: {
      enabled: hasAddrs,
      refetchInterval: 12_000,
    },
  });

  const isLoading = addrsLoading || statsLoading;

  // Parse stats — statsData is [totalAssets[0], APY[0], totalAssets[1], APY[1], ...]
  const strategies = STRATEGY_META.map((meta, i) => {
    const totalAssetsRaw = statsData?.[i * 2]?.result as bigint | undefined;
    const apyRaw        = statsData?.[i * 2 + 1]?.result as bigint | undefined;
    const addr          = strategyAddrs[i];
    const isActive      = !!addr && addr !== '0x0000000000000000000000000000000000000000';
    const totalAssets   = totalAssetsRaw !== undefined ? parseFloat(formatEther(totalAssetsRaw)) : 0;
    const apy           = apyRaw !== undefined ? Number(apyRaw) / 100 : 0; // bps → %

    return { ...meta, addr, isActive, totalAssets, apy };
  });

  const totalDeployed = strategies.reduce((s, x) => s + x.totalAssets, 0);

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-gray-900">Strategy Breakdown</h3>
          <p className="text-xs text-gray-400 mt-0.5">Live per-strategy allocation &amp; yield</p>
        </div>
        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-indigo-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {strategies.map((s) => {
            const pct = totalDeployed > 0 ? (s.totalAssets / totalDeployed) * 100 : 0;
            return (
              <div key={s.name} className="flex items-center gap-4">
                {/* Status dot */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.isActive ? `${s.dot} ring-2 ring-offset-1` : 'bg-gray-200'}`} />

                {/* Name + protocol */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <span className="text-xs font-bold text-gray-800">{s.name}</span>
                      <span className="text-xs text-gray-400 ml-1.5">{s.protocol}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-gray-700">
                        {s.totalAssets.toFixed(4)} WBNB
                      </span>
                      {s.apy > 0 && (
                        <span className="text-xs ml-2 font-semibold" style={{ color: s.color }}>
                          {s.apy.toFixed(2)}% APY
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${s.bar}`}
                      style={{ width: `${Math.max(pct, s.isActive ? 1 : 0)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Idle funds */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="text-gray-400 font-medium">Idle (vault uninvested)</span>
            <span className="font-mono font-bold text-gray-500">
              {totalDeployed === 0 ? '—' : `0.0000 WBNB`}
            </span>
          </div>

          {/* Address strip */}
          <div className="text-[10px] text-gray-200 space-y-0.5 pt-1">
            {strategies.map(s => s.addr && (
              <div key={s.name} className="flex gap-2">
                <span className="text-gray-400">{s.name}:</span>
                <a
                  href={`https://testnet.bscscan.com/address/${s.addr}`}
                  target="_blank" rel="noreferrer"
                  className="font-mono hover:text-indigo-400 transition-colors truncate"
                >
                  {s.addr.slice(0, 10)}…{s.addr.slice(-6)}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
