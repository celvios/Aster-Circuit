'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { formatEther } from 'viem';
import { CONTRACTS } from '@/lib/web3-config';

// APEX Vault ABI — full set of read functions
export const APEX_VAULT_ABI = [
  { name: 'totalAssets',   type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'totalSupply',   type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'pricePerShare', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'blendedAPY',   type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'paused',        type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'balanceOf',     type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'previewRedeem', type: 'function', stateMutability: 'view', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'deposit',       type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'redeem',        type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'shares', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve',       type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

export const APEX_BRAIN_ABI = [
  { name: 'currentWeights', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'tuple', components: [{ name: 'lpYield', type: 'uint256' }, { name: 'staking', type: 'uint256' }, { name: 'lending', type: 'uint256' }, { name: 'hedge', type: 'uint256' }] }] },
  { name: 'computeWeights', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'tuple', components: [{ name: 'lpYield', type: 'uint256' }, { name: 'staking', type: 'uint256' }, { name: 'lending', type: 'uint256' }, { name: 'hedge', type: 'uint256' }] }] },
  { name: 'lastRebalance',  type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'rebalance',      type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
] as const;

export const APEX_COMPOUNDER_ABI = [
  { name: 'lastCompound',           type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'totalHarvestedAllTime',  type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'MIN_HARVEST_THRESHOLD', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'compound',               type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
] as const;

// Contract addresses from env
export const APEX_CONTRACTS = {
  VAULT:     (process.env.NEXT_PUBLIC_APEX_VAULT_ADDRESS     || '0x0000000000000000000000000000000000000001') as `0x${string}`,
  BRAIN:     (process.env.NEXT_PUBLIC_APEX_BRAIN_ADDRESS     || '0x0000000000000000000000000000000000000002') as `0x${string}`,
  COMPOUNDER:(process.env.NEXT_PUBLIC_APEX_COMPOUNDER_ADDRESS || '0x0000000000000000000000000000000000000003') as `0x${string}`,
} as const;

export interface VaultStats {
  totalAssets:   string;    // formatted WBNB
  totalShares:   string;
  pricePerShare: string;    // formatted
  blendedAPY:    number;    // bps → %
  paused:        boolean;
  isLoading:     boolean;
}

export interface UserVaultPosition {
  shares:        bigint;
  valueWBNB:     string;    // formatted
  isLoading:     boolean;
}

/** Hook: read vault-level stats (TVL, PPS, APY, paused state) */
export function useVaultStats(): VaultStats {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: APEX_CONTRACTS.VAULT, abi: APEX_VAULT_ABI, functionName: 'totalAssets'   },
      { address: APEX_CONTRACTS.VAULT, abi: APEX_VAULT_ABI, functionName: 'totalSupply'   },
      { address: APEX_CONTRACTS.VAULT, abi: APEX_VAULT_ABI, functionName: 'pricePerShare' },
      { address: APEX_CONTRACTS.VAULT, abi: APEX_VAULT_ABI, functionName: 'blendedAPY'   },
      { address: APEX_CONTRACTS.VAULT, abi: APEX_VAULT_ABI, functionName: 'paused'        },
    ],
    query: { refetchInterval: 12_000 }, // refresh every block
  });

  const [totalAssets, totalSupply, pricePerShare, blendedAPY, paused] = data ?? [];

  return {
    totalAssets:   totalAssets?.result  ? parseFloat(formatEther(totalAssets.result as bigint)).toFixed(4) : '—',
    totalShares:   totalSupply?.result  ? parseFloat(formatEther(totalSupply.result as bigint)).toFixed(2)  : '—',
    pricePerShare: pricePerShare?.result ? parseFloat(formatEther(pricePerShare.result as bigint)).toFixed(6) : '—',
    blendedAPY:    blendedAPY?.result   ? Number(blendedAPY.result as bigint) / 100 : 0, // bps → %
    paused:        paused?.result as boolean ?? false,
    isLoading,
  };
}

/** Hook: read user's current position in the vault */
export function useUserPosition(address: `0x${string}` | undefined): UserVaultPosition {
  const { data: sharesData, isLoading: sharesLoading } = useReadContract({
    address: APEX_CONTRACTS.VAULT,
    abi: APEX_VAULT_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const shares = (sharesData as bigint) ?? 0n;

  const { data: valueData, isLoading: valueLoading } = useReadContract({
    address: APEX_CONTRACTS.VAULT,
    abi: APEX_VAULT_ABI,
    functionName: 'previewRedeem',
    args: shares > 0n ? [shares] : undefined,
    query: { enabled: shares > 0n, refetchInterval: 12_000 },
  });

  return {
    shares,
    valueWBNB: valueData ? parseFloat(formatEther(valueData as bigint)).toFixed(6) : '0.000000',
    isLoading: sharesLoading || valueLoading,
  };
}
