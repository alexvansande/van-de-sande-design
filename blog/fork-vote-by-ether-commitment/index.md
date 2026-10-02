---
title: "Fork Vote by Ether commitment, version 2."
date: "2016-06-30T21:24:05Z"
original: "https://www.reddit.com/r/ethereum/comments/4qo3f9/"
original_site: "Reddit"
---

I'm making a second round at this vote by locking thing, basing on a lot of the feedback I received from the last time. If you missed, here's the gist of it:

- You vote by committing not to move your ether (or DAO tokens) for a given period of time IF a given fork is activated (or none is). The more ether you lock and the longer you are willing to hold it (last one is squared) the more weight your vote has.
- The fork which has the largest amount of people willing to lock is also, by definition, the one in which the least amount of people want to jump ship because they don't want to be involved in the project anymore and should be the more valuable chain long term, meaning miners and exchanges have the incentive to adopt it.

Since I last proposed this, I made some changes to it:

- Each vote is a separate contract, which can only be operated by it's owner, this reduces the risk of a bug that affects everyone.
- You can also vote with DAO tokens (since this is the reason we are debating it) - or actually any other coin. How these are calculated is a different manner but for simplicity sake we can make 100 DAO : 1 ether or whatever was the price at the end of the crowdsale.
- The maximum period is set at 3 months, which is a long time in this space. There is no minimum time to hold, but since the vote weight as (lock date - fork date)² anyone holding for less than a day will have their vote weight drastically reduced. The 3 month limit also limits the chances of there being another vote coming up before that.
- You can support any number of fork proposals, with different lock dates.
- The lock is only activated if there is a large support from miners. They can start the lock at any point and they also have the power to unlock everyone's coin if something comes up.

[Here's the source code](https://gist.github.com/alexvandesande/a1aae99267a79e82334b51f3e3448383)

#### Why?

I think pure coin votes are fundamentally unjust, as very few people have much larger power. I don't feel we should be building a system in which the wealthiest minority or an angry majority have unlimited power over everyone else's property and wealth - history has shown that neither of those create a nice society.

If we are going to open a precedent to decide on either to fork or not and which fork to choose, then we should at least try to make some system that can be built right now and makes some sort of sense.

PS. I am [also working on a mist Ðapp that will be pure coin vote](https://github.com/alexvandesande/stake-voice/blob/master/README.md) but I don't feel it's really good for such an important decision.
