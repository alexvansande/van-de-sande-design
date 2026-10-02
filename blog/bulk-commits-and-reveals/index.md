---
title: "Updates to ENS Controller. Should we do Bulk Commits/reveals?"
date: "2022-08-04T20:24:12Z"
original: "https://discuss.ens.domains/t/updates-to-ens-controller-should-we-do-bulk-commits-reveals/13941"
original_site: "discuss.ens.domains"
---

On the latest ENS Small Grants round, one of the winner was Alexnetto.eth work building a referral feature for the RegistrarController. The basic referral is implemented and during the process he even found some errors on the tests in the current ENS contracts GitHub. The goal is to enable third party wallet integrations or name registry apps that have a business model built in, thanks to the referral fees (a percent which is reduced from the fee and controlled by the DAO).

[You can read more about that progress here.](https://medium.com/blockful/referral-feature-added-to-ens-15c9635762b8)

I’d like to talk about the next steps in the improvements we are building.

You can read a [more detailed specification of the next features here](https://publicgoods.notion.site/ENS-Referral-Ask-15dd6dbad3bb48dca3507259a81964e6), but the main two goals are to make commits with payments and bulk commits. The latter is the one that might be more controversial.

**Commits With Payments** would mean that you would send the ether for paying your domain on the first transaction (commit) and not the second (reveal). This small change, together with referral fees and an optional tip, could mean that the registration app could execute the second transaction.

Meaning the process would change from **make one transaction, wait for confirmation, wait another minute, make reveal transaction, wait again** into **Make one transaction and wait**. If you come back in a few minutes and the process hasn’t been finished you could do the reveal yourself and save the tip. This adds the danger that your registry app might frontrun you, but (1) that can happen anyway with the current model as they can simply log your searches and (2) the old process will still be available if you don’t trust your frontend.

**Bulk Commits** are the more controversial feature that I think would be nice sharing here. This is mostly a gas saving feature: a lot of the cost of transactions is storing data, so this would enable a registry app to make multiple commits into one (magic of merkle trees).

This feature should also allow the bulk registration of lots of new names at once, which can have more controversial effects.

- **More efficient registrars:** the change of the commit+payment already allows the registration flow to become “user does one transaction then waits”. In this case, the user might not even need to do the first commit transaction, as a registrar app might be built in a way that they await for N names to be requested before doing them all at once in bulk. This could lead to cheaper still registrations (althought it concentrates powers on registrars)
- **Club impact:** New clubs (10k club, 24h club, Flags clubs) would be easier to register all at once, which might be both good as it allows the quick creation of a club, but it can remove the social and competitive aspect of it.
- **Domain squatting:** A squatter can bulk commit to thousands or tens of thousands of domains names at once. They are limited by the cost of the reveal, and because we expect that a lot of potentially squattable names have already been done so.
- **Frontrun danger:** a potential frontrunner bot could register all possible 10 letter combinations in a single merkle tree and then use that to frontrun any reveal transaction they see on the network. This would in practice negate the advantadge of a common commit.

I believe these dangers could be alleviated by limiting the size of the merkle tree and the duration of a commitment to 24h max. This would also make the reveal cheaper as the merkle proof needs less roots to prove.

So what the general community thinks? Are merkle tree based commits a good idea? They could enable massive gas savings and more quick registration of names in bulk, but is that something we want?
