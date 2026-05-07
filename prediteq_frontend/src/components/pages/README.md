# Frontend Pages Map

This folder contains the top-level user-facing pages.

## Main business pages

- `DashboardPage.tsx` - main fleet view and machine summary
- `DiagnosticsPage.tsx` - advanced diagnosis for the selected machine
- `PlannerPage.tsx` - action planning and validation flow
- `MaintenancePage.tsx` - validated maintenance calendar
- `CostsPage.tsx` - budget impact and cost reading
- `AlertsPage.tsx` - alert center
- `SeuilsPage.tsx` - thresholds and notification rules
- `AdminPage.tsx` - account management and machine assignment

## Supporting pages

- `MachinesPage.tsx` - fleet inventory
- `GeoPage.tsx` - map and machine geography
- `RapportIAPage.tsx` - report generation
- `SimulatorPage.tsx` - demo simulator control
- `ExperimentPage.tsx` - ESP32 / experimental page

## Auth and access pages

- `LoginPage.tsx`
- `SignupPage.tsx`
- `PendingPage.tsx`
- `ForgotPasswordPage.tsx`
- `ResetPasswordPage.tsx`

## Best order to open for a jury

1. `DashboardPage.tsx`
2. `DiagnosticsPage.tsx`
3. `PlannerPage.tsx`
4. `MaintenancePage.tsx`
5. `CostsPage.tsx`
6. `AlertsPage.tsx`
