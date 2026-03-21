'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther } from 'viem';
import { APEX_CONTRACTS, APEX_VAULT_ABI } from '@/lib/useVault';
import { useToast } from './Toast';

export default function WithdrawWidget() {
  const { address, isConnected } = useAccount();
  const { addToast, updateToast } = useToast();
  const [percentage, setPercentage] = useState(100);

  // Read user's shares
  const { data: userShares, refetch: refetchShares } = useReadContract({
    address: APEX_CONTRACTS.VAULT,
    abi: APEX_VAULT_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const shares = (userShares as bigint) ?? 0n;
  const sharesToRedeem = shares * BigInt(percentage) / 100n;

  // Preview WBNB to receive (before fee)
  const { data: assetsOut } = useReadContract({
    address: APEX_CONTRACTS.VAULT,
    abi: APEX_VAULT_ABI,
    functionName: 'previewRedeem',
    args: sharesToRedeem > 0n ? [sharesToRedeem] : undefined,
    query: { enabled: sharesToRedeem > 0n },
  });

  const grossWBNB = assetsOut ? parseFloat(formatEther(assetsOut as bigint)) : 0;
  const feeWBNB   = grossWBNB * 0.001;           // 0.1% exit fee
  const netWBNB   = grossWBNB - feeWBNB;

  const { writeContract: writeRedeem, isPending: isRedeeming } = useWriteContract();
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: pendingHash,
    query: { enabled: !!pendingHash },
  });

  const isWorking = isRedeeming || isConfirming;

  const handleRedeem = () => {
    if (!address || sharesToRedeem === 0n) return;
    const toastId = addToast({
      type: 'pending',
      title: 'Withdrawing…',
      message: `Redeeming ${(Number(sharesToRedeem) / 1e18).toFixed(4)} APEX-LP`,
    });
    // ERC-4626: redeem(shares, receiver, owner) — when owner == caller, no prior approval needed
    writeRedeem({
      address: APEX_CONTRACTS.VAULT,
      abi: APEX_VAULT_ABI,
      functionName: 'redeem',
      args: [sharesToRedeem, address, address],
    }, {
      onSuccess: (hash) => {
        setPendingHash(hash);
        updateToast(toastId, {
          type: 'success',
          title: 'Withdrawal confirmed!',
          message: `Received ~${netWBNB.toFixed(4)} WBNB`,
          txHash: hash,
        });
        refetchShares();
      },
      onError: (err) => {
        updateToast(toastId, {
          type: 'error',
          title: 'Withdrawal failed',
          message: err.message.slice(0, 100),
        });
      },
    });
  };

  if (!isConnected) {
    return (
      <div className="glass-panel rounded-2xl p-6 flex flex-col items-center justify-center gap-3 min-h-[220px]">
        <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-sm text-gray-400 font-medium">Connect wallet to withdraw</p>
      </div>
    );
  }

  const noShares = shares === 0n;

  return (
    <div className="glass-panel rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900">Withdraw</h3>
          <p className="text-xs text-gray-400 mt-0.5">Redeem APEX-LP for WBNB</p>
        </div>
        <div className="p-2.5 rounded-xl bg-amber-50">
          <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4m0 0l6-6m-6 6l6 6" />
          </svg>
        </div>
      </div>

      {noShares ? (
        <div className="text-center py-8">
          <div className="text-sm text-gray-400">No APEX-LP shares to redeem.</div>
          <div className="text-xs text-gray-300 mt-1">Deposit first to earn shares.</div>
        </div>
      ) : (
        <>
          {/* Percentage slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Amount to withdraw</label>
              <span className="text-sm font-bold text-indigo-600">{percentage}%</span>
            </div>
            <input
              type="range" min={1} max={100} step={1} value={percentage}
              onChange={e => setPercentage(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between mt-1 text-xs text-gray-400">
              {[25, 50, 75, 100].map(p => (
                <button
                  key={p}
                  onClick={() => setPercentage(p)}
                  className={`px-2 py-0.5 rounded-lg font-semibold transition-colors
                    ${percentage === p ? 'bg-indigo-100 text-indigo-700' : 'hover:text-gray-700'}`}
                >
                  {p === 100 ? 'MAX' : `${p}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Summary line */}
          <div className="text-sm text-gray-500 px-1">
            Redeeming:{' '}
            <span className="font-mono font-semibold text-gray-800">
              {(Number(sharesToRedeem) / 1e18).toFixed(6)} APEX-LP
            </span>
            <span className="text-xs text-gray-400 ml-1">
              of {(Number(shares) / 1e18).toFixed(4)} total
            </span>
          </div>

          {/* Fee breakdown */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Gross value</span>
              <span className="font-mono font-semibold text-gray-700">{grossWBNB.toFixed(6)} WBNB</span>
            </div>
            <div className="flex justify-between text-red-500">
              <span>Exit fee (0.1%)</span>
              <span className="font-mono">−{feeWBNB.toFixed(6)} WBNB</span>
            </div>
            <div className="pt-1 border-t border-gray-200 flex justify-between font-bold">
              <span className="text-gray-700">You receive</span>
              <span className="font-mono text-gray-900">{netWBNB.toFixed(6)} WBNB</span>
            </div>
          </div>

          {/* Redeem button — no separate approval needed when owner == caller */}
          <button
            onClick={handleRedeem}
            disabled={isWorking || sharesToRedeem === 0n}
            className="w-full py-3.5 rounded-xl border border-gray-200 bg-white text-gray-900 font-semibold
              flex items-center justify-center gap-2 hover:bg-gray-50 transition-all shadow-sm
              disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {isWorking ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                {isRedeeming ? 'Confirm in wallet…' : 'Confirming…'}
              </>
            ) : `Withdraw ${netWBNB.toFixed(4)} WBNB`}
          </button>
        </>
      )}
    </div>
  );
}
