"""
Entry point for running SentryFL as a module: python -m sentryfl

This allows users to run the CLI via:
    python -m sentryfl train --config config.yaml --data-path ./data
"""

from sentryfl.cli import main

if __name__ == '__main__':
    main()
