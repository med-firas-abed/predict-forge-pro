# prediteq_api/routers

Each file here exposes one API surface.

## Route map

- `health.py` - health checks and public metrics
- `auth.py` - signup, login-related backend logic, admin user management
- `machines.py` - machine list and machine-level runtime data
- `diagnostics_rul.py` - calibrated prognosis payloads
- `simulator.py` - demo replay and demo machine bootstrapping
- `seuils.py` - thresholds, recipients and notification rules
- `alerts.py` - alert center data
- `planner.py` - AI planning and action proposals
- `report.py` - report generation endpoints
- `chat.py` - assistant / copilot features
- `runtime_data.py` - aggregated runtime data used by the UI
- `mqtt.py` - live broker connection
- `explain.py` - explanation endpoints

## Best order to open

1. `machines.py`
2. `diagnostics_rul.py`
3. `simulator.py`
4. `seuils.py`
5. `planner.py`
6. `report.py`
