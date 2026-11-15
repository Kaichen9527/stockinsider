# T10 Taipei schedule candidate

The candidate replaces the current research timer with one timer for 08:15 market background and 21:30 launch publication. It uses the current writer lock and the protected operator API. The preliminary service keeps both preparation steps and stops after the drain. The current scheduler installer is unchanged. The standalone package includes the new runner and hashes it in the release manifest.

The morning call accepts only the launch policy and a publication receipt for the current Taipei date. The evening runner requires the final drain to be research-ready for that date and checks the date once more before requesting the cycle. It sends no client cutoff. The server retains authority over the official trading date, the 21:30 cutoff and publication. The dedicated action checks the fresh launch flag on the server before any legacy research logic can run.

In an isolated Contabo staging test directory, Node.js 22.23.1 ran 12 schedule tests and seven package tests. Node parsed the modified TypeScript route. systemd 255 verified all three unit files and resolved both slots at their expected UTC time in July and November. The test environment had 25,307 MiB free disk and 4,010 MiB available memory. Only temporary files were used. No existing timer or service was changed, and no candidate timer was installed. The six independent close observation timers are scheduled for November 16–17.

App CI with the required Codex Cloud model and runtime, real morning and evening writes, weekly active reviews, approved postclose breadth and flow, and the release gates remain pending. This run did not use Apple's iCloud file or contact the production API.
