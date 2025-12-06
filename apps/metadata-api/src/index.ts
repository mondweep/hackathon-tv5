/**
 * Nexus-UMMID Metadata API Server
 *
 * Express.js server for the Entertainment Discovery Metadata API
 * Designed for 400M+ users on GCP Cloud Run
 */

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import metadataRoutes from './routes/metadata';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger, logger } from './middleware/logger';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Express = express();
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Middleware Configuration
 */

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}));

// Request compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

/**
 * Health Check Endpoint
 * Used by GCP Cloud Run for liveness/readiness probes
 */
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'nexus-ummid-metadata-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime()
  });
});

/**
 * Root Endpoint
 */
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'Nexus-UMMID Metadata API',
    version: '1.0.0',
    description: 'Entertainment Discovery Metadata Platform',
    documentation: '/api/v1/docs',
    health: '/health',
    endpoints: {
      metadata: '/api/v1/metadata',
      search: '/api/v1/metadata/search/query',
      enrich: '/api/v1/metadata/:id/enrich',
      validate: '/api/v1/metadata/:id/validate'
    }
  });
});

/**
 * API Routes
 */
app.use('/api/v1/metadata', metadataRoutes);

/**
 * Error Handling
 */
app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Start Server
 */
const server = app.listen(PORT, () => {
  logger.info(`🚀 Nexus-UMMID Metadata API started`, {
    port: PORT,
    environment: NODE_ENV,
    pid: process.pid,
    nodeVersion: process.version
  });

  logger.info(`📡 Server ready at http://localhost:${PORT}`);
  logger.info(`🏥 Health check at http://localhost:${PORT}/health`);
  logger.info(`📚 API endpoints at http://localhost:${PORT}/api/v1/metadata`);
});

/**
 * Graceful Shutdown
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

/**
 * Unhandled Rejection Handler
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

export default app;
