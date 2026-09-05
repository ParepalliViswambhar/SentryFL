# Store Directory

This directory contains Redux store configuration and slices for state management.

## Purpose

- Global application state management
- Redux store configuration
- Redux slices for different features
- Selectors and actions

## Structure

```
store/
  ├── index.js           # Store configuration
  ├── experimentSlice.js # Experiment state
  ├── metricsSlice.js    # Real-time metrics state
  ├── configSlice.js     # Configuration state
  └── authSlice.js       # Authentication state
```

## Redux Toolkit

Using Redux Toolkit for:
- Simplified store setup
- Built-in immutability with Immer
- Automatic action creators
- Integration with Redux DevTools

## State Structure

```javascript
{
  experiments: {
    list: [],
    current: null,
    loading: false,
    error: null
  },
  metrics: {
    realtime: {},
    history: []
  },
  config: {
    templates: [],
    current: null
  }
}
```
