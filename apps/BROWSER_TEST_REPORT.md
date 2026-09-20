# Browser test report

Current browser evidence is maintained in `VALIDATION_REPORT.md` and `/home/ls-jl/apps/validation`.

The latest run used three isolated Windows Chrome contexts through Playwright/CDP against `http://172.18.115.27:3000`. It passed teacher, student and parent credentials login, real class loading, empty quiz authoring, class-file listing, factual analytics, explicit AI-unconfigured state, absence of preset quiz content, light-UI enabled-button contrast checks and real/empty parent KPI rendering with zero page or console errors.

The repeatable script is `/home/ls-jl/apps/apps/web/scripts/browser-smoke.mjs`.
