#!/usr/bin/env python
"""
SentryFL Client Runner.
Execute local anomaly detection, local training, model download, and update upload.

Usage:
    # 0. Interactive Guided Client Mode (prompts for server, credentials, dataset path, and action!)
    python sentryfl_client.py

    # 1. Login to get token
    python sentryfl_client.py login --server http://localhost --username client1 --password <PASSWORD>

    # 2. Download global model
    python sentryfl_client.py download --server http://localhost --experiment <EXP_ID> --username client1 --password <PASSWORD>

    # 3. Local Anomaly Detection (Private data stays local!)
    python sentryfl_client.py predict --model <EXP_ID>-global-model.pt --data my_timeseries.csv

    # 4. Local Training on private data
    python sentryfl_client.py train --model <EXP_ID>-global-model.pt --data my_timeseries.csv --epochs 3

    # 5. Upload model weights update to server for aggregation
    python sentryfl_client.py upload --server http://localhost --experiment <EXP_ID> --update client_device-update.pt --username client1 --password <PASSWORD>

    # Or run the entire federated round in one step:
    python sentryfl_client.py auto --server http://localhost --experiment <EXP_ID> --data my_timeseries.csv --username client1 --password <PASSWORD>
"""

from sentryfl.client import main

if __name__ == "__main__":
    main()
