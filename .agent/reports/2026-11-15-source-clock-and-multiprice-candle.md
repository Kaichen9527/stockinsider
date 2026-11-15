# Public source cross-check and a real multi-price candle

## Source evidence

The readonly Gmail check on Taipei Nov 15 found no new messages from the InvestAnchors domain at the time of the check. The evidence excludes account and message identifiers. This confirms one check in the current chat. The recurring mail-to-article connector still needs its own acceptance.

The EP714 creator-hosted media and Apple episode clock agree on Nov 14. Apple lists transcript languages and omits Mandarin in the current supported list, and the official episode web page supplies episode notes and a player. The automated workflow still needs authorized time-coded content or permission to transcribe the original audio. An index, generic episode summary, or partial audio range does not satisfy T05. [Official episode](https://podcasts.apple.com/tw/podcast/ep714/id1500839292?i=1000801859237) [Apple transcript support](https://podcasters.apple.com/zh-tw/support/5316-transcripts-on-apple-podcasts) [SoundOn terms](https://www.soundon.fm/terms/)

Financial Dog article 18020 identifies 2308 in its text and discusses power demand, revenue and short-term trading. The original company release predates the article, so preserve Nov 9 as the issuer disclosure day and Nov 10 as the article day. The exact article publication clock was not displayed. [Article 18020](https://statementdog.com/news/18020) [Issuer release](https://www.deltaww.com/en-US/press/41233)

Article 18045 gives an unambiguous primary subject 2467. The body pairs 東捷 with 8046 while the article's related-stock link shows 8064. Official TWSE data identifies 8046 as 南電, and the TPEx issuer page identifies 8064 as 東捷. Preserve that disagreement as an unresolved secondary mention so no unrelated security is admitted. [Article 18045](https://statementdog.com/news/18045) [TWSE observation](https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20261101&stockNo=8046&response=json) [TPEx issuer identity](https://ic.tpex.org.tw/company_basic.php?stk_code=8064)

The website's terms require prior written permission for automated access. The next action is to confirm written scope for automated access, internal extraction and public short summaries or links. News, research and podcast coverage are independent. No automated site connector was enabled and the evidence stores no publisher body, transcript or raw audio. [Terms](https://statementdog.com/law/tos) [Publisher contact](https://statementdog.com/contact)

## Waiting-condition candidate

The official Nov 10 session for 2308 opened and closed at its session high, but its official low was below that high. Even if a source describes a limit-up, this is a conclusive negative for trading at one price throughout the session. A flat candle without an exchange upper-limit receipt remains unknown. A current receipt that claims a lock while a verified candle contradicts it remains unresolved in the TypeScript path.

The patch applies the verified multi-price negative in the existing TypeScript and selected-score SQL paths. It preserves the full-score gate, fixed-breakout wait, and publication path. No assumed previous-close multiplier or independent positive price-limit authority is added. The capture clock is Nov 15, so replay at the Nov 10 publication cutoff may not use the later capture.

The non-root Node 22.23.1 staging run passed 18 existing pattern tests and six focused cases using the real candle and counterfactual controls. The native overlay was outside this probe and its stub fails if reached. PostgreSQL 17.11 used the original and patched selected-score functions with the real candle and synthetic dependency rows. Known multi-price false, flat unknown, cutoff rejection, unchanged score and unchanged entry eligibility passed. The patch passed the exact Git-blob apply check. The isolated PostgreSQL probe never opened a production socket.

## Reproduce

Apply the patch at the pinned continuation commit. Use the original pattern module dependencies with the focused Node probe and inject a one-row JSON record from the specified official endpoint with the actual capture time. The probe consumes the current bar and its capture digest. For the SQL template, replace the two function placeholders with the selected-score routine before and after applying the patch, renaming the baseline routine to `fixture_original_selected_score`. Populate the exact real high and low fields and the observed timestamp from the same capture. All other authority inputs in the selected-score probe are synthetic. Existing full release acceptance remains pending.
