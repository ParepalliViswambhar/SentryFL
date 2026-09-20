# SentryFL API Server

Node.js + Express API Server for SentryFL - Middleware layer between Python ML backend and React frontend.

## Overview

The API Server (Tier 2) provides RESTful and WebSocket APIs for:
- Experiment management (create, start, stop, pause, configure)
- Configuration management
- Real-time metric streaming
- Training progress updates
- Model and result retrieval

## Architecture

This server acts as middleware with the following responsibilities:
- **Request Routing**: Routes frontend requests to appropriate Python backend endpoints
- **Response Transformation**: Transforms backend responses to frontend-friendly formats
- **Persistence**: Stores users, audit logs, and configuration in MongoDB (via Mongoose)
- **Caching**: Caches frequently accessed data (metrics, model info) in-process with node-cache
- **Authentication**: JWT-based authentication for secure access
- **WebSocket Management**: Real-time bidirectional communication for training updates
- **Error Handling**: Graceful error handling and user-friendly error messages

## Project Structure

```
api-server/
├── src/
│   ├── routes/          # API endpoint definitions
│   ├── middleware/      # Express middleware (auth, validation, error handling)
│   ├── schemas/         # Request/response validation schemas
│   ├── services/        # Business logic (backend proxy, cache management)
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Utility functions
├── dist/                # Compiled JavaScript output
├── tests/               # Test files
└── package.json         # Project dependencies and scripts
```

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- MongoDB reachable via `MONGODB_URI` (defaults to `mongodb://127.0.0.1:27017/sentryfl`)
- Python backend running on http://localhost:5000 (configurable)

## Data storage

Users, audit logs, and saved configurations are persisted in MongoDB through
Mongoose (`src/db/`). Set the connection string with the `MONGODB_URI`
environment variable. On first startup a default admin user (`admin` /
`admin123`) is seeded unless `SEED_DEFAULT_ADMIN=false`; override the seed with
`DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD`. Tests run against an
in-memory MongoDB (`mongodb-memory-server`), so no external database is needed
to run the suite.

## Installation

```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your configuration
```

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Build TypeScript to JavaScript
npm run build

# Run compiled code
npm start

# Watch mode for development
npm run watch
```

## Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting
npm run format:check
```

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Configuration

Key environment variables (see `.env.example`):

- `PORT`: Server port (default: 3000)
- `PYTHON_BACKEND_URL`: Python ML backend URL
- `JWT_SECRET`: Secret for JWT token signing
- `CORS_ORIGIN`: Allowed CORS origin (frontend URL)
- `CACHE_TTL_SECONDS`: Response cache TTL

## API Endpoints

All application routes are mounted under `/api`. Experiment, admin, and
auth-protected routes require a `Bearer <JWT>` token (obtain one from
`/api/auth/login`).

### Health

- `GET /health` - Health check (includes MongoDB connection status)

### Auth (`/api/auth`)

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Log in, returns a JWT
- `GET /api/auth/me` - Current user (auth)
- `POST /api/auth/logout` - Log out (auth)

### Experiments (`/api/experiments`, auth required)

- `POST /api/experiments` - Create/start an experiment
- `GET /api/experiments` - List experiments (own; all for admin)
- `GET /api/experiments/:id` - Experiment details
- `GET /api/experiments/:id/status` - Current status
- `DELETE /api/experiments/:id` - Stop an experiment
- `POST /api/experiments/:id/pause` - Pause training
- `POST /api/experiments/:id/resume` - Resume training
- `GET /api/experiments/:id/metrics` - All metrics (paginated)
- `GET /api/experiments/:id/metrics/{training|privacy|communication|evaluation}` - Metrics by category
- `GET /api/experiments/:id/report` - Experiment summary report
- `POST /api/experiments/:id/callback` - Internal metric callback from the Python backend (no auth)

### Configurations (`/api/configs`)

- `GET /api/configs` / `POST /api/configs` - List / create configuration templates
- `GET|PUT|DELETE /api/configs/:id` - Retrieve / update / delete a template
- `GET /api/configs/defaults` - Default configuration values
- `POST /api/configs/validate` - Validate a configuration without saving

### Admin (`/api/admin`, admin role required)

- `GET /api/admin/users` - List all users
- `GET /api/admin/audit-logs` - Query the audit trail (filterable)
- `GET /api/admin/audit-logs/experiments/:id` - Audit logs for an experiment
- `GET /api/admin/audit-logs/users/:id` - Audit logs for a user
- `GET /api/admin/audit-logs/stats` - Audit log statistics

### WebSocket API

- Connect via Socket.io with a JWT in the connection auth payload
- Subscribe to an experiment room (`experiment:<id>`) for real-time updates
- Server emits `training_round_complete`, `privacy_budget_update`,
  `experiment_status_change`, and `error` events

## Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing configuration
- **Rate Limiting**: Request throttling per IP
- **JWT Authentication**: Secure token-based auth
- **Input Validation**: Request validation with schemas

## Dependencies

### Production
- **express**: Web framework
- **socket.io**: WebSocket server
- **axios**: HTTP client for backend communication
- **jsonwebtoken**: JWT authentication
- **node-cache**: In-memory caching
- **helmet**: Security middleware
- **cors**: CORS handling
- **morgan**: HTTP request logging
- **express-rate-limit**: Rate limiting

### Development
- **typescript**: TypeScript compiler
- **eslint**: Code linting
- **prettier**: Code formatting
- **jest**: Testing framework
- **ts-node**: TypeScript execution

## License

MIT
