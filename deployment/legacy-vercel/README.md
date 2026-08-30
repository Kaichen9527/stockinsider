# Legacy Vercel redirect

This directory is the entire production payload for the legacy Vercel project
`stockinsider-three` (`prj_1dlow0i7TwngAHfIT75OCU4VSp9e`). It owns the alias
`stockinsider-three-one.vercel.app` and must contain no cron jobs or data-writing
runtime.

Deploy it only after the canonical project `stockinsider`
(`prj_cYNVwaGMMbgAeCnw6UqbIrLvlKYC`) is healthy at
`https://stockinsider-three.vercel.app`. Vercel maps `permanent: true` to an HTTP
308 redirect. Observe redirect traffic and errors for seven days before deleting
the legacy project.
