# Utils Directory

This directory contains utility functions and helper modules for the SentryFL Dashboard.

## Purpose

- Common utility functions
- Data formatting helpers
- Validation functions
- Constants and configuration

## Utility Modules

### Date Formatting (`dateUtils.js`)
```javascript
import { format, formatDistance } from 'date-fns';

export const formatTimestamp = (timestamp) => format(new Date(timestamp), 'PPpp');
export const formatRelativeTime = (timestamp) => formatDistance(new Date(timestamp), new Date(), { addSuffix: true });
```

### Data Formatting (`formatters.js`)
```javascript
export const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export const formatNumber = (num, decimals = 2) => {
  return num.toFixed(decimals);
};

export const formatPercentage = (value) => `${(value * 100).toFixed(2)}%`;
```

### Validation (`validators.js`)
```javascript
export const validateExperimentConfig = (config) => {
  // Validation logic
  return { isValid: true, errors: [] };
};
```

### Constants (`constants.js`)
```javascript
export const EXPERIMENT_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

export const METRIC_TYPES = {
  LOSS: 'loss',
  ACCURACY: 'accuracy',
  PRIVACY: 'privacy_budget',
  COMMUNICATION: 'communication_cost'
};
```

## Best Practices

1. Keep functions pure and testable
2. Export individual functions, not default exports
3. Add JSDoc comments for complex functions
4. Group related utilities in the same file
