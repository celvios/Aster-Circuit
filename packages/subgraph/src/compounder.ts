// ── compounder.ts ─────────────────────────────────────────────────────────────
// Handler for APEXCompounder Compounded event
// Entities updated: HarvestEvent, DailySnapshot, Protocol

import { Compounded } from "../generated/APEXCompounder/APEXCompounder";
import { HarvestEvent, DailySnapshot, Protocol } from "../generated/schema";
import { BigInt, BigDecimal } from "@graphprotocol/graph-ts";

const ZERO_BD    = BigDecimal.fromString("0");
const WAD_BD     = BigDecimal.fromString("1000000000000000000");
const PROTOCOL_ID = "apex";

function toDecimal(value: BigInt): BigDecimal {
  return value.toBigDecimal().div(WAD_BD);
}

function dayId(timestamp: BigInt): string {
  return (timestamp.toI64() / 86400).toString();
}

function loadOrCreateProtocol(): Protocol {
  let protocol = Protocol.load(PROTOCOL_ID);
  if (protocol == null) {
    protocol = new Protocol(PROTOCOL_ID);
    protocol.totalDepositVolume    = ZERO_BD;
    protocol.totalWithdrawVolume   = ZERO_BD;
    protocol.totalFeeVolume        = ZERO_BD;
    protocol.totalHarvestedAllTime = ZERO_BD;
    protocol.uniqueUsers           = BigInt.fromI32(0);
    protocol.txCount               = BigInt.fromI32(0);
    protocol.lastUpdateTimestamp   = BigInt.fromI32(0);
  }
  return protocol as Protocol;
}

export function handleCompounded(event: Compounded): void {
  let totalHarvested = toDecimal(event.params.totalHarvested);
  let reallocs       = event.params.reallocation; // uint256[4]

  // ── Save HarvestEvent (immutable) ────────────────────────────────────────────
  let harvestId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let harvest   = new HarvestEvent(harvestId);
  harvest.vault           = event.address; // compounder address used as key
  harvest.totalHarvested  = totalHarvested;
  harvest.allocLPYield    = toDecimal(reallocs[0]);
  harvest.allocStaking    = toDecimal(reallocs[1]);
  harvest.allocLending    = toDecimal(reallocs[2]);
  harvest.allocHedge      = toDecimal(reallocs[3]);
  harvest.blockNumber     = event.block.number;
  harvest.timestamp       = event.block.timestamp;
  harvest.txHash          = event.transaction.hash;
  harvest.save();

  // ── Update Protocol all-time harvest counter ─────────────────────────────────
  let protocol = loadOrCreateProtocol();
  protocol.totalHarvestedAllTime = protocol.totalHarvestedAllTime.plus(totalHarvested);
  protocol.lastUpdateTimestamp   = event.block.timestamp;
  protocol.save();

  // ── Update today's DailySnapshot totalHarvestedAllTime ───────────────────────
  let day    = dayId(event.block.timestamp);
  let snapId = event.address.toHexString() + "-" + day;
  let daily  = DailySnapshot.load(snapId);
  if (daily != null) {
    daily.totalHarvestedAllTime = protocol.totalHarvestedAllTime;
    daily.save();
  }
}
