---
title: "Update on the White Hat attack"
date: "2016-06-21T23:21:53Z"
original: "https://www.reddit.com/r/ethereum/comments/4p7mhc/"
original_site: "Reddit"
---

I hope that I'll be able to write down a more complete blog post at some point, because the full story would make a fascinating read, but right now here's are the main points:

Since Friday I've been in contact with a group of very smart people with the intent on replicating the attack to avoid any more of the ether being bled. Let's call this group, collectively "Robin Hood". Everyone in this group acted as an individual and did not represent or received the endorsements of their employers.

Robin had been able to replicate the attack on the testnet but couldn't be sure it would work until it was tested. First it would require the group to successfully stalk and infiltrate multiple split proposals that were open.

After some initial setbacks the group was able to infiltrate all open split proposals and trying to identify the best one to execute.

The best candidate proposal ended up being [#78](http://etherscan.io/token/thedao-proposal/78) because it didn't have many stalkers and we had identified the curator. We control 3 of the 5 accounts that split with us, if you have any information on who are the other accounts, please contact us so we are able protect the funds.

The group was diverse in their opinions on the fork(s). Some are very strongly anti-any-fork, some are very strong pro-fork and everything in between. Despite our differences, we identified an imminent attack we worked together to prevent it. For that reason everyone was also reticent on doing the White Hat Attack as it could be bad for the recovery efforts on the past hacks. Also, even those in the group that supported the soft fork could agree that we had no idea how long it would take to implement and deploy one.

Today about 19h central european time Robin detected that there was a new attack going on. It was draining slowly, a few ether per round, but it had already amassed a few thousand dollars. It seemed to be someone testing the waters and seeing if it could drain more.

Having our hands forced, the group decided to go forwards with the attack. I donated 100k dao tokens to the process with the full knowledge that it could be burned in the process. The more tokens the Robin contract had, the faster it could syphon the ether to protect it. The attacker picked up the pace and other attackers joined in. Some of the most efficient hackers were able to do up to 30 recursions with up to 200 ether moved in each, so it became clear that if we didn't do anything the DAO would be drained before anything could have been done.

We contacted some "whales" who were happy to donate to the effort and we were able to secure about 6M DAO tokens. We made it clear to everyone that we were not sure they would be able to recover these tokens, but these generous friends were happy to contribute to the effort. Thanks to this we were able to outpace the attacker, doing 4,000 and then at up to 40,000 ether per round, totaling up30 rounds of recursions.

All these attacks [can be studied on the blockchain](http://etherscan.io/txsinternal?zero=true&a=0xbb9bc244d798123fde783fcc1c72d3bb8c189413&valid). This is the [child DAO of the Robin Hood attack](https://etherscan.io/address/0xb136707642a4ea12fb4bae820f03d2562ebff487).

These three child daos were the ones in which a concurrent attack drained ether: [84ef](http://etherscan.io/address/0x84ef4b2357079cd7a7c69fd7a37cd0609a679106), [f4c6](http://etherscan.io/address/0xf4c64518ea10f995918a454158c6b61407ea345c) and [aeeb](http://etherscan.io/address/0xaeeb8ff27288bdabc0fa5ebb731b6f409507516c). We know nothing about them and if any of these are parallel white hat attacks then this is the right time to come forward. If you happen to be the curator of any of these child daos, or happened to have split with them into one of them, please come forward as well do come forward as well as you can help with this effort. There might be others.

#### What now?

7.2M ethers from the DAO are now held in a child DAO and we hold the private keys of the curator. It's important to identify the other 2 - but the risk has been reduced from 20 thousand attackers down to only 2. As soon as that DAO matures, we will try to move all the funds in a refund contract, that will be much simpler than the DAO was. Of course we still need to be very careful with that code and to analyze it for any possible exploit.

If you own the addresses **0xb97ba16dfafa8fc5824c029f0653cc03a1796e99** or **0xe1e278e5e6bbe00b2a41d49b60853bf6791ab614** please come forward.

There is a lot of unaccounted ether, on the main attacker dao and other copycat attacks. If you are the curator in any of them, you might be very useful. If you are the hacker, then all I can say is we are coming for you. There are many [plans in place to attack the child daos and either block the funds or recover them](https://blog.slock.it/a-dao-counter-attack-613548408dd7).

#### What about forks?

I've made my opinion clear many times about my opposition to a hard fork that breaks code or balance immutability, so I don't think this is the place to discuss it.

The child daos are also vulnerable to the same kinds of attacks so it's important to identify everyone else on the same child dao as the main whitehat. There are very valid points for a limited, voluntary, temporary software upgrade in which miners will be able to prevent other attacks like this from happening, and they may be used to prevent further attacks on these child DAOs. We now hope we bought enough time to stay calm and rational about these.

#### What about what's left in the DAO?

There are still plans to retrieve the remainder of the DAO and I can't discuss it further. But most of the ether is now more secure and there are some interesting advantages on having some money left [which will allow the DAO itself to buy tokens into the bad splits and attack them to recover or block the ether](https://blog.slock.it/a-dao-counter-attack-613548408dd7#.sthdgppgx).
