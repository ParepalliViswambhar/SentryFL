# Hooks Directory

This directory contains custom React hooks for the SentryFL Dashboard.

## Purpose

- Reusable stateful logic
- API integration hooks
- WebSocket connection hooks
- Utility hooks

## Custom Hooks

### Data Fetching
- `useExperiments()` - Fetch and manage experiments
- `useMetrics()` - Fetch metrics data
- `useConfigurations()` - Fetch configurations

### WebSocket
- `useWebSocket()` - WebSocket connection and message handling
- `useRealtimeMetrics()` - Real-time metric updates via WebSocket

### Utilities
- `useDebounce()` - Debounce input values
- `useLocalStorage()` - Persist state to localStorage
- `useInterval()` - Interval-based updates

## Hook Structure

```javascript
export const useCustomHook = (params) => {
  // Hook logic
  return { data, loading, error, actions };
};
```

## Best Practices

1. Prefix with `use`
2. Return objects with named properties
3. Handle loading and error states
4. Clean up side effects
