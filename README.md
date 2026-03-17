# APEX Protocol

> **Autonomous Protocol for Exponential Yield**  
> Built on BNB Chain · Riquid Hackathon 2026 · Based on AsterCircuit

---

## What is APEX?

APEX is a self-driving yield vault that autonomously allocates capital across four yield strategies on BNB Chain. An on-chain **Brain** reads market signals every block and rotates weights between strategies to maximise risk-adjusted returns — with zero manual intervention.

```
Deposit WBNB → Brain reads signals → Allocates across M1–M4 → Compounder harvests → PPS grows
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    APEXVault (ERC-4626)              │
│  Accepts WBNB, mints APEX-LP shares, manages PPS    │
└──────────────────────┬──────────────────────────────┘
                       │ syncs weights
          ┌────────────▼────────────┐
          │       APEXBrain         │
          │  Reads on-chain signals │
          │  (volatility, APY diff, │
          │   capital utilisation)  │
          │  → outputs weight vector│
          └────────────┬────────────┘
                       │ weight vector [w1, w2, w3, w4]
     ┌─────────────────┼─────────────────┐
     ▼                 ▼                 ▼                 ▼
  M1 LP Yield    M2 Staking      M3 Lending         M4 Hedge
  AsterDEX LP    asBNB           Venus               AsterDEX Pro
  10–18% APY     6–9% APY        4–7% APY            2–5% APY

          ┌────────────────────────┐
          │     APEXCompounder     │
          │  Permissionless harvest│
          │  Reinvests yield       │
          │  across M1–M4          │
          └────────────────────────┘
```

### Brain Regimes

| Regime | Trigger | M1 | M2 | M3 | M4 |
|---|---|---|---|---|---|
| High Volatility | `volatility > 5%` | 10% | 50% | 30% | 10% |
| APY Chase | `APY diff > 3%` | 40% | 25% | 10% | 25% |
| Idle Capital | `utilisation < 30%` | 20% | 30% | 40% | 10% |
| Balanced (default) | — | 25% | 35% | 20% | 20% |

---

## Repo Structure

```
packages/
├── contracts/          # Hardhat — Solidity contracts + tests
│   ├── contracts/
│   │   ├── core/       # APEXVault, APEXBrain, APEXCompounder
│   │   ├── strategies/ # LPYield, Staking, Lending, Hedge
│   │   ├── interfaces/ # IAPEXVault, IAPEXBrain, IAPEXStrategy
│   │   └── mocks/      # Test mocks
│   ├── test/
│   │   ├── unit/       # APEXBrain.test.ts, APEXVault.test.ts
│   │   └── integration/# fullCycle.test.ts (36/36 passing)
│   └── scripts/
│       ├── deploy-local.ts  # Local Hardhat deploy + .env.local.apex
│       └── deployAPEX.ts    # Testnet/mainnet deploy
│
├── subgraph/           # The Graph — AssemblyScript mappings
│   ├── schema.graphql  # 8 entities
│   ├── subgraph.yaml   # 3 data sources
│   ├── src/            # vault.ts, brain.ts, compounder.ts
│   └── queries/        # Example GraphQL queries
│
└── frontend/           # Next.js 16 dashboard
    ├── app/
    │   ├── page.tsx         # Landing page
    │   └── dashboard/       # APEX Mission Control
    ├── components/apex/     # VaultStats, Charts, DepositWidget...
    └── lib/                 # useVault, useBrain, useSubgraph hooks
```

---

## Quick Start (Local)

### Prerequisites
- Node.js 18+
- pnpm or npm

### 1. Install dependencies

```bash
npm install          # root
cd packages/contracts && npm install
cd packages/frontend  && npm install
```

### 2. Start local Hardhat node

```bash
cd packages/contracts
npx hardhat node
```

### 3. Deploy APEX contracts

```bash
# In a new terminal
npx hardhat run scripts/deploy-local.ts --network localhost
# → Writes packages/frontend/.env.local.apex with contract addresses
```

### 4. Configure frontend

```bash
# Copy generated addresses into .env.local
cp packages/frontend/.env.local.apex packages/frontend/.env.local
# Or manually merge the APEX_ variables into your existing .env.local
```

### 5. Start frontend

```bash
cd packages/frontend
npm run dev
# → http://localhost:3000
# → http://localhost:3000/dashboard
```

### 6. Connect MetaMask

- Network: `localhost`, Chain ID `31337`, RPC `http://127.0.0.1:8545`
- Import private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

---

## Testing

```bash
cd packages/contracts

# Unit tests
npx hardhat test test/unit/APEXBrain.test.ts
npx hardhat test test/unit/APEXVault.test.ts

# Full integration cycle
npx hardhat test test/integration/fullCycle.test.ts

# All (36/36 passing)
npx hardhat test
```

---

## Subgraph

```bash
cd packages/subgraph
npm install

# Authenticate
npx graph auth --studio <YOUR_DEPLOY_KEY>

# Build
npm run codegen && npm run build

# Deploy to The Graph Studio
npm run deploy
```

Once deployed, set `NEXT_PUBLIC_SUBGRAPH_URL` in `.env.local` and the charts will populate with real historical data.

---

## Contracts (Local Deploy Addresses)

After running `deploy-local.ts`, addresses are written to `.env.local.apex`. For testnet/mainnet deploy addresses, see the deployment notes after running `deployAPEX.ts`.

---

## Frontend Features

| Component | Description |
|---|---|
| **VaultStats** | Live TVL, blended APY, PPS, total harvested |
| **StrategyWeights** | Real-time M1–M4 donut chart from Brain |
| **APYChart / TVLChart / PPSChart** | 30-day historical charts from subgraph |
| **UserPosition** | Your shares, WBNB value, PnL |
| **DepositWidget** | Approve + deposit with previewDeposit |
| **WithdrawWidget** | Slider, fee breakdown, single-click redeem |
| **BrainControls** | Live weight bars, rebalance button |
| **CompounderControls** | Permissionless compound button |
| **RebalanceHistory** | Regime change table with BSCScan links |
| **HarvestFeed** | Recent compound cycle cards |

---

## Tech Stack

| Layer | Tech |
|---|---|
| Smart Contracts | Solidity ^0.8.20, Hardhat, OpenZeppelin |
| Indexing | The Graph Protocol (AssemblyScript) |
| Frontend | Next.js 16, Tailwind CSS 4, Recharts |
| Web3 | wagmi v2, viem, RainbowKit / Reown AppKit |
| Testing | Hardhat · ethers.js · Chai · TypeScript |

---

## License

MIT
