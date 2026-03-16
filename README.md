# AsterCircuit

**Self-Driving Yield Engine for BNB Chain**

> Autonomous, non-custodial yield optimization protocol leveraging AsterDEX Earn and PancakeSwap V2

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🧠 Philosophy of Design

### 1. The "Swap-First" Architecture
Unlike traditional yield aggregators that mint operational tokens, AsterCircuit prioritizes **Swap-over-Mint** for entering the AsterDEX ecosystem.
- **Why?** Minting `asBNB` often incurs a deposit fee or requires complex interaction with the minter contract. Swapping for `asBNB` on the open market (PancakeSwap) often provides a better entry price due to market fluctuations, effectively acquiring the yield-bearing asset at a discount.
- **Mechanism:** The `CircuitVault` optimistically checks if buying `asBNB` via PancakeSwap yields more tokens than direct minting. This "arb-on-entry" ensures users start with an immediate advantage.

### 2. Resilient Compound Stacking (RCS)
The core risk of yield farming is **Impermanent Loss (IL)** wiping out APR gains. Traditional auto-compounders blindly dump yield back into the LP.
- **Our Approach:** We treat the LP position as a "volatile yield booster", not a permanent home for capital.
- **The Loop:**
    1.  **Base Layer:** 100% of principal sits in Single-Sided Yield (`asBNB`), protecting it from IL.
    2.  **Yield Layer:** Only the *harvested profit* from the Base Layer is exposed to risk. It is paired with borrowed capital to form LP tokens.
    3.  **Circuit Breaker:** If the LP position suffers IL > 5% (configurable), the protocol "Panic Exits" - breaking the LP, selling the volatile asset, and retreating entirely to the Base Layer until volatility subsides.

### 3. Permissionless "Heartbeat" Economy
Centralized keeper bots are a point of failure. AsterCircuit uses an incentivized `Heartbeat` contract.
- **Incentive:** Any user calling `beat()` gets paid a flat fee + % of pending yield.
- **Sustainability:** This cost is paid from the *profit* of the strategy, ensuring the protocol pays for its own maintenance without needing external funding or VC subsidies.

## 🎯 Overview

AsterCircuit implements the **Resilient Compound Stacking (RCS)** strategy - an intelligent yield engine that:
- Deposits capital into AsterDEX Earn as the foundation
- Automatically compounds yield into PancakeSwap LP positions
- Monitors impermanent loss and exits defensively when risk exceeds threshold
- Runs autonomously via permissionless, incentivized automation

## 🏗️ Architecture

```
User → CircuitVault (ERC-4626) → AsterDEX Earn → Yield
                                        ↓
                                  AsterStrategy
                                        ↓
                            PancakeSwap BNB-USDT LP
                                        ↓
                              Monitor IL & Rebalance
```

## 📦 Repository Structure

```
Yield/
├── packages/
│   ├── contracts/        # Smart contracts (Hardhat)
│   │   ├── contracts/
│   │   │   ├── core/     # Vault, Strategy, Heartbeat
│   │   │   ├── interfaces/
│   │   │   └── libraries/
│   │   ├── scripts/      # Deployment scripts
│   │   └── test/         # Contract tests
│   └── frontend/         # Next.js dashboard
└── README.md
```

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- npm or yarn

### Installation
```bash
# Install dependencies
npm install

# Compile contracts
cd packages/contracts
npx hardhat compile

# Run tests on BSC fork
npx hardhat test
```

## 🧪 Development Status

- ✅ Phase 1: Scaffold Complete
- 🔄 Phase 2A: Contracts Compiled
- ⏳ Phase 2B: Integration Testing
- ⏳ Phase 3: Frontend Dashboard
- ⏳ Phase 4: Final Testing & Demo

## 📄 License

MIT

## 🔗 Links

- [Implementation Plan](./implementation_plan.md)
- [BNB Chain Yield Hackathon](https://dorahacks.io/hackathon/bnb-yield)
