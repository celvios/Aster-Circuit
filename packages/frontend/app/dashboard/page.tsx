'use client';

import Link from 'next/link';
import VaultStats from '@/components/apex/VaultStats';
import StrategyWeights from '@/components/apex/StrategyWeights';
import { APYChart, TVLChart, PPSChart } from '@/components/apex/Charts';
import { RebalanceHistory, HarvestFeed } from '@/components/apex/RebalanceHistory';
import UserPosition from '@/components/apex/UserPosition';
import DepositWidget from '@/components/apex/DepositWidget';
import WithdrawWidget from '@/components/apex/WithdrawWidget';
import BrainControls from '@/components/apex/BrainControls';
import CompounderControls from '@/components/apex/CompounderControls';
import StrategyBreakdown from '@/components/apex/StrategyBreakdown';

export default function APEXDashboard() {
  return (
    <div className="min-h-screen pb-24">

      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-50 glass-panel border-b border-white/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900 text-sm">APEX</span>
              <span className="text-gray-300">·</span>
              <span className="text-gray-500 text-sm">Mission Control</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-gray-400 hover:text-gray-700 transition-colors hidden sm:block">
              ← Back
            </Link>
            <appkit-button size="sm" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-8 space-y-8">

        {/* ── Page title ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">APEX Dashboard</h1>
            <p className="text-sm text-gray-400 mt-1">Autonomous Protocol for Exponential Yield — BNB Chain</p>
          </div>
          <div className="text-right hidden md:block">
            <div className="text-xs text-gray-400">Network</div>
            <div className="text-sm font-bold text-gray-700">
              {process.env.NEXT_PUBLIC_CHAIN_ID === '97' ? '🟢 BSC Testnet' : process.env.NEXT_PUBLIC_CHAIN_ID === '31337' ? '🟡 Localhost' : '🟢 BNB Chain'}
            </div>
          </div>
        </div>

        {/* ── Row 1: Protocol stat cards ── */}
        <VaultStats />

        {/* ── Row 2: User position (full-width) ── */}
        <UserPosition />

        {/* ── Row 3: Deposit | Withdraw | Brain | Compounder ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          <DepositWidget />
          <WithdrawWidget />
          <BrainControls />
          <CompounderControls />
        </div>

        {/* ── Row 3.5: Strategy Breakdown ── */}
        <StrategyBreakdown />

        {/* ── Row 4: Charts ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <APYChart />
          <TVLChart />
        </div>

        {/* ── Row 5: PPS chart + Strategy donut ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <PPSChart />
          </div>
          <StrategyWeights />
        </div>

        {/* ── Row 6: Rebalance history ── */}
        <RebalanceHistory />

        {/* ── Row 7: Harvest feed ── */}
        <HarvestFeed />

        {/* ── Footer ── */}
        <footer className="text-center text-xs text-gray-300 pt-8 border-t border-gray-100">
          APEX Protocol — Built for Riquid Hackathon · Based on AsterCircuit · BNB Chain
        </footer>

      </main>
    </div>
  );
}
