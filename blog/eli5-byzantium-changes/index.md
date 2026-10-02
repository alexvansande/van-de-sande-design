---
title: "ELI5: Byzantium Changes"
date: "2017-09-14T15:07:33Z"
original: "https://www.reddit.com/r/ethereum/comments/702t95/"
original_site: "Reddit"
---

I'll attempt to explain the first [Metropolis hard fork changes](https://blog.ethereum.org/2017/09/14/geth-1-7-megara/) in a way I can understand them myself. Since I'm not a low level core dev, I hope this can be useful for others. I welcome any comments or corrections:

##### EIP 98: Removal of intermediate state roots from receipts (#14750).

This allows more parallelization on transaction processing, as not all transactions require the result of the previous one.

##### Expanded by EIP 658: Embedding transaction return data in receipts (#15014).

This allows light clients to be able to see if a call they made was executed properly or if it failed. This could only be verified by full nodes previously.

##### EIP 100: Change difficulty adjustment to target mean block time including uncles (#14733).

In bitcoin, only miners who found a block and sucessfully added it to the main chain received block rewards. This leads some ineffiency and some miner centralization as miners who were physically close had an advantadge and wasted work so Ethereum created the uncle reward, in which if you found a correct block but it lost the race to reach all other miners, you would still get paid. But this led to an error in which the total issuance was slightly higher than the expected 5 ether per block in an unpredictable way: during moments where internet connectivity lagged or the network was too busy, more uncles would mean more ether was created. This EIP fixes that.

##### EIP 198, EIP 212 (197) and EIP 213 (196): Precompiled contracts for modular exponentiation; elliptic curve addition, scalar multiplication and pairing (#14959, #14993).

Adds some cryptographic primitives that enable some new use cases, mostly around zk-snarks. This indirectly enables new novel uses, including higher privacy, scalability and other stuff people will come up with.

##### EIP 214 (116): Expanding the EVM with static contract calls (#14978).

Whenever a contract calls another contract in the middle of their function, that contract takes priority and can then do anything it wants, including calling the original contract back. This creates some complicated situations that makes writing smart contract more complex as there are tons of ways in which your contract state might have changed after that call in which you can't predict (The Dao bug, for instance). This creates a safer way to call an unknown contract from inside your contract.

##### EIP 211: Expanding the EVM with dynamically sized return data (#14981).

**explanation from /u/izqui9** At the moment when you make a call to another contract you must specify how many bytes of return data will be copied. EIP 211 introduces two new opcodes RETURNDATASIZE and RETURNDATACOPY. After making a call you can check how many bytes the call returned and then copy exactly that many bytes. This is specially exciting as it will enable Forwarding contracts to return exactly what the underlying call returned. Right now Forwarding contracts rely on hardcoding how much memory they will read from the call, but this is not a good solution for dynamic sized types such as strings or bytes array that can have an arbitrary size.

##### EIP 206 (140): Expanding the EVM with cheap state revertals (#14983).

In almost any contract you usually want to check multiple situations that would prevent a transaction from being executed: maybe the caller is not authorized to do that transaction (not the owner!) or maybe the contract is not yet on a state in which it can do that (crowdsale has not started) or some other limit (participation cap is reached!). When that happens you want all execution to stop and no state to change so you execute a `throw` function. The issue is that is an expensive call: it burns all the gas sent and doesn't provide the user any way to tell the reason it failed. This introduces a better way to do it: by using revert instead of throw, you only spend the gas the user actually used, and it provides a useful error code telling the user _why_ their transaction failed. Super useful for app development!

##### EIP 649: Delaying the difficulty bomb and reducing the block reward (#15028).

Self explanatory: delays the iceage by 18 extra months and reduces block reward to 3 ether in preparation for future PoS reduction.

##### EIP 684: Preventing overwriting contracts (Byzantium prep) (#15039).

Byzantium will change the way in which contract addresses are created. This prepares to prevent collisions, by preventing contracts from being deployed where there's another one existing.
