// ── brain.ts ──────────────────────────────────────────────────────────────────
// Handler for APEXBrain WeightsUpdated event
// Entities updated: WeightSnapshot, APEXVault, DailySnapshot

import { WeightsUpdated } from "../generated/APEXBrain/APEXBrain";
import { WeightSnapshot, APEXVault, DailySnapshot } from "../generated/schema";
import { BigInt, BigDecimal } from "@graphprotocol/graph-ts";

const ZERO_BD = BigDecimal.fromString("0");
const WAD_BD  = BigDecimal.fromString("1000000000000000000");
const BPS_BD  = BigDecimal.fromString("10000");

function toDecimal(value: BigInt): BigDecimal {
  return value.toBigDecimal().div(WAD_BD);
}

function dayId(timestamp: BigInt): string {
  return (timestamp.toI64() / 86400).toString();
}

export function handleWeightsUpdated(event: WeightsUpdated): void {
  let newWeights  = event.params.newWeights;
  let signals     = event.params.signals;

  // ── Persist the WeightSnapshot (immutable — one per rebalance tx) ───────────
  let snapId   = event.transaction.hash.concatI32(event.logIndex.toI32());
  let snapshot = new WeightSnapshot(snapId);

  // Note: We don't have the vault address directly from this event.
  // We use the brain's address as a proxy key; the frontend joins via brain field on vault.
  // In production, Brain emits vault address or we read it from the contract.
  snapshot.vault              = event.address; // brain address — handler for vault join in frontend
  snapshot.lpYield            = newWeights.lpYield.toI32();
  snapshot.staking            = newWeights.staking.toI32();
  snapshot.lending            = newWeights.lending.toI32();
  snapshot.hedge              = newWeights.hedge.toI32();
  snapshot.apyDifferential    = signals.apyDifferential.toBigDecimal().div(BPS_BD);
  snapshot.volatilityIndex    = signals.volatilityIndex.toBigDecimal().div(BPS_BD);
  snapshot.capitalUtilization = signals.capitalUtilization.toBigDecimal().div(BPS_BD);
  snapshot.blockNumber        = event.block.number;
  snapshot.timestamp          = event.block.timestamp;
  snapshot.txHash             = event.transaction.hash;
  snapshot.save();

  // ── Update today's DailySnapshot with end-of-rebalance weights ──────────────
  // We look up DailySnapshot by address (brain owns the rebalance lifecycle)
  let day    = dayId(event.block.timestamp);
  let snapId2 = event.address.toHexString() + "-" + day;
  let daily  = DailySnapshot.load(snapId2);
  if (daily != null) {
    daily.weightLPYield = newWeights.lpYield.toI32();
    daily.weightStaking = newWeights.staking.toI32();
    daily.weightLending = newWeights.lending.toI32();
    daily.weightHedge   = newWeights.hedge.toI32();
    daily.save();
  }
}
