# AsterCircuit

**Self-Driving Yield Engine for BNB Chain**

> Autonomous, non-custodial yield optimization protocol leveraging AsterDEX Earn and PancakeSwap V2

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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
