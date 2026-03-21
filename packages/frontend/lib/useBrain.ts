'use client';

import { useReadContracts } from 'wagmi';
import { APEX_CONTRACTS, APEX_BRAIN_ABI, APEX_COMPOUNDER_ABI } from './useVault';

export interface BrainWeights {
  lpYield: number;  // bps (0-10000)
  staking: number;
  lending: number;
  hedge:   number;
}

export interface BrainStats {
  weights:          BrainWeights;
  lastRebalance:    Date | null;
  lastCompound:     Date | null;
  totalHarvested:   string;   // formatted WBNB
  nextRebalanceIn:  string;   // human-readable countdown
  isLoading:        boolean;
}

function formatCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return 'Ready';
  const h = Math.floor(secondsLeft / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Hook: reads Brain weights + Compounder stats */
export function useBrainStats(): BrainStats {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: APEX_CONTRACTS.BRAIN,     abi: APEX_BRAIN_ABI,     functionName: 'currentWeights'       },
      { address: APEX_CONTRACTS.BRAIN,     abi: APEX_BRAIN_ABI,     functionName: 'lastRebalance'        },
      { address: APEX_CONTRACTS.COMPOUNDER,abi: APEX_COMPOUNDER_ABI, functionName: 'lastCompound'         },
      { address: APEX_CONTRACTS.COMPOUNDER,abi: APEX_COMPOUNDER_ABI, functionName: 'totalHarvestedAllTime'},
    ],
    query: { refetchInterval: 30_000 },
  });

  const [weightsData, lastRebalanceData, lastCompoundData, totalHarvestedData] = data ?? [];

  const rawWeights = weightsData?.result as { lpYield: bigint; staking: bigint; lending: bigint; hedge: bigint } | undefined;
  const weights: BrainWeights = rawWeights
    ? {
        lpYield: Number(rawWeights.lpYield),
        staking: Number(rawWeights.staking),
        lending: Number(rawWeights.lending),
        hedge:   Number(rawWeights.hedge),
      }
    : { lpYield: 2500, staking: 3500, lending: 2000, hedge: 2000 };

  const lastRebalanceSec  = lastRebalanceData?.result  ? Number(lastRebalanceData.result  as bigint) : 0;
  const lastCompoundSec   = lastCompoundData?.result   ? Number(lastCompoundData.result   as bigint) : 0;
  const totalHarvestedRaw = totalHarvestedData?.result ? (totalHarvestedData.result as bigint) : 0n;

  const MIN_INTERVAL = 3600; // 1 hour
  const now = Math.floor(Date.now() / 1000);
  const secondsUntilNext = Math.max(0, lastRebalanceSec + MIN_INTERVAL - now);

  return {
    weights,
    lastRebalance:   lastRebalanceSec  > 0 ? new Date(lastRebalanceSec  * 1000) : null,
    lastCompound:    lastCompoundSec   > 0 ? new Date(lastCompoundSec   * 1000) : null,
    totalHarvested:  totalHarvestedRaw >0n ? (Number(totalHarvestedRaw) / 1e18).toFixed(4) : '0.0000',
    nextRebalanceIn: formatCountdown(secondsUntilNext),
    isLoading,
  };
}
