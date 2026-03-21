'use client';

import { useBrainStats } from '@/lib/useBrain';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const STRATEGIES = [
  { key: 'lpYield', label: 'M1 LP Yield',  color: '#6366f1', protocol: 'AsterDEX LP' },
  { key: 'staking', label: 'M2 Liquid Staking', color: '#10b981', protocol: 'asBNB' },
  { key: 'lending', label: 'M3 Lending',   color: '#f59e0b', protocol: 'Venus' },
  { key: 'hedge',   label: 'M4 Hedge',     color: '#ef4444', protocol: 'AsterDEX Pro' },
] as const;

function bpsToPercent(bps: number) {
  return (bps / 100).toFixed(1);
}

export default function StrategyWeights() {
  const { weights, isLoading } = useBrainStats();

  const chartData = STRATEGIES.map(s => ({
    ...s,
    value: weights[s.key],
    percent: bpsToPercent(weights[s.key]),
  }));

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-gray-900">Strategy Allocation</h3>
          <p className="text-xs text-gray-400 mt-0.5">Brain weight vector (bps)</p>
        </div>
        <div className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-lg">
          Live
        </div>
      </div>

      {isLoading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-indigo-500 animate-spin" />
        </div>
      ) : (
        <div className="flex items-center gap-6">
          {/* Donut chart */}
          <div className="w-40 h-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%" cy="50%"
                  innerRadius={38} outerRadius={60}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any) => [`${bpsToPercent(Number(val))}%`, '']}
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-3">
            {chartData.map(s => (
              <div key={s.key} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }}/>
                  <div>
                    <div className="text-sm font-semibold text-gray-800 leading-none">{s.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{s.protocol}</div>
                  </div>
                </div>
                <div className="text-sm font-bold tabular-nums" style={{ color: s.color }}>
                  {s.percent}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
