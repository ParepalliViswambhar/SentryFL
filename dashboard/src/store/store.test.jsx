/**
 * Redux Store Tests
 * 
 * Tests for Redux store configuration and integration
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import store from './index';
import experimentsReducer from './slices/experimentsSlice';
import metricsReducer from './slices/metricsSlice';
import authReducer from './slices/authSlice';

describe('Redux Store Configuration', () => {
  it('should have experiments reducer', () => {
    const state = store.getState();
    expect(state).toHaveProperty('experiments');
    expect(state.experiments).toHaveProperty('list');
    expect(state.experiments).toHaveProperty('current');
    expect(state.experiments).toHaveProperty('status');
    expect(state.experiments).toHaveProperty('error');
  });

  it('should have metrics reducer', () => {
    const state = store.getState();
    expect(state).toHaveProperty('metrics');
    expect(state.metrics).toHaveProperty('training');
    expect(state.metrics).toHaveProperty('privacy');
    expect(state.metrics).toHaveProperty('communication');
    expect(state.metrics).toHaveProperty('status');
    expect(state.metrics).toHaveProperty('error');
  });

  it('should have auth reducer', () => {
    const state = store.getState();
    expect(state).toHaveProperty('auth');
    expect(state.auth).toHaveProperty('token');
    expect(state.auth).toHaveProperty('user');
    expect(state.auth).toHaveProperty('isAuthenticated');
    expect(state.auth).toHaveProperty('status');
    expect(state.auth).toHaveProperty('error');
  });

  it('should initialize with correct default state', () => {
    const state = store.getState();
    
    // Experiments initial state
    expect(state.experiments.list).toEqual([]);
    expect(state.experiments.current).toBeNull();
    expect(state.experiments.status).toBe('idle');
    expect(state.experiments.error).toBeNull();
    
    // Metrics initial state
    expect(state.metrics.training).toEqual({});
    expect(state.metrics.privacy).toEqual({});
    expect(state.metrics.communication).toEqual({});
    expect(state.metrics.status).toBe('idle');
    expect(state.metrics.error).toBeNull();
    
    // Auth initial state
    expect(state.auth.user).toBeNull();
    expect(state.auth.isAuthenticated).toBe(false);
    expect(state.auth.status).toBe('idle');
  });

  it('should be able to create a new store instance', () => {
    const testStore = configureStore({
      reducer: {
        experiments: experimentsReducer,
        metrics: metricsReducer,
        auth: authReducer,
      },
    });
    
    expect(testStore).toBeDefined();
    expect(testStore.getState()).toHaveProperty('experiments');
    expect(testStore.getState()).toHaveProperty('metrics');
    expect(testStore.getState()).toHaveProperty('auth');
  });
});
