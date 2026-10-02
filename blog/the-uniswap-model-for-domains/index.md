---
title: "Have we considered using the Uniswap model for domains, based on length tranches?"
date: "2019-10-28T18:00:28Z"
original: "https://discuss.ens.domains/t/have-we-considered-using-the-uniswap-model-for-domains-based-on-length-tranches/1216"
original_site: "discuss.ens.domains"
---

It’s hard to know the “right” price for a domain, and I believe to find a fair pricing algorithm is a common trend here, but usually, the hardest part is figuring out the metric we want to optimize. One I have considered now while looking for domains:

**"What’s the chance that the name you’re looking for is already taken?"**

We can assume that the ability to find available domains should be a worthy goal. Of course, the problem is that the theoretical limit is infinite. But that’s not so in smaller lenght domains.

[Uniswap uses a rather straightforward formula:](https://medium.com/block-journal/uniswap-understanding-the-decentralised-ethereum-exchange-5ee5d7878996) _x \* y = k_.

Where _k_ is a constant and _x_ and _y_ are the variables. The interesting thing about the formula is that it’s an asymptote, in which the price tends to either infinite or almost zero, but never reaches either. How would this work for ENS?

**price of a domain \* number of domains of that same length = constant K**

This means that the very last domain will be infinitely expensive, the very first infinitely cheap, according to a curve we set. So for instance, there are 17,576 three-letter domain (In the english alphabet). Let’s suppose we set the K of this tranch at around 35,000 (2 \* 26 \* 26 \* 26). It would mean that:

If only 1000 three-letter names are registered (less than 10%), then each registration would cost about 2.1 ether.<br>
 If 7000 names are (about 50% occupancy) the price surges to 3.5 ether<br>
 The 10,000th name will cost 5 ether<br>
 If there are 15,000 names taken, then it would cost 17.5 ether<br>
 If 17k names were registered (almost 90%) then each new name costs 60 ether.

This could be applied to annual fees going forward, this way it encourages that there will always be a nice amount of names available for registration. Maybe by releasing a name, you get a portion of that amount, meaning that if the prices are going up, you have good reason to drop you unused names. There would be tranches for 3-6 letter names, and then we could use the 6 letter price for everything else since there are over 300 millions of them. This would also mean that for long domains (or non-english ones) prices would always be a small amount.

Would this make sense?
