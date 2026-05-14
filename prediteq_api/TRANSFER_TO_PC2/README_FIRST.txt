PC2 / boss-PC transfer kit for PrediTeq MQTT

What this folder is:
- a small safe bundle to copy to the second PC
- only the sender files needed for rehearsal or boss-PC CSV sending
- it does NOT include prediteq_api/.env or backend secrets

What to copy to PC2:
- this whole TRANSFER_TO_PC2 folder only

Three ways to use this folder:

1. Easiest fake MQTT test

   powershell -ExecutionPolicy Bypass -File .\RUN_FAKE_MQTT_TEST.ps1

2. Best rehearsal before meeting the boss
   This uses CSV mode, not mock mode, so it feels like the future LabVIEW path.

   powershell -ExecutionPolicy Bypass -File .\RUN_BOSS_PC_CSV_REHEARSAL.ps1

3. Real boss-PC CSV mode
   First check the CSV:

   powershell -ExecutionPolicy Bypass -File .\CHECK_PREDITEQ_CSV.ps1 -CsvPath "C:\path\labview_output.csv"

   Then send it:

   powershell -ExecutionPolicy Bypass -File .\RUN_BOSS_PC_REAL_CSV.ps1 -CsvPath "C:\path\labview_output.csv"

What the scripts do:
- checks that Python exists
- installs the 2 sender packages
- writes scripts/.env.bridge with the right mode
- can start sending fake MQTT data for machine ARO-01
- can check a real CSV before sending it
- can rehearse a fake LabVIEW CSV written locally
- can send a real CSV file in csv-last-row mode

Important:
- the fake test and CSV rehearsal use the public EMQX test broker
- use fake data only on the public broker
- keep the real PrediTeq backend and frontend running on PC1
- preferred CSV header is already included in:
  PREFERRED_LABVIEW_CSV_TEMPLATE.csv

If you want to change the machine code later:
- edit scripts/.env.bridge

Important safety note:
- do NOT copy prediteq_api/.env to PC2
- do NOT copy backend secrets to PC2
