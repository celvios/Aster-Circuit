'use client';

import { useState, useEffect } from 'react';
import { GraphQLClient } from 'graphql-request';

const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL || 'https://api.studio.thegraph.com/query/0/apex-protocol/v0.0.1';
const client = new GraphQLClient(SUBGRAPH_URL);

export interface DailySnapshotPoint {
  date:         number;
  totalAssets:  number;   // WBNB
  pricePerShare:number;
  blendedAPY:   number;   // %
  harvestTotal: number;   // WBNB
}

export interface RebalanceEvent {
  id:                string;
  lpYield:           number;
  staking:           number;
  lending:           number;
  hedge:             number;
  volatilityIndex:   number;
  apyDifferential:   number;
  timestamp:         number;
  txHash:            string;
}

export interface HarvestPoint {
  id:             string;
  totalHarvested: number;
  allocLPYield:   number;
  allocStaking:   number;
  allocLending:   number;
  allocHedge:     number;
  timestamp:      number;
  txHash:         string;
}

// ── TVL + APY 30-day chart data ───────────────────────────────────────────────
const DAILY_CHART_QUERY = `
  query DailyChart($vault: String!, $since: Int!) {
    dailySnapshots(
      where: { vault: $vault, date_gte: $since }
      orderBy: date orderDirection: asc first: 30
    ) {
      date totalAssets pricePerShare blendedAPY totalHarvestedAllTime
    }
  }
`;

export function useDailyChart(vaultAddress: string) {
  const [data, setData] = useState<DailySnapshotPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!vaultAddress) return;
    const since = Math.floor(Date.now() / 1000 / 86400) - 30;
    client.request<{ dailySnapshots: any[] }>(DAILY_CHART_QUERY, { vault: vaultAddress.toLowerCase(), since })
      .then(res => {
        setData(res.dailySnapshots.map(s => ({
          date:          s.date,
          totalAssets:   parseFloat(s.totalAssets),
          pricePerShare: parseFloat(s.pricePerShare),
          blendedAPY:    parseFloat(s.blendedAPY) / 100, // bps → %
          harvestTotal:  parseFloat(s.totalHarvestedAllTime),
        })));
      })
      .catch(() => setData([]))
      .finally(() => setIsLoading(false));
  }, [vaultAddress]);

  return { data, isLoading };
}

// ── Brain weight history (regime timeline) ─────────────────────────────────
const WEIGHT_HISTORY_QUERY = `
  query WeightHistory {
    weightSnapshots(orderBy: timestamp orderDirection: desc first: 20) {
      id lpYield staking lending hedge volatilityIndex apyDifferential timestamp txHash
    }
  }
`;

export function useWeightHistory() {
  const [data, setData] = useState<RebalanceEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    client.request<{ weightSnapshots: any[] }>(WEIGHT_HISTORY_QUERY)
      .then(res => {
        setData(res.weightSnapshots.map(s => ({
          id:              s.id,
          lpYield:         Number(s.lpYield),
          staking:         Number(s.staking),
          lending:         Number(s.lending),
          hedge:           Number(s.hedge),
          volatilityIndex: parseFloat(s.volatilityIndex) * 100,
          apyDifferential: parseFloat(s.apyDifferential) * 100,
          timestamp:       Number(s.timestamp),
          txHash:          s.txHash,
        })));
      })
      .catch(() => setData([]))
      .finally(() => setIsLoading(false));
  }, []);

  return { data, isLoading };
}

// ── Recent harvest events ──────────────────────────────────────────────────
const HARVEST_QUERY = `
  query RecentHarvests {
    harvestEvents(orderBy: timestamp orderDirection: desc first: 10) {
      id totalHarvested allocLPYield allocStaking allocLending allocHedge timestamp txHash
    }
  }
`;

export function useRecentHarvests() {
  const [data, setData] = useState<HarvestPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    client.request<{ harvestEvents: any[] }>(HARVEST_QUERY)
      .then(res => {
        setData(res.harvestEvents.map(h => ({
          id:             h.id,
          totalHarvested: parseFloat(h.totalHarvested),
          allocLPYield:   parseFloat(h.allocLPYield),
          allocStaking:   parseFloat(h.allocStaking),
          allocLending:   parseFloat(h.allocLending),
          allocHedge:     parseFloat(h.allocHedge),
          timestamp:      Number(h.timestamp),
          txHash:         h.txHash,
        })));
      })
      .catch(() => setData([]))
      .finally(() => setIsLoading(false));
  }, []);

  return { data, isLoading };
}
