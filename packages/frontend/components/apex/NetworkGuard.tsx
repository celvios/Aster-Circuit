'use client';

import { useEffect } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { APEX_CHAIN_ID } from '@/lib/web3-config';

/**
 * Silently switches MetaMask to the correct network as soon as
 * a wallet connects. MetaMask will still show its own "Switch Network"
 * confirmation — but the user doesn't have to click anything in the app.
 */
export function NetworkGuard() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    if (isConnected && chainId !== APEX_CHAIN_ID) {
      switchChain({ chainId: APEX_CHAIN_ID });
    }
  }, [isConnected, chainId, switchChain]);

  return null;
}
