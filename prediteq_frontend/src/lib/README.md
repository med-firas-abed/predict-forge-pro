# Frontend Lib Map

This folder contains reusable helpers that are not page components and not React hooks.

## Files you will open often

- `runtimeDataRepository.ts` - central client-side data adapter for runtime entities
- `api.ts` - API request helper
- `authClient.ts` - auth-related frontend API calls
- `predictiveLive.ts` - prediction display helpers
- `rulDisplay.ts` - RUL wording / formatting helpers
- `componentInference.ts` - domain-specific component / fault wording
- `juryNarrative.ts` - jury-facing wording helpers
- `machinePresentation.ts` - machine labels and presentation helpers
- `alertsSummary.ts` - summary helpers for alerts

## Good mental model

If a page needs a shared formatting or interpretation rule, it should usually live here instead of being duplicated in the page component.
