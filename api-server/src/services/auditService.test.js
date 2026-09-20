/**
 * Unit tests for Audit Service
 * Tests audit logging functionality for Requirement 38.10
 */

const {
  AuditActionType,
  logAction,
  getAuditLogs,
  getExperimentAuditLogs,
  getUserAuditLogs,
  clearAuditLogs,
  getAuditStats,
} = require('./auditService');

describe('Audit Service', () => {
  beforeEach(async () => {
    // Clear audit logs before each test
    await clearAuditLogs();
  });

  describe('logAction', () => {
    test('should log a successful user action', async () => {
      const log = await logAction({
        userId: 'user-1',
        username: 'alice',
        action: AuditActionType.EXPERIMENT_CREATE,
        resourceType: 'experiment',
        resourceId: 'exp-123',
        metadata: { experimentName: 'Test' },
        ipAddress: '127.0.0.1',
        success: true,
      });

      expect(log).toHaveProperty('logId');
      expect(log).toHaveProperty('timestamp');
      expect(log.userId).toBe('user-1');
      expect(log.username).toBe('alice');
      expect(log.action).toBe(AuditActionType.EXPERIMENT_CREATE);
      expect(log.resourceType).toBe('experiment');
      expect(log.resourceId).toBe('exp-123');
      expect(log.metadata.experimentName).toBe('Test');
      expect(log.ipAddress).toBe('127.0.0.1');
      expect(log.success).toBe(true);
      expect(log.errorMessage).toBeNull();
    });

    test('should log a failed user action with error message', async () => {
      const log = await logAction({
        userId: 'user-2',
        username: 'bob',
        action: AuditActionType.EXPERIMENT_DELETE,
        resourceType: 'experiment',
        resourceId: 'exp-456',
        metadata: { reason: 'access_denied' },
        ipAddress: '192.168.1.1',
        success: false,
        errorMessage: 'Access denied',
      });

      expect(log.userId).toBe('user-2');
      expect(log.success).toBe(false);
      expect(log.errorMessage).toBe('Access denied');
    });

    test('should generate unique log IDs', async () => {
      const log1 = await logAction({
        userId: 'user-1',
        username: 'alice',
        action: AuditActionType.EXPERIMENT_CREATE,
        resourceType: 'experiment',
        resourceId: 'exp-1',
        success: true,
      });

      const log2 = await logAction({
        userId: 'user-1',
        username: 'alice',
        action: AuditActionType.EXPERIMENT_CREATE,
        resourceType: 'experiment',
        resourceId: 'exp-2',
        success: true,
      });

      expect(log1.logId).not.toBe(log2.logId);
    });

    test('should default metadata to empty object if not provided', async () => {
      const log = await logAction({
        userId: 'user-1',
        username: 'alice',
        action: AuditActionType.EXPERIMENT_CREATE,
        resourceType: 'experiment',
        resourceId: 'exp-1',
        success: true,
      });

      expect(log.metadata).toEqual({});
    });
  });

  describe('getAuditLogs', () => {
    beforeEach(async () => {
      // Create sample audit logs
      await logAction({
        userId: 'user-1',
        username: 'alice',
        action: AuditActionType.EXPERIMENT_CREATE,
        resourceType: 'experiment',
        resourceId: 'exp-1',
        success: true,
      });

      await logAction({
        userId: 'user-2',
        username: 'bob',
        action: AuditActionType.EXPERIMENT_DELETE,
        resourceType: 'experiment',
        resourceId: 'exp-2',
        success: true,
      });

      await logAction({
        userId: 'user-1',
        username: 'alice',
        action: AuditActionType.EXPERIMENT_PAUSE,
        resourceType: 'experiment',
        resourceId: 'exp-1',
        success: false,
        errorMessage: 'Experiment not running',
      });
    });

    test('should return all audit logs', async () => {
      const result = await getAuditLogs();

      expect(result.logs).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    test('should filter logs by userId', async () => {
      const result = await getAuditLogs({ userId: 'user-1' });

      expect(result.logs).toHaveLength(2);
      expect(result.logs.every((log) => log.userId === 'user-1')).toBe(true);
    });

    test('should filter logs by action', async () => {
      const result = await getAuditLogs({ action: AuditActionType.EXPERIMENT_CREATE });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].action).toBe(AuditActionType.EXPERIMENT_CREATE);
    });

    test('should filter logs by resourceType', async () => {
      const result = await getAuditLogs({ resourceType: 'experiment' });

      expect(result.logs).toHaveLength(3);
    });

    test('should filter logs by resourceId', async () => {
      const result = await getAuditLogs({ resourceId: 'exp-1' });

      expect(result.logs).toHaveLength(2);
    });

    test('should apply pagination with limit and offset', async () => {
      const result = await getAuditLogs({ limit: 2, offset: 0 });

      expect(result.logs).toHaveLength(2);
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(0);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    test('should indicate no more results when at end of pagination', async () => {
      const result = await getAuditLogs({ limit: 2, offset: 2 });

      expect(result.logs).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    test('should sort logs by timestamp (most recent first)', async () => {
      const result = await getAuditLogs();

      const timestamps = result.logs.map((log) => new Date(log.timestamp).getTime());
      const sortedTimestamps = [...timestamps].sort((a, b) => b - a);

      expect(timestamps).toEqual(sortedTimestamps);
    });

    test('should filter logs by date range', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 3600000).toISOString(); // 1 hour from now

      const result = await getAuditLogs({ endDate: futureDate });

      expect(result.logs).toHaveLength(3);
    });
  });

  describe('getExperimentAuditLogs', () => {
    beforeEach(async () => {
      await logAction({
        userId: 'user-1',
        username: 'alice',
        action: AuditActionType.EXPERIMENT_CREATE,
        resourceType: 'experiment',
        resourceId: 'exp-1',
        success: true,
      });

      await logAction({
        userId: 'user-1',
        username: 'alice',
        action: AuditActionType.EXPERIMENT_PAUSE,
        resourceType: 'experiment',
        resourceId: 'exp-1',
        success: true,
      });

      await logAction({
        userId: 'user-2',
        username: 'bob',
        action: AuditActionType.EXPERIMENT_CREATE,
        resourceType: 'experiment',
        resourceId: 'exp-2',
        success: true,
      });
    });

    test('should return logs for specific experiment', async () => {
      const result = await getExperimentAuditLogs('exp-1');

      expect(result.logs).toHaveLength(2);
      expect(result.logs.every((log) => log.resourceId === 'exp-1')).toBe(true);
    });

    test('should return empty array for experiment with no logs', async () => {
      const result = await getExperimentAuditLogs('exp-999');

      expect(result.logs).toHaveLength(0);
    });
  });

  describe('getUserAuditLogs', () => {
    beforeEach(async () => {
      await logAction({
        userId: 'user-1',
        username: 'alice',
        action: AuditActionType.EXPERIMENT_CREATE,
        resourceType: 'experiment',
        resourceId: 'exp-1',
        success: true,
      });

      await logAction({
        userId: 'user-1',
        username: 'alice',
        action: AuditActionType.EXPERIMENT_DELETE,
        resourceType: 'experiment',
        resourceId: 'exp-1',
        success: true,
      });

      await logAction({
        userId: 'user-2',
        username: 'bob',
        action: AuditActionType.EXPERIMENT_CREATE,
        resourceType: 'experiment',
        resourceId: 'exp-2',
        success: true,
      });
    });

    test('should return logs for specific user', async () => {
      const result = await getUserAuditLogs('user-1');

      expect(result.logs).toHaveLength(2);
      expect(result.logs.every((log) => log.userId === 'user-1')).toBe(true);
    });

    test('should return empty array for user with no logs', async () => {
      const result = await getUserAuditLogs('user-999');

      expect(result.logs).toHaveLength(0);
    });
  });

  describe('getAuditStats', () => {
    beforeEach(async () => {
      // Create sample logs with various actions and users
      await logAction({
        userId: 'user-1',
        username: 'alice',
        action: AuditActionType.EXPERIMENT_CREATE,
        resourceType: 'experiment',
        resourceId: 'exp-1',
        success: true,
      });

      await logAction({
        userId: 'user-1',
        username: 'alice',
        action: AuditActionType.EXPERIMENT_CREATE,
        resourceType: 'experiment',
        resourceId: 'exp-2',
        success: true,
      });

      await logAction({
        userId: 'user-2',
        username: 'bob',
        action: AuditActionType.EXPERIMENT_DELETE,
        resourceType: 'experiment',
        resourceId: 'exp-1',
        success: false,
        errorMessage: 'Access denied',
      });

      await logAction({
        userId: 'user-1',
        username: 'alice',
        action: AuditActionType.EXPERIMENT_PAUSE,
        resourceType: 'experiment',
        resourceId: 'exp-1',
        success: true,
      });
    });

    test('should return correct audit statistics', async () => {
      const stats = await getAuditStats();

      expect(stats.totalLogs).toBe(4);
      expect(stats.successCount).toBe(3);
      expect(stats.failureCount).toBe(1);
    });

    test('should count actions by type', async () => {
      const stats = await getAuditStats();

      expect(stats.actionCounts[AuditActionType.EXPERIMENT_CREATE]).toBe(2);
      expect(stats.actionCounts[AuditActionType.EXPERIMENT_DELETE]).toBe(1);
      expect(stats.actionCounts[AuditActionType.EXPERIMENT_PAUSE]).toBe(1);
    });

    test('should count actions by user', async () => {
      const stats = await getAuditStats();

      expect(stats.userCounts['alice']).toBe(3);
      expect(stats.userCounts['bob']).toBe(1);
    });

    test('should return oldest and newest log timestamps', async () => {
      const stats = await getAuditStats();

      expect(stats.oldestLog).toBeDefined();
      expect(stats.newestLog).toBeDefined();
      // Timestamps should be valid ISO strings
      expect(new Date(stats.oldestLog).getTime()).toBeGreaterThan(0);
      expect(new Date(stats.newestLog).getTime()).toBeGreaterThan(0);
    });

    test('should return null timestamps when no logs exist', async () => {
      await clearAuditLogs();
      const stats = await getAuditStats();

      expect(stats.totalLogs).toBe(0);
      expect(stats.oldestLog).toBeNull();
      expect(stats.newestLog).toBeNull();
    });
  });

  describe('clearAuditLogs', () => {
    test('should clear all audit logs', async () => {
      // Add some logs
      await logAction({
        userId: 'user-1',
        username: 'alice',
        action: AuditActionType.EXPERIMENT_CREATE,
        resourceType: 'experiment',
        resourceId: 'exp-1',
        success: true,
      });

      await logAction({
        userId: 'user-2',
        username: 'bob',
        action: AuditActionType.EXPERIMENT_DELETE,
        resourceType: 'experiment',
        resourceId: 'exp-2',
        success: true,
      });

      // Verify logs exist
      const beforeClear = await getAuditLogs();
      expect(beforeClear.logs).toHaveLength(2);

      // Clear logs
      await clearAuditLogs();

      // Verify logs are cleared
      const afterClear = await getAuditLogs();
      expect(afterClear.logs).toHaveLength(0);
      expect(afterClear.total).toBe(0);
    });
  });

  describe('AuditActionType constants', () => {
    test('should have all required action types defined', () => {
      expect(AuditActionType.EXPERIMENT_CREATE).toBe('experiment.create');
      expect(AuditActionType.EXPERIMENT_DELETE).toBe('experiment.delete');
      expect(AuditActionType.EXPERIMENT_START).toBe('experiment.start');
      expect(AuditActionType.EXPERIMENT_STOP).toBe('experiment.stop');
      expect(AuditActionType.EXPERIMENT_PAUSE).toBe('experiment.pause');
      expect(AuditActionType.EXPERIMENT_RESUME).toBe('experiment.resume');
      expect(AuditActionType.EXPERIMENT_VIEW).toBe('experiment.view');
      expect(AuditActionType.USER_LOGIN).toBe('user.login');
      expect(AuditActionType.USER_LOGOUT).toBe('user.logout');
      expect(AuditActionType.USER_REGISTER).toBe('user.register');
      expect(AuditActionType.CONFIG_CREATE).toBe('config.create');
      expect(AuditActionType.CONFIG_UPDATE).toBe('config.update');
      expect(AuditActionType.CONFIG_DELETE).toBe('config.delete');
    });
  });
});
