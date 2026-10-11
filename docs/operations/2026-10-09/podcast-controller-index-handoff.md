# Exact public Podcast index grant

Base d55313fc8507e4d15cc55a7f3c2d2c07fc473b1d. Independent bounded design review rejected changing the shared creator list because legacy collectors can follow transcript/chapters. Revised design was independently accepted before implementation.

Only the explicit research controller receives the exact publisher RSS06e16cf5 URL as metadata_index. The legacy creator list, authorizedPodcastRssAllowlist, content allowlist, audio/CDN/Apple grants and scheduling remain unchanged. Two new regression cases include same-origin transcripts/chapters and an audio enclosure; they require one index request, metadata_only, no body and zero inbox items. Existing tests and expectations remain unchanged.

Actual directory/RSS/HEAD metadata was independently reviewed at progress f57b49e. This code does not claim full episode analysis, a platform enabled in production, a new trading event, or protected approval. Actual ordinary HTTP capability and full combined VM validation remain separate.

Actual focused35/35 zero skip; TAP 9217bytes SHA256 c78f4d8be90878370a1a3c36372a9ce24aa042d96b93e4d001d2719761779103. Actual explicit Mac reader outcome and retained clocks/hash are in podcast-controller-index-live.json; it is not a VM or scheduled read. No DB submission.
