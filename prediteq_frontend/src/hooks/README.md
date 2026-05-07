# Frontend Hooks Map

Hooks are the bridge between page components and runtime data.

## Most important hooks

- `useMachines.ts` - main fleet and selected-machine state
- `useDiagnostics.ts` - advanced diagnosis payloads
- `useFleetPredictiveInsights.ts` - fleet-level prediction summaries for planner, costs and alerts
- `useMachineSensors.ts` - recent sensor series
- `useSimulatorController.ts` - simulator controls and status
- `useAlertes.ts` - alert center data
- `useAlertEmailHistory.ts` - email history used by alert/admin surfaces
- `useGmaoTaches.ts` - validated maintenance tasks
- `useCouts.ts` - cost data

## Good mental model

Page components should stay readable because most data work should already be isolated in these hooks.
