/**
 * Knowledge Graph Genres API
 * GET /.netlify/functions/kg-genres
 */

const fs = require('fs');
const path = require('path');

let cachedData = null;
let cachedGenres = null;

function loadData() {
  if (cachedData) return cachedData;

  const dataPath = path.join(__dirname, '../../mondweep/media-hackathion-knowledge-graph-full-export-2025-12-08.json');
  const rawData = fs.readFileSync(dataPath, 'utf8');
  cachedData = JSON.parse(rawData);
  return cachedData;
}

function extractGenres(movies) {
  if (cachedGenres) return cachedGenres;

  // Standard TMDB genres with IDs
  const standardGenres = [
    { id: '28', name: 'Action' },
    { id: '12', name: 'Adventure' },
    { id: '16', name: 'Animation' },
    { id: '35', name: 'Comedy' },
    { id: '80', name: 'Crime' },
    { id: '99', name: 'Documentary' },
    { id: '18', name: 'Drama' },
    { id: '10751', name: 'Family' },
    { id: '14', name: 'Fantasy' },
    { id: '36', name: 'History' },
    { id: '27', name: 'Horror' },
    { id: '10402', name: 'Music' },
    { id: '9648', name: 'Mystery' },
    { id: '10749', name: 'Romance' },
    { id: '878', name: 'Science Fiction' },
    { id: '10770', name: 'TV Movie' },
    { id: '53', name: 'Thriller' },
    { id: '10752', name: 'War' },
    { id: '37', name: 'Western' },
  ];

  // Count movies per genre
  const genreCounts = {};
  movies.forEach(movie => {
    if (movie.genres) {
      movie.genres.forEach(g => {
        const id = String(g.id);
        genreCounts[id] = (genreCounts[id] || 0) + 1;
      });
    }
  });

  // Build genre list with counts
  cachedGenres = standardGenres.map(genre => ({
    ...genre,
    type: 'genre',
    movieCount: genreCounts[genre.id] || 0,
  })).filter(g => g.movieCount > 0);

  // Sort by movie count descending
  cachedGenres.sort((a, b) => b.movieCount - a.movieCount);

  return cachedGenres;
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
    const data = loadData();
    const movies = data.data.movies || [];
    const genres = extractGenres(movies);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ genres }),
    };
  } catch (error) {
    console.error('Genres error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to load genres', details: error.message }),
    };
  }
};
