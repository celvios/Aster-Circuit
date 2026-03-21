'use client';

import { useState, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppKit } from '@reown/appkit/react';
import { networks, projectId, wagmiAdapter, targetChain } from '@/lib/web3-config';
import { ToastProvider } from '@/components/apex/Toast';
import { NetworkGuard } from '@/components/apex/NetworkGuard';

// 1. Setup QueryClient
const queryClient = new QueryClient();

// 2. Create the AppKit instance
if (!projectId) throw new Error('Project ID is not defined');

const metadata = {
    name: 'APEX Protocol',
    description: 'Autonomous Protocol for Exponential Yield',
    url: 'http://localhost:3000',
    icons: ['https://avatars.githubusercontent.com/u/37784886']
};

createAppKit({
    adapters: [wagmiAdapter],
    networks: networks as any,
    defaultNetwork: targetChain as any,
    projectId,
    metadata,
    features: { analytics: true }
});

export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false } },
    }));

    return (
            <WagmiProvider config={wagmiAdapter.wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <NetworkGuard />
                <ToastProvider>
                    {children}
                </ToastProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
