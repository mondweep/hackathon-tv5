/**
 * Knowledge Graph Stats API
 * GET /.netlify/functions/kg-stats
 */

const fs = require('fs');
const path = require('path');

// Cache the data in memory for performance
let cachedData = null;

function loadData() {
  if (cachedData) return cachedData;

  const dataPath = path.join(__dirname, '../../mondweep/media-hackathion-knowledge-graph-full-export-2025-12-08.json');
  const rawData = fs.readFileSync(dataPath, 'utf8');
  cachedData = JSON.parse(rawData);
  return cachedData;
}

exports.handler = async (event, context) => {
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const data = loadData();
    const movies = data.data.movies || [];

    // Calculate platform readiness counts
    let readyForNetflix = 0;
    let readyForAmazon = 0;
    let readyForFAST = 0;

    // Extract unique genres from movies
    const genreSet = new Set();

    movies.forEach(movie => {
      if (movie.platformReadiness) {
        if (movie.platformReadiness.netflix) readyForNetflix++;
        if (movie.platformReadiness.amazon) readyForAmazon++;
        if (movie.platformReadiness.fast) readyForFAST++;
      }
      // Extract genres if they exist
      if (movie.genres) {
        movie.genres.forEach(g => genreSet.add(JSON.stringify(g)));
      }
    });

    const stats = {
      totalMovies: movies.length,
      totalGenres: data.stats.genres || genreSet.size || 18,
      totalCompanies: data.stats.companies || 0,
      totalCountries: data.stats.countries || 0,
      totalLanguages: 0,
      totalKeywords: 0,
      totalEdges: data.stats.edges || 0,
      readyForNetflix,
      readyForAmazon,
      readyForFAST,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ stats }),
    };
  } catch (error) {
    console.error('Stats error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to load stats', details: error.message }),
    };
  }
};
