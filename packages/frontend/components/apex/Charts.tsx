'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line
} from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { useDailyChart } from '@/lib/useSubgraph';
import { APEX_CONTRACTS } from '@/lib/useVault';

function formatDate(unixDay: unknown): string {
  const num = typeof unixDay === 'number' ? unixDay : Number(unixDay);
  if (isNaN(num)) return '';
  const d = new Date(num * 86400 * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtAPY(v: ValueType | undefined, _name: NameType | undefined): [string, string] {
  const n = typeof v === 'number' ? v : 0;
  return [`${n.toFixed(2)}%`, 'APY'];
}
function fmtVal(suffix: string) {
  return (v: ValueType | undefined, _name: NameType | undefined): [string, string] => {
    const n = typeof v === 'number' ? v : 0;
    return [`${n.toFixed(4)} ${suffix}`, ''];
  };
}
function fmtPPS(v: ValueType | undefined, _name: NameType | undefined): [string, string] {
  const n = typeof v === 'number' ? v : 0;
  return [n.toFixed(6), 'PPS'];
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="h-48 flex flex-col items-center justify-center gap-2 text-gray-300">
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

export function APYChart() {
  const { data, isLoading } = useDailyChart(APEX_CONTRACTS.VAULT);

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-gray-900">Blended APY — 30d</h3>
          <p className="text-xs text-gray-400 mt-0.5">Weight-averaged across M1–M4</p>
        </div>
      </div>
      <div className="h-48">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-emerald-500 animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <ChartEmpty message="APY data will appear after the first rebalance" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="apyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={6} />
              <YAxis tickFormatter={(v: number) => `${v.toFixed(1)}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={fmtAPY} labelFormatter={formatDate} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', fontSize: 12 }} />
              <Area type="monotone" dataKey="blendedAPY" stroke="#10b981" strokeWidth={2} fill="url(#apyGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function TVLChart() {
  const { data, isLoading } = useDailyChart(APEX_CONTRACTS.VAULT);

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-gray-900">TVL — 30d</h3>
          <p className="text-xs text-gray-400 mt-0.5">Total Value Locked (WBNB)</p>
        </div>
      </div>
      <div className="h-48">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <ChartEmpty message="TVL chart populates after your first deposit" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="tvlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={6} />
              <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={fmtVal('WBNB')} labelFormatter={formatDate} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', fontSize: 12 }} />
              <Area type="monotone" dataKey="totalAssets" stroke="#6366f1" strokeWidth={2} fill="url(#tvlGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function PPSChart() {
  const { data, isLoading } = useDailyChart(APEX_CONTRACTS.VAULT);

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-gray-900">Price Per Share — 30d</h3>
          <p className="text-xs text-gray-400 mt-0.5">APEX-LP token value in WBNB</p>
        </div>
      </div>
      <div className="h-48">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-purple-500 animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <ChartEmpty message="PPS history appears after the subgraph indexes your first deposit" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={6} />
              <YAxis tickFormatter={(v: number) => v.toFixed(4)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={fmtPPS} labelFormatter={formatDate} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', fontSize: 12 }} />
              <Line type="monotone" dataKey="pricePerShare" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
