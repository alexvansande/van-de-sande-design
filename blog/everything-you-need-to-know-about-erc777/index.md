---
title: "Everything you need to know about ERC777, the new proposed token standard but were afraid to ask"
date: "2018-01-15T14:11:51Z"
original: "https://www.reddit.com/r/ethereum/comments/7qjw6x/"
original_site: "Reddit"
---

If you've been to ethereum for more than 5 minutes, you've heard the phrase ERC20, to refer to ethereum tokens. ERC stands for Ethereum Request for Comments and it's nothing more than a topic on the main Ethereum Improvement proposals GitHub, that help multiple main developers debate definitions of improvements, future forks and contract standards.

Contract standards are one of the most important thing in ethereum: the reason so many projects can issue a token that can be used in other wallets, or exchanged via decentralized exchanges or really used for anything else, is that they all use a set of same standards, basically a "balanceOf" call that tells you how many tokens you have and a "transfer" function that tells you to transfer these tokens from me to you.

Token standard has been one of the first proposed standards and were talked about and debated by multiple users until finally formally written down by /u/feindura/ which also implemented it in Ethereum Wallet, first wallet to adopt it.

What are the main issues with the current ERC20? Many. The first glaring one is how to transfer tokens to contracts. Because you can send tokens to any ethereum address, you can easily also send them to contracts which do not support them, locking them forever. Worse than that: even if the tokens can be manually moved, it's very hard to tell which tokens came from who, and try sending them back.

To solve that, the ERC20 used to have a **approve** function that would allow you to approve the transfer to a contract and then you needed to create a second transaction, letting the contract know you had approved it. This required two transactions, had multiple security issues and was not widely implemented.

Multiple token standard have been proposed since ERC20, to solve that famously ERC223 and the "aproveAndCall" standards. Others have been tried to augment the functionality of tokens by allowing off chain signing to transfer without needing ether, or private transfers that use zksnarks or ring signatures to add privacy to tokens. None had much momentum, but ERC777 seems to be getting it, because it implememts all in a more elegant way:

[ethereum/EIPs#777](https://github.com/ethereum/EIPs/issues/777)

##### Backwards compatible

Making your token ERC777 compatible will make it compatible with more important functions of ERC20 (and you can implement the rest and make it fully compatible)

##### Safer and simpler send to contract

Introduces a new transfer function that adds a third field called bytes where you can add any identifying information to the transfer and it automatically lets the receiving contract that the transfer occurred, so it can do something automatically

##### Sets decimals to default 18

This a controversial move: many people feel that it was a mistake to add custom decimals to ERC20. The idea being that its not very useful to add lower limits on the divisibly of your token (and it doesn't make sense to add more thann 18) and adding custom decimals make writing offline wallets like Trezor, harder. ERC777 doesn't remove the decimals, but defaults it to 18.

##### Adds Approved Operators

The idea is that you give a contract the right to move tokens in your behalf, which means that you can build contracts that enhance your token, independent of the token needing to implement it. Want to add anonymity? Authorize a mixer contract as an approved operator. Worried about backups? Add an emergency recovery service that can move all your tokens out if you lose your keys. People can improve your tokens, years after they were created. This allows the contract full access to the contracts, so any sort of limitation (like daily limits based on exchange rate) needs to be built in the token itself.

#### What else?

The standard is not finalized, and that's where you come in. Make your opinion known, what do you like or dislike about it? What would you want changed differently? Next time you meet someone building a new token, ask them about their opinion on this standard.
