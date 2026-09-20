/**
 * Unit tests for User Service
 */

const bcrypt = require('bcryptjs');
const userService = require('./userService');

describe('User Service', () => {
  beforeEach(async () => {
    // Clear users before each test (this resets to default admin)
    await userService.clearUsers();
  });

  describe('createUser', () => {
    test('should create a new user successfully', async () => {
      const user = await userService.createUser('testuser', 'password123', 'user');

      expect(user).toHaveProperty('userId');
      expect(user).toHaveProperty('username', 'testuser');
      expect(user).toHaveProperty('role', 'user');
      expect(user).toHaveProperty('createdAt');
      expect(user).not.toHaveProperty('password'); // Password should not be returned
    });

    test('should hash password correctly', async () => {
      const plainPassword = 'password123';
      const user = await userService.createUser('testuser', plainPassword, 'user');

      // Get the user to verify password is hashed
      const storedUser = await userService.getUserById(user.userId);

      // Verify we can authenticate with the plain password
      const authenticated = await userService.authenticateUser('testuser', plainPassword);
      expect(authenticated).toBeTruthy();
      expect(authenticated.userId).toBe(user.userId);
    });

    test('should create user with default role "user" when role not specified', async () => {
      const user = await userService.createUser('testuser', 'password123');

      expect(user.role).toBe('user');
    });

    test('should create user with admin role', async () => {
      const user = await userService.createUser('adminuser', 'password123', 'admin');

      expect(user.role).toBe('admin');
    });

    test('should throw error when username already exists', async () => {
      await userService.createUser('testuser', 'password123', 'user');

      await expect(userService.createUser('testuser', 'password456', 'user')).rejects.toThrow(
        'Username already exists'
      );
    });

    test('should generate unique user IDs', async () => {
      const user1 = await userService.createUser('user1', 'password123', 'user');
      const user2 = await userService.createUser('user2', 'password123', 'user');

      expect(user1.userId).not.toBe(user2.userId);
    });
  });

  describe('authenticateUser', () => {
    beforeEach(async () => {
      await userService.createUser('testuser', 'password123', 'user');
    });

    test('should authenticate user with correct credentials', async () => {
      const user = await userService.authenticateUser('testuser', 'password123');

      expect(user).toBeTruthy();
      expect(user).toHaveProperty('username', 'testuser');
      expect(user).toHaveProperty('role', 'user');
      expect(user).not.toHaveProperty('password');
    });

    test('should authenticate default admin user', async () => {
      const user = await userService.authenticateUser('admin', 'admin123');

      expect(user).toBeTruthy();
      expect(user.username).toBe('admin');
      expect(user.role).toBe('admin');
    });

    test('should return null for non-existent username', async () => {
      const user = await userService.authenticateUser('nonexistent', 'password123');

      expect(user).toBeNull();
    });

    test('should return null for incorrect password', async () => {
      const user = await userService.authenticateUser('testuser', 'wrongpassword');

      expect(user).toBeNull();
    });

    test('should not return password in authenticated user object', async () => {
      const user = await userService.authenticateUser('testuser', 'password123');

      expect(user).not.toHaveProperty('password');
    });
  });

  describe('getUserById', () => {
    test('should return user by ID', async () => {
      const createdUser = await userService.createUser('testuser', 'password123', 'user');
      const user = await userService.getUserById(createdUser.userId);

      expect(user).toBeTruthy();
      expect(user.userId).toBe(createdUser.userId);
      expect(user.username).toBe('testuser');
      expect(user).not.toHaveProperty('password');
    });

    test('should return null for non-existent user ID', async () => {
      const user = await userService.getUserById('nonexistent-id');

      expect(user).toBeNull();
    });

    test('should not return password', async () => {
      const createdUser = await userService.createUser('testuser', 'password123', 'user');
      const user = await userService.getUserById(createdUser.userId);

      expect(user).not.toHaveProperty('password');
    });
  });

  describe('getUserByUsername', () => {
    test('should return user by username', async () => {
      await userService.createUser('testuser', 'password123', 'user');
      const user = await userService.getUserByUsername('testuser');

      expect(user).toBeTruthy();
      expect(user.username).toBe('testuser');
      expect(user).not.toHaveProperty('password');
    });

    test('should return default admin user', async () => {
      const user = await userService.getUserByUsername('admin');

      expect(user).toBeTruthy();
      expect(user.username).toBe('admin');
      expect(user.role).toBe('admin');
    });

    test('should return null for non-existent username', async () => {
      const user = await userService.getUserByUsername('nonexistent');

      expect(user).toBeNull();
    });

    test('should not return password', async () => {
      await userService.createUser('testuser', 'password123', 'user');
      const user = await userService.getUserByUsername('testuser');

      expect(user).not.toHaveProperty('password');
    });
  });

  describe('getAllUsers', () => {
    test('should return all users', async () => {
      await userService.createUser('user1', 'password123', 'user');
      await userService.createUser('user2', 'password123', 'user');

      const users = await userService.getAllUsers();

      // Should include default admin + 2 created users
      expect(users.length).toBe(3);
      expect(users.every((u) => !u.password)).toBe(true); // No passwords returned
    });

    test('should return only default admin when no users created', async () => {
      const users = await userService.getAllUsers();

      expect(users.length).toBe(1);
      expect(users[0].username).toBe('admin');
    });

    test('should not return passwords for any user', async () => {
      await userService.createUser('user1', 'password123', 'user');
      await userService.createUser('user2', 'password123', 'user');

      const users = await userService.getAllUsers();

      users.forEach((user) => {
        expect(user).not.toHaveProperty('password');
      });
    });
  });

  describe('deleteUser', () => {
    test('should delete user successfully', async () => {
      const user = await userService.createUser('testuser', 'password123', 'user');
      const result = await userService.deleteUser(user.userId);

      expect(result).toBe(true);
      expect(await userService.getUserById(user.userId)).toBeNull();
    });

    test('should return false when deleting non-existent user', async () => {
      const result = await userService.deleteUser('nonexistent-id');

      expect(result).toBe(false);
    });

    test('should allow deleting and recreating user with same username', async () => {
      const user1 = await userService.createUser('testuser', 'password123', 'user');
      await userService.deleteUser(user1.userId);

      const user2 = await userService.createUser('testuser', 'newpassword', 'user');

      expect(user2.username).toBe('testuser');
      expect(user2.userId).not.toBe(user1.userId);
    });
  });

  describe('updateUserRole', () => {
    test('should update user role successfully', async () => {
      const user = await userService.createUser('testuser', 'password123', 'user');
      const updatedUser = await userService.updateUserRole(user.userId, 'admin');

      expect(updatedUser).toBeTruthy();
      expect(updatedUser.role).toBe('admin');
      expect(updatedUser.username).toBe('testuser');
    });

    test('should return null when updating non-existent user', async () => {
      const result = await userService.updateUserRole('nonexistent-id', 'admin');

      expect(result).toBeNull();
    });

    test('should persist role change', async () => {
      const user = await userService.createUser('testuser', 'password123', 'user');
      await userService.updateUserRole(user.userId, 'admin');

      const retrievedUser = await userService.getUserById(user.userId);
      expect(retrievedUser.role).toBe('admin');
    });

    test('should not return password', async () => {
      const user = await userService.createUser('testuser', 'password123', 'user');
      const updatedUser = await userService.updateUserRole(user.userId, 'admin');

      expect(updatedUser).not.toHaveProperty('password');
    });
  });

  describe('clearUsers', () => {
    test('should clear all users and reinitialize default admin', async () => {
      await userService.createUser('user1', 'password123', 'user');
      await userService.createUser('user2', 'password123', 'user');

      await userService.clearUsers();

      const users = await userService.getAllUsers();
      expect(users.length).toBe(1);
      expect(users[0].username).toBe('admin');
    });

    test('should allow creating users after clearing', async () => {
      await userService.createUser('user1', 'password123', 'user');
      await userService.clearUsers();

      const newUser = await userService.createUser('user2', 'password123', 'user');
      expect(newUser.username).toBe('user2');
    });
  });

  describe('Default admin user', () => {
    test('should have default admin user after initialization', async () => {
      const admin = await userService.getUserByUsername('admin');

      expect(admin).toBeTruthy();
      expect(admin.username).toBe('admin');
      expect(admin.role).toBe('admin');
    });

    test('should be able to authenticate with default admin credentials', async () => {
      const admin = await userService.authenticateUser('admin', 'admin123');

      expect(admin).toBeTruthy();
      expect(admin.role).toBe('admin');
    });
  });

  describe('Password security', () => {
    test('should not store plain text passwords', async () => {
      const plainPassword = 'password123';
      const user = await userService.createUser('testuser', plainPassword, 'user');

      // Try to get internal user data (this is for testing only)
      const allUsers = await userService.getAllUsers();
      const testUser = allUsers.find((u) => u.username === 'testuser');

      // The returned user should not have password at all
      expect(testUser).not.toHaveProperty('password');
    });

    test('should use bcrypt for password hashing', async () => {
      const plainPassword = 'password123';
      await userService.createUser('testuser', plainPassword, 'user');

      // Authenticate should use bcrypt.compare
      const user = await userService.authenticateUser('testuser', plainPassword);
      expect(user).toBeTruthy();

      // Wrong password should fail
      const failedAuth = await userService.authenticateUser('testuser', 'wrongpassword');
      expect(failedAuth).toBeNull();
    });
  });
});
