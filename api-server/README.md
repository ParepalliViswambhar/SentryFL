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
- **Caching**: Caches frequently accessed data (metrics, model info)
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
- Python backend running on http://localhost:5000 (configurable)

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

### REST API

- `GET /api/v1/health` - Health check
- `POST /api/v1/experiments` - Create new experiment
- `GET /api/v1/experiments` - List experiments
- `GET /api/v1/experiments/:id` - Get experiment details
- `POST /api/v1/experiments/:id/start` - Start experiment
- `POST /api/v1/experiments/:id/stop` - Stop experiment
- `GET /api/v1/metrics/:experimentId` - Get experiment metrics

### WebSocket API

- Connect to `/socket.io`
- Listen for `training_update` events for real-time metrics
- Emit `subscribe_experiment` to subscribe to specific experiment updates

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
