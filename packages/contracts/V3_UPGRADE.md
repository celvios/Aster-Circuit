# V3 Upgrade Path (Future Enhancement)

## When upgrading to PancakeSwap V3:

### Required Changes:
1. **Dependencies:** Add `@pancakeswap/v3-core` and `@pancakeswap/v3-periphery`
2. **Interfaces:** Replace Router/Factory with V3 equivalents + NonfungiblePositionManager
3. **Position Management:** Convert from ERC20 LP tokens to ERC721 NFT positions
4. **Range Logic:** Implement tick-based price range selection
5. **Rebalancing:** Add out-of-range detection and position rebalancing
6. **IL Calculation:** Adjust for concentrated liquidity model

### V3 Contract Addresses (BNB Chain):
```
NonfungiblePositionManager: 0x46A15B0b27311cedF172AB29E4f4766fbE7F4364
SwapRouter: 0x1b81D678ffb9C0263b24A97847620C99d213eB14
Factory: 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865
```

### Estimated Effort:
- +500 LOC
- +1 week development time
- Requires tick math library integration
- More complex testing requirements

*For now, V2 provides a cleaner, more auditable implementation for the hackathon.*
