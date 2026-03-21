'use client';

import Link from 'next/link';
import { useVaultStats } from '@/lib/useVault';
import { useBrainStats } from '@/lib/useBrain';
import DepositWidget from '@/components/apex/DepositWidget';
import WithdrawWidget from '@/components/apex/WithdrawWidget';
import UserPosition from '@/components/apex/UserPosition';

// ── Strategy definitions ─────────────────────────────────────────────────────
const STRATEGIES = [
  {
    module: 'M1',
    name: 'LP Yield',
    desc: 'Provides liquidity to AsterDEX pools, capturing trading fees and LP incentives with IL monitoring.',
    apy: '10–18%',
    risk: 'Medium',
    riskColor: 'text-amber-600 bg-amber-50',
    color: 'from-indigo-500 to-indigo-600',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  {
    module: 'M2',
    name: 'Liquid Staking',
    desc: 'Stakes BNB through AsterDEX for asBNB, earning consensus-layer rewards with instant liquidity.',
    apy: '6–9%',
    risk: 'Low',
    riskColor: 'text-emerald-600 bg-emerald-50',
    color: 'from-emerald-500 to-emerald-600',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
  {
    module: 'M3',
    name: 'Lending',
    desc: 'Supplies WBNB to Venus Protocol money markets, earning variable lending rates with zero IL.',
    apy: '4–7%',
    risk: 'Low',
    riskColor: 'text-emerald-600 bg-emerald-50',
    color: 'from-amber-500 to-amber-600',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    module: 'M4',
    name: 'Hedge',
    desc: 'Deploys capital into delta-neutral positions on AsterDEX Pro, protecting TVL in volatile regimes.',
    apy: '2–5%',
    risk: 'Defensive',
    riskColor: 'text-red-600 bg-red-50',
    color: 'from-red-500 to-red-600',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Deposit WBNB', desc: 'Approve and deposit any amount. You receive APEX-LP shares representing your proportional vault ownership.' },
  { step: '02', title: 'Brain Allocates', desc: 'The APEX Brain reads on-chain signals (volatility index, APY differential, capital utilisation) and distributes across M1–M4.' },
  { step: '03', title: 'Compounder Harvests', desc: 'Permissionless harvesting compounds yield from all 4 strategies and reinvests automatically, growing your PPS.' },
  { step: '04', title: 'Withdraw Anytime', desc: 'Redeem your APEX-LP shares for WBNB at any time. A 0.1% exit fee goes to the protocol treasury.' },
];

// ── Live stats strip ──────────────────────────────────────────────────────────
function LiveStatsStrip() {
  const vault = useVaultStats();
  const brain = useBrainStats();

  const regime = (() => {
    const { lpYield, staking } = brain.weights;
    if (staking > 4500) return 'High Volatility';
    if (lpYield > 3500) return 'APY Chase';
    if (lpYield < 2200) return 'Idle Capital';
    return 'Balanced';
  })();

  return (
    <div className="glass-panel border-b border-white/50">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-center gap-8 flex-wrap text-sm">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-gray-500">Live</span>
        </span>
        <span className="text-gray-400">TVL <span className="font-mono font-bold text-gray-900">{vault.totalAssets} WBNB</span></span>
        <span className="text-gray-400">APY <span className="font-mono font-bold text-emerald-600">{vault.blendedAPY.toFixed(2)}%</span></span>
        <span className="text-gray-400">PPS <span className="font-mono font-bold text-gray-900">{vault.pricePerShare}</span></span>
        <span className="text-gray-400">Brain <span className="font-semibold text-indigo-600">{regime}</span></span>
        <span className="text-gray-400">Harvested <span className="font-mono font-bold text-gray-900">{brain.totalHarvested} WBNB</span></span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <div className="min-h-screen pb-24">

      {/* Header */}
      <header className="sticky top-0 z-50 glass-panel border-b border-white/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900">APEX</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-500">
            <a href="#strategies" className="hover:text-gray-900 transition-colors">Strategies</a>
            <a href="#how" className="hover:text-gray-900 transition-colors">How it works</a>
            <Link href="/dashboard" className="hover:text-gray-900 transition-colors">Dashboard</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
              Mission Control →
            </Link>
            <appkit-button size="sm" />
          </div>
        </div>
      </header>

      {/* Live stats ticker */}
      <LiveStatsStrip />

      <main className="max-w-7xl mx-auto px-6">

        {/* ── Hero ── */}
        <section className="py-24 text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-xs font-semibold text-indigo-600 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Built for Riquid Hackathon · BNB Chain · Based on AsterCircuit
          </div>

          <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-gray-900 leading-[1.05]">
            Autonomous<br />
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
              Exponential Yield
            </span>
          </h1>

          <p className="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            APEX is a self-driving yield vault on BNB Chain. Its on-chain Brain reads market signals
            every block and rotates capital across 4 strategies — LP yield, liquid staking, lending,
            and hedging — to maximise risk-adjusted returns.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/dashboard"
              className="btn-primary px-8 py-4 text-base rounded-2xl flex items-center gap-2">
              Open Dashboard
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a href="#deposit"
              className="px-8 py-4 text-base rounded-2xl border border-gray-200 bg-white font-semibold text-gray-700 hover:bg-gray-50 transition-all shadow-sm">
              Deposit Now
            </a>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mt-8">
            {[
              { label: 'Target APY', value: '12–18%', sub: 'Blended across 4 strategies', color: 'text-emerald-600' },
              { label: 'Strategies', value: '4',      sub: 'LP, Staking, Lending, Hedge', color: 'text-indigo-600' },
              { label: 'Exit Fee',   value: '0.1%',   sub: 'Lowest in class', color: 'text-gray-900' },
              { label: 'Automated', value: '100%',    sub: 'Zero manual rebalancing', color: 'text-purple-600' },
            ].map(m => (
              <div key={m.label} className="glass-panel rounded-2xl p-5 text-left">
                <div className={`text-3xl font-bold ${m.color} tabular-nums`}>{m.value}</div>
                <div className="text-xs font-bold text-gray-700 mt-1">{m.label}</div>
                <div className="text-xs text-gray-400 mt-0.5 leading-tight">{m.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Strategy grid ── */}
        <section id="strategies" className="py-16 space-y-10">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">4-Strategy Architecture</h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto">
              The Brain dynamically weights capital across each module based on real-time on-chain signals.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {STRATEGIES.map(s => (
              <div key={s.module} className="glass-panel rounded-2xl p-6 flex flex-col gap-4 group hover:shadow-lg transition-all duration-300">
                <div className="flex items-start justify-between">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${s.color} text-white shadow-md group-hover:scale-110 transition-transform`}>
                    {s.icon}
                  </div>
                  <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">{s.module}</span>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">{s.name}</h3>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{s.desc}</p>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
                  <span className="text-gray-400">Target APY</span>
                  <span className="font-bold text-gray-900 tabular-nums">{s.apy}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Risk</span>
                  <span className={`font-bold px-2 py-0.5 rounded-full ${s.riskColor}`}>{s.risk}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="py-16 space-y-10">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">How It Works</h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto">Four steps from deposit to autonomous yield generation.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {HOW_IT_WORKS.map((h, i) => (
              <div key={h.step} className="glass-panel rounded-2xl p-6 space-y-3 relative overflow-hidden">
                <div className="text-6xl font-black text-gray-50 absolute -top-2 -right-1 select-none">{h.step}</div>
                <div className="relative">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm mb-3">
                    {i + 1}
                  </div>
                  <h3 className="font-bold text-gray-900">{h.title}</h3>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{h.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Deposit section ── */}
        <section id="deposit" className="py-16 space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Start Earning</h2>
            <p className="text-gray-500 mt-3">Deposit WBNB into the vault and let APEX do the work.</p>
          </div>

          {/* User position */}
          <UserPosition />

          {/* Deposit / Withdraw side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <DepositWidget />
            <WithdrawWidget />
          </div>

          <p className="text-center text-xs text-gray-400">
            By depositing you agree that this is experimental software. Audit not yet completed.
          </p>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-gray-100 py-12 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-bold text-gray-600">APEX Protocol</span>
            <span>·</span>
            <span>Riquid Hackathon 2026</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="hover:text-gray-700 transition-colors">Dashboard</Link>
            <a href="https://github.com/celvios/Aster-Circuit" target="_blank" rel="noreferrer" className="hover:text-gray-700 transition-colors">GitHub</a>
            <span>Built on BNB Chain</span>
          </div>
        </footer>

      </main>
    </div>
  );
}
