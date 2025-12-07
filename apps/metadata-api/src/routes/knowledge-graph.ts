/**
 * Knowledge Graph API Routes
 *
 * REST API endpoints for querying and exploring the knowledge graph.
 * Supports movie browsing, genre filtering, and relationship traversal.
 */

import { Router, Request, Response } from 'express';
import { query, param, validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import {
  getStore,
  getProcessor,
  getGCSReader,
  GraphQuery,
  MovieNode,
  GenreNode,
} from '../knowledge-graph';
import { getEmbeddingsInstance } from '../vertex-ai/embeddings';

const router = Router();

/**
 * Validation error handler
 */
function handleValidationErrors(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
}

// ============================================
// Movie Endpoints
// ============================================

/**
 * GET /api/v1/knowledge-graph/movies
 * Query movies with filters
 */
router.get(
  '/movies',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('genre').optional().isString(),
    query('yearMin').optional().isInt({ min: 1900 }).toInt(),
    query('yearMax').optional().isInt({ max: 2030 }).toInt(),
    query('ratingMin').optional().isFloat({ min: 0, max: 10 }).toFloat(),
    query('ratingMax').optional().isFloat({ min: 0, max: 10 }).toFloat(),
    query('sortBy').optional().isIn(['popularity', 'voteAverage', 'year', 'title']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
  ],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const store = getStore();

      const graphQuery: GraphQuery = {
        limit: req.query.limit ? Number(req.query.limit) : 20,
        offset: req.query.offset ? Number(req.query.offset) : 0,
        sortBy: req.query.sortBy as string,
        sortOrder: req.query.sortOrder as 'asc' | 'desc',
      };

      if (req.query.yearMin || req.query.yearMax) {
        graphQuery.yearRange = {
          min: req.query.yearMin ? Number(req.query.yearMin) : 1900,
          max: req.query.yearMax ? Number(req.query.yearMax) : 2030,
        };
      }

      if (req.query.ratingMin || req.query.ratingMax) {
        graphQuery.ratingRange = {
          min: req.query.ratingMin ? Number(req.query.ratingMin) : 0,
          max: req.query.ratingMax ? Number(req.query.ratingMax) : 10,
        };
      }

      // If genre filter, use genre-based query
      if (req.query.genre) {
        const movies = await store.getMoviesByGenre(
          req.query.genre as string,
          graphQuery.limit,
          graphQuery.offset
        );

        return res.json({
          movies,
          pagination: {
            limit: graphQuery.limit,
            offset: graphQuery.offset,
            hasMore: movies.length === graphQuery.limit,
          },
        });
      }

      const result = await store.queryMovies(graphQuery);

      res.json({
        movies: result.nodes,
        pagination: {
          limit: graphQuery.limit,
          offset: graphQuery.offset,
          total: result.totalCount,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      logger.error('Failed to query movies', { error });
      res.status(500).json({ error: 'Failed to query movies' });
    }
  }
);

/**
 * GET /api/v1/knowledge-graph/movies/:id
 * Get movie by ID with relationships
 */
router.get(
  '/movies/:id',
  [param('id').isString().notEmpty()],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const store = getStore();
      const movie = await store.getMovie(req.params.id);

      if (!movie) {
        return res.status(404).json({ error: 'Movie not found' });
      }

      // Get edges for relationship data
      const edges = await store.getMovieEdges(req.params.id);

      // Get related movies
      const relatedMovies = await store.getRelatedMovies(req.params.id, 6);

      res.json({
        movie,
        edges,
        relatedMovies,
      });
    } catch (error) {
      logger.error('Failed to get movie', { error, movieId: req.params.id });
      res.status(500).json({ error: 'Failed to get movie' });
    }
  }
);

/**
 * GET /api/v1/knowledge-graph/movies/:id/related
 * Get related movies
 */
router.get(
  '/movies/:id/related',
  [
    param('id').isString().notEmpty(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  ],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const store = getStore();
      const limit = req.query.limit ? Number(req.query.limit) : 10;

      const relatedMovies = await store.getRelatedMovies(req.params.id, limit);

      res.json({ movies: relatedMovies });
    } catch (error) {
      logger.error('Failed to get related movies', { error, movieId: req.params.id });
      res.status(500).json({ error: 'Failed to get related movies' });
    }
  }
);

// ============================================
// Genre Endpoints
// ============================================

/**
 * GET /api/v1/knowledge-graph/genres
 * Get all genres
 */
router.get('/genres', async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const genres = await store.getGenres();

    res.json({ genres });
  } catch (error) {
    logger.error('Failed to get genres', { error });
    res.status(500).json({ error: 'Failed to get genres' });
  }
});

/**
 * GET /api/v1/knowledge-graph/genres/:id
 * Get genre by ID with movies
 */
router.get(
  '/genres/:id',
  [
    param('id').isString().notEmpty(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const store = getStore();
      const genre = await store.getGenre(req.params.id);

      if (!genre) {
        return res.status(404).json({ error: 'Genre not found' });
      }

      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const movies = await store.getMoviesByGenre(req.params.id, limit);

      res.json({ genre, movies });
    } catch (error) {
      logger.error('Failed to get genre', { error, genreId: req.params.id });
      res.status(500).json({ error: 'Failed to get genre' });
    }
  }
);

// ============================================
// Reference Data Endpoints
// ============================================

/**
 * GET /api/v1/knowledge-graph/countries
 * Get all countries
 */
router.get('/countries', async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const countries = await store.getCountries();

    res.json({ countries });
  } catch (error) {
    logger.error('Failed to get countries', { error });
    res.status(500).json({ error: 'Failed to get countries' });
  }
});

/**
 * GET /api/v1/knowledge-graph/languages
 * Get all languages
 */
router.get('/languages', async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const languages = await store.getLanguages();

    res.json({ languages });
  } catch (error) {
    logger.error('Failed to get languages', { error });
    res.status(500).json({ error: 'Failed to get languages' });
  }
});

// ============================================
// Statistics Endpoint
// ============================================

/**
 * GET /api/v1/knowledge-graph/stats
 * Get knowledge graph statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const stats = await store.getStats();

    res.json({ stats });
  } catch (error) {
    logger.error('Failed to get stats', { error });
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// ============================================
// Semantic Search Endpoint
// ============================================

/**
 * POST /api/v1/knowledge-graph/search/semantic
 * Semantic search using embeddings
 */
router.post(
  '/search/semantic',
  async (req: Request, res: Response) => {
    try {
      const { query: searchQuery, limit = 10 } = req.body;

      if (!searchQuery || typeof searchQuery !== 'string') {
        return res.status(400).json({ error: 'Query is required' });
      }

      // Generate embedding for search query
      const embeddings = getEmbeddingsInstance();
      const queryEmbedding = await embeddings.generateEmbedding(searchQuery);

      // For now, return placeholder - will integrate with vector search
      res.json({
        query: searchQuery,
        embedding: {
          dimensions: queryEmbedding.length,
          preview: queryEmbedding.slice(0, 5),
        },
        message: 'Semantic search will be integrated with vector index',
        results: [],
      });
    } catch (error) {
      logger.error('Semantic search failed', { error });
      res.status(500).json({ error: 'Semantic search failed' });
    }
  }
);

// ============================================
// Ingestion Endpoints
// ============================================

/**
 * POST /api/v1/knowledge-graph/ingest/start
 * Start dataset ingestion (for small batches or testing)
 */
router.post(
  '/ingest/start',
  async (req: Request, res: Response) => {
    try {
      const { limit = 100 } = req.body;

      const gcsReader = getGCSReader();
      const processor = getProcessor();
      const store = getStore();

      let processed = 0;
      let stored = 0;
      let failed = 0;

      const startTime = Date.now();

      // Process in batches
      for await (const batch of gcsReader.streamBatches(50, undefined, limit)) {
        const { movies, stats } = processor.processBatch(batch);
        processed += stats.totalRows || 0;
        failed += stats.failedRows || 0;

        if (movies.length > 0) {
          const storeResult = await store.storeProcessedMoviesBatch(movies);
          stored += storeResult.stored;
        }
      }

      const duration = Date.now() - startTime;

      res.json({
        success: true,
        stats: {
          processed,
          stored,
          failed,
          durationMs: duration,
          cacheStats: processor.getCacheStats(),
        },
      });
    } catch (error) {
      logger.error('Ingestion failed', { error });
      res.status(500).json({ error: 'Ingestion failed' });
    }
  }
);

/**
 * GET /api/v1/knowledge-graph/ingest/status
 * Get ingestion status
 */
router.get('/ingest/status', async (req: Request, res: Response) => {
  try {
    const processor = getProcessor();
    const store = getStore();
    const stats = await store.getStats();

    res.json({
      status: stats.totalMovies > 0 ? 'in_progress' : 'not_started',
      stats,
      cacheStats: processor.getCacheStats(),
    });
  } catch (error) {
    logger.error('Failed to get ingestion status', { error });
    res.status(500).json({ error: 'Failed to get status' });
  }
});

export default router;
