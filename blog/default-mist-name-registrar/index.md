---
title: "ERC: Default Ethereum Name Registrar"
date: "2015-11-20T20:02:58Z"
original: "https://github.com/ethereum/EIPs/issues/26"
original_site: "GitHub"
---

### Abstract

An important aspect of making ethereum Ðapps easily accessible is a name registry that will connect a human readable name to a hash for usage in IPFS/SWARM or any DHT system.

The name registrar is not meant to be the one and only name registrar on ethereum but rather a default registrar to be used by Mist to resolve names. It will be an user configurable setting.

### Motivation

The goal of this contract is:

- To find the optimal price for names: create a strategy where the nash equilibrium for each player is to simply put down the maximum amount they are willing to pay for a name, and not create incentives for names to be overpaid
- To allow optimal usage of names: allow good names to circulate among those who want have better usages for it, while keeping smaller brands reasonably protected
- To make name markets as transparent as possible. Currently domain squatting is a very sneaky business that utilizes information asymmetry to sell names. This proposal, while still allows names to be sold or transferred outside this market, will create a last resort market where name prices are transparent and optimal
- Registering names should have an optimal cost, cheap enough to be inclusive, but not too much to allow excessive name squatting. This intends to describe the design and parts of the proposed system.
- Privacy by obscurity: give unpopular and niche domain holders a reasonable privacy expectation while making the most popular names evaluations transparent. Creating a spider that crawls all name markets is exponentially expensive.

### Specification

The system will consist of 4 main parts:

#### Hash Registrar

The registrar itself is the contract that stores the basic data. If more data is needed it can be stored in other contracts, using this one as the reference. It doesn't use the name directly to reference the registry but its data. Keeping the names as hashes instead of plaintext has two advantages: first it allows _privacy by obscurity_, meaning that if the name isn't known enough to be in a rainbow table then you can't really know who the information is about. Second, it allows a more general purpose and future proofing use of the contract, as it can be used to claim ownership on anything that can be translated into hash, like devices, files, texts and other uses we haven't thought about now.

```
function getAuction() constant returns (address auction)
function getElection() constant returns (address election)
function getCollector() constant returns (address collector)
function setCollector(address _newCollector) returns (bool success)
```

The registry is set at startup with the address of three other contracts, the **Collector contract**, **Election Contract** and **Auction contract**, that have special rights. Only the **Election contract** can change the collector. The others are unchangeable.

```
function getRegistry(bytes32 _hash) constant returns (address _owner, uint _renewalDate,  uint feesPaid, string _redirectAddress)
```

It uses a hash as an index and attributes these informations to it: an address that owns it; the expiration date of the registration; the amount of ether that the owner effectively paid to the registrar address as the process of renewal; a string which is the http, buzz or ipfs address of the app.

Other contracts might extend this functionality by simply creating a registry of extra information about a hash and then only allowing edits to it by checking this master contract for the owner address. For example, the wallet app might want to make a registry where a name is associated to an address (different from the owner), or if you want to have a secondary content hash for http links then a secondary contract could be deployed, only allowing edit access to the addresses on marked as `owner` on this contract.

```
function editRegistry(bytes32 _hash)
```

All the information on that hash can be edited by the owner of the address up to 48h before the renewal Date, and at that time the information is locked. After the expiration date, only the **Auction Contract** can change the owner of the hash.

```
function newRegistry(bytes32 _hash, string _redirectAddress, address _owner)
```

Only the **Auction Contract** can add new registries.

```
function ()
```

All funds given to the Registrar contract are redirected to the **Collector Contract**. These will not count towards the `feesPaid`.

```
function invalidateEntry(string _name)
```

The disadvantage of hashes as identifiers is that it literally allows anything, therefore making it impossible to create restrictions such as **"names shorter than 6 letters can only be registered after 2017"**. This could be avoided by creating validity rules that need to be reported and if true will delete the entry, but this would require all those rules to be set at the first setup. Another way to do it is to grant the **Collector Contract** power to invalidate entries, but this would open the possibility of an evil collector contract censoring entries. Another solution is simply to allow any entries, but simply enforce those rules on the client: mist could be programmed to look at other contracts for special names

I'm open to more elegant solutions.

#### Auction Contract

The auction contract is set at startup of the Hash registrar, but since they are separated it is possible to clone a copy of the registrar contract and just change these variables.

The purpose of the auction contract is to receive bids for hashes and select a winner.

```
function startBid(bytes32 _newHash)
```

If `_newHash` is not registered to anyone this will create a new register, owned by `0x000` with a renewal date exactly 7 days after this function was executed. This allows a short time in which a Vickrey Auction can decide who is the first owner of the name.

The cost of start a bid can be defined by the **collectorContract**, but otherwise is kept at free.

```
function putSealedBid(bytes32 _sealedBid)
```

A sealed bid is just a message with the hash of the bid and some ether. The amount of ether sent on this step is also recorded, as long as the time in which the bid was put. The amount of ether can and should be higher than the amount bid, to protect the privacy of the bid. For the same reason, the bidder doesn't need to be the future owner.

The **collectorContract**, might define a deposit value that needs to be added on top of the put, but if it doesn't implement it then it's free.

```
function revealBid(bytes32 _sealedBid, bytes32 _biddedHash, address _owner, uint _bidPrice, uint _duration, string _salt)
```

`_sealedBid` is the hash saved on \_sealedBid<br>
 `_biddedHash` is the hash that the bidder wants to own<br>
 `_owner` is the future owner of the hash, if the bid is successful. The bidder and the owner need not to be the same person<br>
 `_bidPrice` is the maximum price the bidder is willing to pay for it<br>
 `_duration` is the length of time (in days) the owner wants to renew it for. Must be longer than 180 and smaller than 3660. If this is the first time this hash is being bidder on then the \_duration cannot be longer than 366, if it has been registered before then the \_duration cannot be longer than twice the length of time that has passed since it was first registered, as to avoid very long registrations during the first years.

`_salt` is just a random string to prevent deanonimization of sealed bids by brute force

This action can be done by anyone. If the \_sealedBid doesn't match the hash of all other parameters put together then the bid is not revealed, otherwise it's saved on the revealed bids. **Collection contract**.

Once a bid is revealed, the proposed setup is a closed bid Vickrey auction, where the highest bidder becomes the owner but only pays the second highest bid:

- If the new prospective owner is not the current owner then his `bidPrice` will be the parameter on `_bidPrice`. If the owner is bidding to renew the name then his bid will be calculated as `_bidPrice` \* `K`/ `_duration`. In practice this means that the owner is appraising his own name at that price and is putting down a _Fee_ that is a percentage of the total appraised value of his name, proportional to the renewal period. That percentage is the same for all names and is decided by the _Collector Contract_
- If the expiration date is on the past, then the bid is deleted and the funds sent to it are sent to the **Collector Contract**
- Else if the duration is outside the bounds of minimum and maximum durations OR if the ether amount sent during the sealed bid isn't enough to cover his price and fees OR if the sealed bid has been sent less than 48h before the renewal period then the bid is considered **invalid**, it is deleted and the ether amount sent back to the bidder.
- If the `bidPrice` it's the highest yet then it should be saved as such and the price to be paid should be set at the asking price of the previous highest bid (or 0 if there are none). The second highest bid should be deleted and its ether sent back to its bidder. If the bid new owner is not the current owner, K is 1, otherwise (if it's the owner renewing the ownership) then K is a factor set by the **Collector Contract**.
- Else if the bid is lower than the highest bid but bigger than the price to be paid of the highest bid, then the price to be paid is set at the this bid asking price. This bid is deleted and its ether sent back to its bidder.

_Should a bid be considered invalid if it's revealed earlier than 48h of the renewal date?_

Bids revealed too early might affect the game strategy and will influence the price to be paid. In the other hand a deleted bid might mean that someone will lose his property without the correct asking price. Since losing a domain name is harsher than someone overpaying for it, then I suggest that there should not be an obligatory reveal period, only a suggested 24h window.

The collector contract can set a function that will determine a fee to be paid by the bidders, but otherwise it will default to free.

```
function revealBid(bytes32 _sealedBid, bytes32 _biddedHash, address _owner, uint _bidPrice, uint _duration, string _salt)
```

A bid can only be removed by the original owner and only earlier than 48 hours before the renewal date.

```
function finalizeAuction(bytes32 _biddedHash)
```

This action can be only executed after the renewalDate has passed. Anyone can call it, so it could be scheduled with the alarm clock.

If owner has not changed, then an amount of ether equivalent to `_bidPrice`/ `_duration` \* `K` will be sent to the **Collectors Contract** and the remaining amount will be sent back to the original bidder. The amount paid will be registered at `feesPaid`. The renewal date will be set at the last renewal data + `_duration`.

If the owner has changed then amount of `priceToBePaid` will be sent to the previous owner, and a fee calculated by `priceToBePaid` \* `K` / `_duration` will be sent to the collectors contract and registered as `feesPaid`. Otherwise a user could keep a name indefinitely by simply selling it to itself. The renewal date will be set at the last renewal data + `_duration`.

```
function cleanOldBids()
```

Deletes any unsealed bids that are older than the maximum duration time that any name can accept and forwards the ether to the Collector.

#### Collector contract

The Collector Address is an address that receives all the funds collected in auctions and has a special right to change the `K` factor. The purpose of the name registry auction is not to make a profit but to allow the optimal distribution of names, to prevent name squatting while still allowing cheap and easy access to registering a name. The cost of the renewal is given by the market price of the total price, divided by K. If K is too low it might allow name squatting, but if it's too high it can make keeping names too expensive.

The collector contract can also define fees related to bidding, in order to fight spam. The collector contract can determine which rules are broken in order to consider a registry invalid (short names could only be registered after a few years, etc)

How exactly the Collector contract changes the K factor or spends its funds is not defined here, as the contract itself is a changeable parameter elected by the **Election Contract**.

My proposal is that the first Collector contract be just a _"Boomerang contract"_, a contract that simply keeps all ether sent to it and then send them back after 1 year. This will allow the funds to be safely kept for a period while the community build tools and DAOs for the collector contract for the first election. Since they can always elect the 0x address, then if the community wants to do so they can still vote to burn all the ether collected during the first year.

#### Election Contract

The election contract has the special right to change the collector address. The exact workings of the election, as well as their frequency is not yet defined here and is open to discussions.

One important issue is that it's impossible to tell which are the entities behind each name, if they coordinate with each other or if they are owned by other entities, therefore the concept of anti-sybil (and to a point anti-coercion) mechanisms does not really apply here. Also, the job of the Collector Contract is basically to define the use of it's own funds and how to raise or lower the "tax rate" on new names, therefore it's only natural that the weights of the votes should be based barely on the amount of funds each name has sent to the contract during their last renewing period.

A user that bought four names four 1 ether each and a user that bought a single name for 4 ethers have contributed the same amount to the collector contract and therefore should have the same right to decide how the funds are spent. If the system favours the former (like quadratic voting does) will stimulate users to buy tons of small names they are not going to use, a system that favours the latter will stimulate users to double bid on their own names to pay higher taxes and therefore get more voting power. Both will would be contrary to the whole purpose of the name registrar.

The suggested voting mechanism is a mix of [approved voting](https://en.wikipedia.org/wiki/Approval_voting) with Liquid democracy, as follows:

```
function setDelegate(string32 _ownedHash, address _delegate)
```

Instead of voting directly, a voter instead can decide to appoint a delegate. The contract verifies that the `msg.sender` is the owner of the `_ownedHash` and then moves his voter weight ('feesPaid') to the new `_delegate`

```
function unsetDelegate(string32 _ownedHash)
```

The voter removes his vote to his delegate and states that wants to vote himself.

```
function setVote(address[] approvedCandidates)
```

The voter selects an array of contracts he approves for the job of **Collector Contract**. These remain static and can be changed anytime. If you

```
function tallyVotes()
```

Instead of a fixed election cycle, votes can be counted at anytime if someone feels voter's preference have changed enough. The cost of counting the votes is paid by the function caller. First the function will calculate the voter's weight by the sum of his 'feesPaid' and the weight of all voters that delegate their vote into him. Votes can be delegated forward a finite number of time (3, 5 or 7, depending on gas costs).

Then all addresses the voter approved will be receive an equal number of votes as his weight. The Address with a higher number of approvals will be selected as the new **Collector Contract**, effectively immediately.

##### Acknowledgements

People who contributed to this proposal, in no particular order: [@nagydani](https://github.com/nagydani) & [@zelig](https://github.com/zelig) (with their research for the swarm name registrar), [@vbuterin](https://github.com/vbuterin) (for insights in elections), [@gavofyork](https://github.com/gavofyork) (who designed the [first name registrar](https://github.com/alexvandesande/dapp-bin/tree/master/registrar) ), [@yann300](https://github.com/yann300) and [@arkpar](https://github.com/arkpar) (who implemented the current name registrar), [@pipermerriam](https://github.com/pipermerriam) & [@nmushegian](https://github.com/nmushegian) (for their great insights at DevCon1) and @ryepdx (that is implementing the maker registry) and [@danielnovy](https://github.com/danielnovy) (auctions Ðapp at consensys)
