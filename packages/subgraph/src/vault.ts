// ── vault.ts ──────────────────────────────────────────────────────────────────
// Handlers for APEXVault ERC-4626 events
// Entities updated: APEXVault, User, Deposit, Withdrawal, DailySnapshot, Protocol

import {
  Deposit as DepositEvent,
  Withdraw as WithdrawEvent,
  Transfer,
  BrainUpdated,
  TreasuryUpdated,
  Synced,
} from "../generated/APEXVault/APEXVault";
import {
  APEXVault,
  User,
  Deposit,
  Withdrawal,
  DailySnapshot,
  Protocol,
} from "../generated/schema";
import { BigInt, BigDecimal, Bytes, Address } from "@graphprotocol/graph-ts";

// ── Constants ──────────────────────────────────────────────────────────────────
const ZERO_BD = BigDecimal.fromString("0");
const ONE_BD  = BigDecimal.fromString("1");
const BPS_BD  = BigDecimal.fromString("10000");
const WAD_BD  = BigDecimal.fromString("1000000000000000000"); // 1e18
const PROTOCOL_ID = "apex";
const ZERO_ADDR = Bytes.fromHexString("0x0000000000000000000000000000000000000000");

// ── Helpers ────────────────────────────────────────────────────────────────────
function toDecimal(value: BigInt): BigDecimal {
  return value.toBigDecimal().div(WAD_BD);
}

function dayId(timestamp: BigInt): string {
  return (timestamp.toI64() / 86400).toString();
}

function loadOrCreateVault(address: Bytes): APEXVault {
  let vault = APEXVault.load(address);
  if (vault == null) {
    vault = new APEXVault(address);
    vault.address       = address;
    vault.totalShares   = BigInt.fromI32(0);
    vault.totalAssets   = ZERO_BD;
    vault.pricePerShare = ONE_BD;
    vault.exitFeeBps    = 10;
    vault.paused        = false;
    vault.treasury      = ZERO_ADDR;
    vault.brain         = ZERO_ADDR;
    vault.compounder    = ZERO_ADDR;
    vault.strategies    = [];
    vault.blendedAPY    = ZERO_BD;
    vault.txCount       = BigInt.fromI32(0);
    vault.updatedAt     = BigInt.fromI32(0);
  }
  return vault as APEXVault;
}

function loadOrCreateUser(address: Bytes): User {
  let user = User.load(address);
  if (user == null) {
    user = new User(address);
    user.sharesBalance   = BigInt.fromI32(0);
    user.totalDeposited  = ZERO_BD;
    user.totalWithdrawn  = ZERO_BD;
    user.feePaid         = ZERO_BD;
    user.txCount         = BigInt.fromI32(0);
    user.firstDepositAt  = BigInt.fromI32(0);
    user.lastActivityAt  = BigInt.fromI32(0);
  }
  return user as User;
}

function loadOrCreateProtocol(): Protocol {
  let protocol = Protocol.load(PROTOCOL_ID);
  if (protocol == null) {
    protocol = new Protocol(PROTOCOL_ID);
    protocol.totalDepositVolume   = ZERO_BD;
    protocol.totalWithdrawVolume  = ZERO_BD;
    protocol.totalFeeVolume       = ZERO_BD;
    protocol.totalHarvestedAllTime = ZERO_BD;
    protocol.uniqueUsers          = BigInt.fromI32(0);
    protocol.txCount              = BigInt.fromI32(0);
    protocol.lastUpdateTimestamp  = BigInt.fromI32(0);
  }
  return protocol as Protocol;
}

function loadOrCreateDailySnapshot(vaultAddr: Bytes, timestamp: BigInt): DailySnapshot {
  let day   = dayId(timestamp);
  let snapId = vaultAddr.toHexString() + "-" + day;
  let snap  = DailySnapshot.load(snapId);
  if (snap == null) {
    let vault = loadOrCreateVault(vaultAddr);
    snap = new DailySnapshot(snapId);
    snap.vault                 = vaultAddr;
    snap.date                  = (timestamp.toI64() / 86400) as i32;
    snap.totalAssets           = vault.totalAssets;
    snap.pricePerShare         = vault.pricePerShare;
    snap.blendedAPY            = vault.blendedAPY;
    snap.dailyDepositVolume    = ZERO_BD;
    snap.dailyWithdrawVolume   = ZERO_BD;
    snap.dailyFeeVolume        = ZERO_BD;
    snap.dailyActiveUsers      = BigInt.fromI32(0);
    snap.totalHarvestedAllTime = ZERO_BD;
    snap.weightLPYield         = 2500;
    snap.weightStaking         = 3500;
    snap.weightLending         = 2000;
    snap.weightHedge           = 2000;
    snap.timestamp             = timestamp;
  }
  return snap as DailySnapshot;
}

// ── Event Handlers ─────────────────────────────────────────────────────────────

export function handleDeposit(event: DepositEvent): void {
  let vaultAddr = event.address;
  let vault     = loadOrCreateVault(vaultAddr);
  let user      = loadOrCreateUser(event.params.owner);
  let protocol  = loadOrCreateProtocol();

  let assetsDecimal = toDecimal(event.params.assets);
  let sharesDecimal = toDecimal(event.params.shares);

  // Update vault state
  vault.totalAssets   = vault.totalAssets.plus(assetsDecimal);
  vault.totalShares   = vault.totalShares.plus(event.params.shares);
  if (vault.totalShares.gt(BigInt.fromI32(0))) {
    vault.pricePerShare = vault.totalAssets.div(
      vault.totalShares.toBigDecimal().div(WAD_BD)
    );
  }
  vault.txCount   = vault.txCount.plus(BigInt.fromI32(1));
  vault.updatedAt = event.block.timestamp;

  // Update user
  let isNew = user.txCount.equals(BigInt.fromI32(0));
  if (isNew) {
    user.firstDepositAt = event.block.timestamp;
    protocol.uniqueUsers = protocol.uniqueUsers.plus(BigInt.fromI32(1));
  }
  user.sharesBalance  = user.sharesBalance.plus(event.params.shares);
  user.totalDeposited = user.totalDeposited.plus(assetsDecimal);
  user.txCount        = user.txCount.plus(BigInt.fromI32(1));
  user.lastActivityAt = event.block.timestamp;

  // Store deposit entity (immutable)
  let depositId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let deposit   = new Deposit(depositId);
  deposit.user                   = user.id;
  deposit.vault                  = vaultAddr;
  deposit.assets                 = assetsDecimal;
  deposit.shares                 = sharesDecimal;
  deposit.pricePerShareAtDeposit = vault.pricePerShare;
  deposit.blockNumber            = event.block.number;
  deposit.timestamp              = event.block.timestamp;
  deposit.txHash                 = event.transaction.hash;
  deposit.save();

  // Daily snapshot
  let snap = loadOrCreateDailySnapshot(vaultAddr, event.block.timestamp);
  snap.dailyDepositVolume = snap.dailyDepositVolume.plus(assetsDecimal);
  snap.dailyActiveUsers   = snap.dailyActiveUsers.plus(BigInt.fromI32(1));
  snap.totalAssets        = vault.totalAssets;
  snap.pricePerShare      = vault.pricePerShare;
  snap.save();

  // Protocol
  protocol.totalDepositVolume  = protocol.totalDepositVolume.plus(assetsDecimal);
  protocol.txCount             = protocol.txCount.plus(BigInt.fromI32(1));
  protocol.lastUpdateTimestamp = event.block.timestamp;

  vault.save();
  user.save();
  protocol.save();
}

export function handleWithdraw(event: WithdrawEvent): void {
  let vaultAddr    = event.address;
  let vault        = loadOrCreateVault(vaultAddr);
  let user         = loadOrCreateUser(event.params.owner);
  let protocol     = loadOrCreateProtocol();

  let assetsGross  = toDecimal(event.params.assets);
  let sharesBurned = toDecimal(event.params.shares);
  // Exit fee = 0.1% of gross
  let fee          = assetsGross.times(BigDecimal.fromString("10")).div(BPS_BD);
  let assetsNet    = assetsGross.minus(fee);

  // Update vault
  vault.totalAssets = vault.totalAssets.gt(assetsGross)
    ? vault.totalAssets.minus(assetsGross)
    : ZERO_BD;
  vault.totalShares = vault.totalShares.gt(event.params.shares)
    ? vault.totalShares.minus(event.params.shares)
    : BigInt.fromI32(0);
  if (vault.totalShares.gt(BigInt.fromI32(0))) {
    vault.pricePerShare = vault.totalAssets.div(
      vault.totalShares.toBigDecimal().div(WAD_BD)
    );
  }
  vault.txCount   = vault.txCount.plus(BigInt.fromI32(1));
  vault.updatedAt = event.block.timestamp;

  // Update user
  user.sharesBalance  = user.sharesBalance.gt(event.params.shares)
    ? user.sharesBalance.minus(event.params.shares)
    : BigInt.fromI32(0);
  user.totalWithdrawn = user.totalWithdrawn.plus(assetsNet);
  user.feePaid        = user.feePaid.plus(fee);
  user.txCount        = user.txCount.plus(BigInt.fromI32(1));
  user.lastActivityAt = event.block.timestamp;

  // Withdrawal entity
  let withdrawId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let withdrawal = new Withdrawal(withdrawId);
  withdrawal.user                      = user.id;
  withdrawal.vault                     = vaultAddr;
  withdrawal.shares                    = sharesBurned;
  withdrawal.assetsGross               = assetsGross;
  withdrawal.assetsNet                 = assetsNet;
  withdrawal.fee                       = fee;
  withdrawal.pricePerShareAtWithdrawal = vault.pricePerShare;
  withdrawal.blockNumber               = event.block.number;
  withdrawal.timestamp                 = event.block.timestamp;
  withdrawal.txHash                    = event.transaction.hash;
  withdrawal.save();

  // Daily snapshot
  let snap = loadOrCreateDailySnapshot(vaultAddr, event.block.timestamp);
  snap.dailyWithdrawVolume = snap.dailyWithdrawVolume.plus(assetsGross);
  snap.dailyFeeVolume      = snap.dailyFeeVolume.plus(fee);
  snap.totalAssets         = vault.totalAssets;
  snap.pricePerShare       = vault.pricePerShare;
  snap.save();

  // Protocol
  protocol.totalWithdrawVolume = protocol.totalWithdrawVolume.plus(assetsGross);
  protocol.totalFeeVolume      = protocol.totalFeeVolume.plus(fee);
  protocol.txCount             = protocol.txCount.plus(BigInt.fromI32(1));
  protocol.lastUpdateTimestamp = event.block.timestamp;

  vault.save();
  user.save();
  protocol.save();
}

// Track share transfers (catches mints/burns already covered above,
// but also peer-to-peer share transfers for accurate user positions)
export function handleTransfer(event: Transfer): void {
  // Skip mint (from = zero) and burn (to = zero) — handled by deposit/withdraw
  let zeroAddr = Address.fromString("0x0000000000000000000000000000000000000000");
  if (event.params.from.equals(zeroAddr) || event.params.to.equals(zeroAddr)) return;

  // Update sender shares
  let sender = loadOrCreateUser(event.params.from);
  sender.sharesBalance = sender.sharesBalance.gt(event.params.value)
    ? sender.sharesBalance.minus(event.params.value)
    : BigInt.fromI32(0);
  sender.lastActivityAt = event.block.timestamp;
  sender.save();

  // Update receiver shares
  let receiver = loadOrCreateUser(event.params.to);
  receiver.sharesBalance  = receiver.sharesBalance.plus(event.params.value);
  receiver.lastActivityAt = event.block.timestamp;
  receiver.save();
}

export function handleBrainUpdated(event: BrainUpdated): void {
  let vault = loadOrCreateVault(event.address);
  vault.brain = event.params.newBrain;
  vault.save();
}

export function handleTreasuryUpdated(event: TreasuryUpdated): void {
  let vault = loadOrCreateVault(event.address);
  vault.treasury = event.params.newTreasury;
  vault.save();
}

// Brain calls sync() after rebalancing — use to refresh totalAssets snapshot
export function handleSynced(event: Synced): void {
  let vault = loadOrCreateVault(event.address);
  vault.totalAssets = toDecimal(event.params.totalAssets);
  vault.updatedAt   = event.block.timestamp;
  vault.save();

  // Update today's snapshot totalAssets
  let snap = loadOrCreateDailySnapshot(event.address, event.block.timestamp);
  snap.totalAssets = vault.totalAssets;
  snap.save();
}
