/**
 * Knowledge Graph Search API
 * POST /.netlify/functions/kg-search
 * Body: { "query": "action movie", "limit": 10 }
 *
 * This is a text-based search (not semantic) since we don't have embeddings API.
 * It searches title, overview, and tagline fields.
 */

const fs = require('fs');
const path = require('path');

let cachedData = null;

function loadData() {
  if (cachedData) return cachedData;

  const dataPath = path.join(__dirname, '../../mondweep/media-hackathion-knowledge-graph-full-export-2025-12-08.json');
  const rawData = fs.readFileSync(dataPath, 'utf8');
  cachedData = JSON.parse(rawData);
  return cachedData;
}

// Simple text similarity scoring
function calculateSimilarity(movie, queryTerms) {
  let score = 0;
  const title = (movie.title || '').toLowerCase();
  const overview = (movie.overview || '').toLowerCase();
  const tagline = (movie.tagline || '').toLowerCase();

  queryTerms.forEach(term => {
    // Title matches are worth more
    if (title.includes(term)) {
      score += 10;
      if (title.startsWith(term)) score += 5; // Bonus for starting with term
    }
    // Overview matches
    if (overview.includes(term)) {
      score += 3;
      // Count occurrences
      const matches = overview.split(term).length - 1;
      score += Math.min(matches, 3);
    }
    // Tagline matches
    if (tagline.includes(term)) {
      score += 2;
    }
  });

  // Boost by popularity (normalized)
  if (movie.popularity) {
    score += Math.log10(movie.popularity + 1) * 0.5;
  }

  return score;
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Parse request body
    let body = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch (e) {
        // If not JSON, check query params
        body.query = event.queryStringParameters?.query;
      }
    }

    const query = body.query || event.queryStringParameters?.query;
    const limit = parseInt(body.limit || event.queryStringParameters?.limit) || 10;

    if (!query) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Search query is required' }),
      };
    }

    const data = loadData();
    const movies = data.data.movies || [];

    // Tokenize query
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);

    // Score all movies
    const scoredMovies = movies.map(movie => ({
      ...movie,
      searchScore: calculateSimilarity(movie, queryTerms),
    })).filter(m => m.searchScore > 0);

    // Sort by score descending
    scoredMovies.sort((a, b) => b.searchScore - a.searchScore);

    // Take top results
    const results = scoredMovies.slice(0, limit).map(movie => ({
      movie: {
        id: movie.id,
        title: movie.title,
        overview: movie.overview,
        posterPath: movie.posterPath,
        releaseDate: movie.releaseDate,
        voteAverage: movie.voteAverage,
        popularity: movie.popularity,
        runtime: movie.runtime,
        platformReadiness: movie.platformReadiness,
      },
      similarity: Math.min(movie.searchScore / 20, 1), // Normalize to 0-1
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        query,
        results,
        total: scoredMovies.length,
        searchType: 'text', // Indicate this is text search, not semantic
      }),
    };
  } catch (error) {
    console.error('Search error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Search failed', details: error.message }),
    };
  }
};
