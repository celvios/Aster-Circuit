'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther, maxUint256 } from 'viem';
import { APEX_CONTRACTS, APEX_VAULT_ABI } from '@/lib/useVault';
import { APEX_CHAIN_ID } from '@/lib/web3-config';
import { useToast } from './Toast';

const WBNB_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

const WBNB_ADDR = (process.env.NEXT_PUBLIC_WBNB_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3') as `0x${string}`;
const MIN_DEPOSIT = parseEther('0.01');

export default function DepositWidget() {
  const { address, isConnected } = useAccount();
  const { addToast, updateToast } = useToast();
  const [amount, setAmount] = useState('');

  const amountWei = amount ? parseEther(amount) : 0n;
  const needsApproval = amountWei > 0n;

  // Read wallet WBNB balance
  const { data: wbnbBalance, refetch: refetchBalance } = useReadContract({
    address: WBNB_ADDR,
    abi: WBNB_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: APEX_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  // Read current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: WBNB_ADDR,
    abi: WBNB_ABI,
    functionName: 'allowance',
    args: address ? [address, APEX_CONTRACTS.VAULT] : undefined,
    chainId: APEX_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  // Preview shares to receive
  const { data: sharesOut } = useReadContract({
    address: APEX_CONTRACTS.VAULT,
    abi: APEX_VAULT_ABI,
    functionName: 'previewDeposit' as any,
    args: amountWei > 0n ? [amountWei] : undefined,
    chainId: APEX_CHAIN_ID,
    query: { enabled: amountWei > 0n },
  });

  const { writeContract: writeApprove, isPending: isApproving }  = useWriteContract();
  const { writeContract: writeDeposit, isPending: isDepositing } = useWriteContract();
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: pendingHash,
    query: { enabled: !!pendingHash },
  });

  const balanceNum  = wbnbBalance ? parseFloat(formatEther(wbnbBalance as bigint)) : 0;
  const allowanceOk = (allowance as bigint ?? 0n) >= amountWei && amountWei > 0n;

  const isWorking = isApproving || isDepositing || isConfirming;

  const handleApprove = () => {
    const toastId = addToast({ type: 'pending', title: 'Approving WBNB…', message: 'Waiting for wallet confirmation' });
    writeApprove({
      address: WBNB_ADDR,
      abi: WBNB_ABI,
      functionName: 'approve',
      args: [APEX_CONTRACTS.VAULT, maxUint256],
      chainId: APEX_CHAIN_ID,
    }, {
      onSuccess: (hash) => {
        updateToast(toastId, { type: 'success', title: 'Approved!', message: 'WBNB spending approved', txHash: hash });
        refetchAllowance();
      },
      onError: (err) => updateToast(toastId, { type: 'error', title: 'Approval failed', message: err.message.slice(0, 80) }),
    });
  };

  const handleDeposit = () => {
    if (!address || amountWei < MIN_DEPOSIT) return;
    const toastId = addToast({ type: 'pending', title: 'Depositing…', message: `Depositing ${amount} WBNB into APEX Vault` });
    writeDeposit({
      address: APEX_CONTRACTS.VAULT,
      abi: APEX_VAULT_ABI,
      functionName: 'deposit',
      args: [amountWei, address],
      chainId: APEX_CHAIN_ID,
    }, {
      onSuccess: (hash) => {
        setPendingHash(hash);
        updateToast(toastId, { type: 'success', title: 'Deposit confirmed!', message: `${amount} WBNB deposited`, txHash: hash });
        setAmount('');
        refetchBalance();
      },
      onError: (err) => updateToast(toastId, { type: 'error', title: 'Deposit failed', message: err.message.slice(0, 100) }),
    });
  };

  const setMax = () => wbnbBalance && setAmount(parseFloat(formatEther(wbnbBalance as bigint)).toFixed(6));

  const validAmount  = amountWei >= MIN_DEPOSIT && amountWei <= (wbnbBalance as bigint ?? 0n);
  const errorMsg     = amount && amountWei < MIN_DEPOSIT ? 'Minimum deposit is 0.01 WBNB'
                     : amount && amountWei > (wbnbBalance as bigint ?? 0n) ? 'Insufficient WBNB balance'
                     : null;

  if (!isConnected) {
    return (
      <div className="glass-panel rounded-2xl p-6 flex flex-col items-center justify-center gap-3 min-h-[220px]">
        <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-sm text-gray-400 font-medium">Connect wallet to deposit</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900">Deposit</h3>
          <p className="text-xs text-gray-400 mt-0.5">Stake WBNB, earn blended yield</p>
        </div>
        <div className="p-2.5 rounded-xl bg-indigo-50">
          <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </div>
      </div>

      {/* Amount input */}
      <div>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            className={`input-minimal pr-20 font-mono text-lg ${errorMsg ? 'border-red-300 focus:border-red-400' : ''}`}
          />
          <div className="absolute right-14 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">WBNB</div>
          <button
            onClick={setMax}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-500 hover:text-indigo-700 transition-colors px-1"
          >
            MAX
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          {errorMsg
            ? <span className="text-xs text-red-500 font-medium">{errorMsg}</span>
            : <span className="text-xs text-gray-400">Balance: <span className="font-mono text-gray-600">{balanceNum.toFixed(4)} WBNB</span></span>
          }
          {sharesOut && amountWei > 0n && (
            <span className="text-xs text-gray-400">
              ≈ <span className="font-mono text-gray-600">{parseFloat(formatEther(sharesOut as bigint)).toFixed(4)} APEX-LP</span>
            </span>
          )}
        </div>
      </div>

      {/* Fee notice */}
      <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1">
        <div className="flex justify-between">
          <span>Exit fee (on withdrawal)</span>
          <span className="font-semibold text-gray-700">0.1%</span>
        </div>
        <div className="flex justify-between">
          <span>Min deposit</span>
          <span className="font-semibold text-gray-700">0.01 WBNB</span>
        </div>
      </div>

      {/* CTA button — 2-step: approve then deposit */}
      {!allowanceOk ? (
        <button
          onClick={handleApprove}
          disabled={!validAmount || isWorking}
          className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isApproving ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Approving…
            </>
          ) : 'Approve WBNB'}
        </button>
      ) : (
        <button
          onClick={handleDeposit}
          disabled={!validAmount || isWorking}
          className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isDepositing || isConfirming ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {isDepositing ? 'Confirm in wallet…' : 'Confirming…'}
            </>
          ) : `Deposit ${amount || '0'} WBNB`}
        </button>
      )}
    </div>
  );
}
