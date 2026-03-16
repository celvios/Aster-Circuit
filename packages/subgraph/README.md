# APEX Subgraph

Indexes the APEX Autonomous Yield Engine on BNB Chain using The Graph Protocol.

## Entities

| Entity | Purpose |
|---|---|
| `APEXVault` | Live TVL, pricePerShare, blendedAPY |
| `User` | Individual position, PnL, fee history |
| `Deposit` | Per-tx deposit record |
| `Withdrawal` | Per-tx withdrawal with exit fee breakdown |
| `WeightSnapshot` | Brain regime change history |
| `HarvestEvent` | Compounder harvest cycles + per-strategy realloc |
| `DailySnapshot` | Daily TVL/APY aggregate for charting |
| `Protocol` | Cumulative protocol stats |

## Setup

```bash
cd packages/subgraph
npm install
graph auth --studio <your-deploy-key>
```

## After Deployment (update addresses in subgraph.yaml)

```bash
# 1. Update addresses in subgraph.yaml
#    APEXVault   → deployed vault address
#    APEXBrain   → deployed brain address
#    APEXCompounder → deployed compounder address
#    startBlock  → deployment block number

# 2. Generate types
npm run codegen

# 3. Build
npm run build

# 4. Deploy to Graph Studio
npm run deploy:studio
```

## Key Queries

See [`queries/examples.graphql`](./queries/examples.graphql) for all frontend queries.

### Quick Start — Protocol Stats
```graphql
{
  protocol(id: "apex") {
    totalDepositVolume
    totalHarvestedAllTime
    uniqueUsers
  }
  apexVaults {
    totalAssets
    pricePerShare
    blendedAPY
  }
}
```

## Notes

- `DailySnapshot.id` format: `{vaultAddress}-{unixDay}` where unixDay = `timestamp / 86400`
- `WeightSnapshot.vault` stores the **Brain address** (use the vault's `brain` field to join)
- All `BigDecimal` values are in 18-decimal WBNB units (`value / 1e18`)
- APY values are stored in **bps** e.g. `1200` = 12.00%
