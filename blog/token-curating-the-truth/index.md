---
title: "Token-Curating the Truth"
date: "2018-07-31T12:00:00Z"
original: "https://avsa.medium.com/token-curating-the-truth-6d699a71ef5a"
original_site: "Medium"
---

Not all original ideas are good. In fact, often _unoriginality_ is a better indication of a good idea. If multiple smart people have independently come up with similar solutions, thought it over and did not reject it outright, that might just one of the best filters for concepts. The glory of suceeding should never go to those who have ideas, but to those who sucessfully executed them, by grinding away at the practical problems, pivoting it in real world scenarios and turning it into a real thing that makes a small impact on other people’s lives. They are like farmers, who carefully tend to small fragile seeds, fight the pests and the elements until they become a real tree. Throwing ideas and walking away is like spitting an apple seed on a patch of wild and coming back later to find an apple tree. You can’t really claim any glory from that. So I’d like to spit some apple seeds now.

When I was introduced to [Preethi Kasireddy](https://twitter.com/iam_preethi)’s “TruStory” project by a [fellow acquaintance](https://twitter.com/ba_minuzzi), what caught my attention was how similar it was to something I’ve been brewing in my head for a while, after reading a lot about [Token Curated Registries](https://avsa.medium.com/@simondlr/tokens-2-0-curved-token-bonding-in-curation-markets-1764a2e0bee5). Preethi and I were trying to solve different problems—arguably she was worried about a much more important issue, on how to save the free press in the “post-truth” era—but we were working on very similar solutions. I started writing back an email giving feedback about the state of TruStory as she had shown me and soon I ended up writing my first “White Paper™”. I didn’t want to change what she was working on, just wanted to show a complete solution to a different problem that could help a few areas of her own project. We kept on talking multiple times and I agreed to have a formal position of advisor, which is something I’ve repeatedly turned down.

Preethi’s work has been flying under the radar, until she was able to [close a round of funding](https://techcrunch.com/2018/05/23/trustory-a-new-startup-just-raised-3-million-to-identify-ico-scams-before-they-happen/) without an ICO (much smaller amount than the exuberance of most ICOs) and got some positive press. And then, a few weeks later I started to see a lot of bad press from many in bitcoin twitter. So I’d like to talk about Token Curated Registries, Reddit, my paper, TruStory and my relationship with that project.

### Eternal Septembers

<figure>
<img src="01.png" width="3200" height="1190" alt="">
<figcaption><a href="https://docs.google.com/document/d/10JfZ-6TC48lDqhJh_lGqIBu5KgcuHHYwdd0vo1pD59Y/edit?usp=sharing"><strong>Read full paper here</strong></a></figcaption>
</figure>

I started my crypto career, met great friends, got a job, all thanks to Reddit, yet I can barely visit [r/ethereum](https://www.reddit.com/r/ethereum/) anymore. The community there has grown exponentially, which is great, but it has also been transformed in the process, a seemingly inevitable transition that befalls any community once the rate at which new users are added is faster than how they can accomodate and learn the old “culture” of the community. This is not unique to Reddit, but an overall phenomenon on the Internet ([and in other areas](https://en.wikipedia.org/wiki/European_colonization_of_the_Americas)) and it has a name: [**eternal september**](https://en.wikipedia.org/wiki/Eternal_September)**.**

This is usually managed by [heavy moderation](https://avsa.medium.com/@johnblocke/a-brief-and-incomplete-history-of-censorship-in-r-bitcoin-c85a290fe43), but it usually lends to concentration of power in the hands of moderators and stiffle free debate.

I believe it can be done better which is why I wrote the paper [**“The Eternal Septembers”**](https://docs.google.com/document/d/10JfZ-6TC48lDqhJh_lGqIBu5KgcuHHYwdd0vo1pD59Y/edit) which goes into more details but here’s a short version of it:

- Every community is created by a having a different “reputation token” that you need to own before you post about it
- Instead of moderators, any user can post a thread to a topic and stake a bit of their reputation on it. Others that “upvote” it are also staking their reputation that that content belongs on that community. If someone believes it doesn’t belong there, they can make a mod request by stake some reputation against it.
- After a given set of time, whichever side has more stake wins and the reputation tokens redistributed accordingly, and the content either remains or is removed
- The older and more active a user is, the more reputation of that token they have, but often these are not active, meaning that “voting” is actually a bet on “_how would the members of this original community vote on this issue_” meaning that the community amplifies it’s early culture and multiplies them to the new users
- Tokens are bonded to an inflationary base token, which dilutes away the value of inactive members and redistributes it to active users

There are some other interesting aspects on the paper, on how it scales by using a lot of off-chain betting, how it can force people to bond to some base values of “harmless content”, and how the tokens can create an actual value to holders by using a novel form of advertising called **“sponsored burning”**. For more details, [read the paper](https://docs.google.com/document/d/10JfZ-6TC48lDqhJh_lGqIBu5KgcuHHYwdd0vo1pD59Y/edit).

### TruStory

<figure>
<img src="02.png" width="3200" height="1347" alt="">
<figcaption><a href="https://www.trustory.io"><strong>TruStory website</strong></a></figcaption>
</figure>

I never did any work on Eternal September since sending it to Preethi and AFAIK nobody is (if you want to work on it, let me know). She is, instead, building something completely different and in a ways, more important. While the problem I started with was “my subreddit isn’t what it used to be”, hers is the Fake News™ issue, or “how can we prevent the most important network of free speech ever built to be used as vector of false stories that undermine the society that built it?”. When I met her, she had a lot of the basics of stake-voting and tokenizing reputation, but through our talks she started considering many elements of TCRs, bonded curves and off-chain disputes.

I am very passionate about the issue of the rapid proliferation of untrue but outrageous content on social networks: it’s a real problem affecting democracies everywhere, one that arises directly from values I deeply believe in (_that everyone in the world should have access to a global network for free speech_), yet the “solutions” currently proposed are methods I deeply dissaprove of (giving central authorities–be them private corporations or governments–tools to censor and control the flow of information). **In short: it’s an issue we created with the tools we built (a free Internet) and we need to solve them ourselves without risking fundamental freedoms or someone else will.**

After talking multiple times over the phone I decided to accept an invitation to be a technical advisor for TruStory. What that means is that I am in contact with the team and offer advice on how to deal with technical challenges, as well as voice my opinion about many issues. Which is sort of what I already do unofficially for many other teams. This does **not** mean I am aware of every decision made, audit their finances or every line of code, it does **not** mean that I endorse any sort of investment in the company or any token they might launch. I might be compensated in some form for my work (honestly I have no idea about values) so it only means that if it all goes bust, we’re doing this together. This also doesn’t mean that I will publicize the project: in fact I actually avoid talking about it online because of my connection to them, and this very post is an attempt to put that on the record.

I am a fan of the project and root for it, like I root for many other projects in the space. And while I avoid being “advisor” as much as I can, I do like giving advice to people who need it, so if you find me in a conference, feel free to tell me about your project.
