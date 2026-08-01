#!/usr/bin/env python
"""
Convenience script for running SentryFL CLI

This script can be used as an alternative to 'python -m sentryfl.cli'

Usage:
    python sentryfl_cli.py train --config config.yaml --data-path ./data
    python sentryfl_cli.py evaluate --model-path model.pt --config config.yaml --data-path ./data
    python sentryfl_cli.py ablation --config config.yaml --data-path ./data
    python sentryfl_cli.py baseline --config config.yaml --data-path ./data
"""

from sentryfl.cli import main

if __name__ == '__main__':
    main()
