const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

/* =========================
   TMDB & ML CONFIG
========================= */

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

// Configure axios instance with better defaults for TMDB
const tmdbAxios = axios.create({
  baseURL: TMDB_BASE_URL,
  timeout: 10000, // 10 second timeout
  headers: {
    Accept: "application/json",
    "User-Agent": "MovieRecommender/1.0",
  },
  // Add connection pool settings
  httpAgent: new (require("http").Agent)({ keepAlive: true }),
  httpsAgent: new (require("https").Agent)({ keepAlive: true }),
});

// Cache for ML movies (refresh periodically)
let mlMoviesCache = null;
let mlMoviesCacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper function to add delay between requests
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper function to fetch from TMDB with retry logic
async function fetchFromTMDB(endpoint, params = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Add small delay between requests to avoid rate limiting
      if (attempt > 1) {
        const backoffTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`Retry attempt ${attempt} after ${backoffTime}ms delay...`);
        await delay(backoffTime);
      }

      const response = await tmdbAxios.get(endpoint, {
        params: {
          api_key: TMDB_API_KEY,
          ...params,
        },
      });

      return response.data;
    } catch (error) {
      console.error(
        `TMDB API Error (attempt ${attempt}/${retries}):`,
        error.message
      );

      // Don't retry on 4xx errors (client errors)
      if (
        error.response &&
        error.response.status >= 400 &&
        error.response.status < 500
      ) {
        throw error;
      }

      // If this was the last attempt, throw the error
      if (attempt === retries) {
        throw error;
      }
    }
  }
}

// Helper function to get ML movies list with caching
async function getMLMovies() {
  const now = Date.now();

  // Return cached data if still valid
  if (
    mlMoviesCache &&
    mlMoviesCacheTime &&
    now - mlMoviesCacheTime < CACHE_DURATION
  ) {
    console.log("Using cached ML movies");
    return mlMoviesCache;
  }

  try {
    console.log("Fetching fresh ML movies list...");
    const response = await axios.get(`${ML_SERVICE_URL}/movies`, {
      timeout: 5000,
    });
    mlMoviesCache = response.data.movies;
    mlMoviesCacheTime = now;
    console.log(`Cached ${mlMoviesCache.length} ML movies`);
    return mlMoviesCache;
  } catch (error) {
    console.error("Failed to fetch ML movies:", error.message);
    return mlMoviesCache || []; // Return cached data even if expired, or empty array
  }
}

// Helper function to filter movies by ML availability with batching
async function filterByMLMovies(tmdbMovies, fetchDetails = false) {
  const mlMovies = await getMLMovies();
  const mlMovieIds = new Set(mlMovies.map((m) => m.movie_id));

  // Filter TMDB movies to only include those in ML dataset
  const filtered = tmdbMovies.filter((movie) => mlMovieIds.has(movie.id));

  console.log(
    `Filtered ${filtered.length} movies from ${tmdbMovies.length} (ML dataset: ${mlMovieIds.size})`
  );

  if (!fetchDetails) {
    return filtered;
  }

  // Fetch full details for filtered movies with rate limiting
  const detailedMovies = [];
  const BATCH_SIZE = 5; // Process 5 movies at a time
  const BATCH_DELAY = 500; // 500ms delay between batches

  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = filtered.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(async (movie) => {
        try {
          const details = await fetchFromTMDB(`/movie/${movie.id}`);
          return details;
        } catch (error) {
          console.error(
            `Failed to fetch details for movie ${movie.id}:`,
            error.message
          );
          return movie; // Return basic data if details fetch fails
        }
      })
    );

    // Add successful results to detailedMovies
    batchResults.forEach((result) => {
      if (result.status === "fulfilled") {
        detailedMovies.push(result.value);
      }
    });

    // Add delay between batches (except for the last batch)
    if (i + BATCH_SIZE < filtered.length) {
      await delay(BATCH_DELAY);
    }
  }

  return detailedMovies;
}

/* =========================
   PUBLIC ROUTES
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "Express Backend",
    tmdb_configured: !!TMDB_API_KEY,
    ml_service: ML_SERVICE_URL,
  });
});

// Get popular movies (from ML dataset with TMDB data)
app.get("/api/movies/popular", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;

    console.log(`Fetching popular movies from ML dataset (page ${page})...`);

    // Get movies from ML service
    const mlMovies = await getMLMovies();

    // Calculate pagination
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedMovies = mlMovies.slice(startIndex, endIndex);

    console.log(
      `Processing ${paginatedMovies.length} movies from ML dataset...`
    );

    // Fetch TMDB data for paginated movies in batches
    const moviesWithTMDB = [];
    const BATCH_SIZE = 5;
    const BATCH_DELAY = 500;

    for (let i = 0; i < paginatedMovies.length; i += BATCH_SIZE) {
      const batch = paginatedMovies.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (movie) => {
          try {
            const tmdbData = await fetchFromTMDB(`/movie/${movie.movie_id}`);
            return tmdbData; // Return full TMDB data
          } catch (error) {
            console.error(
              `Failed to fetch TMDB data for movie ${movie.movie_id}`
            );
            return null;
          }
        })
      );

      batchResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          moviesWithTMDB.push(result.value);
        }
      });

      if (i + BATCH_SIZE < paginatedMovies.length) {
        await delay(BATCH_DELAY);
      }
    }

    const totalPages = Math.ceil(mlMovies.length / perPage);

    res.json({
      page: page,
      results: moviesWithTMDB,
      total_results: mlMovies.length,
      total_pages: totalPages,
      filtered_by_ml: true,
      ml_dataset_size: mlMovies.length,
      returned: moviesWithTMDB.length,
    });
  } catch (error) {
    console.error("Error fetching popular movies:", error.message);
    res.status(500).json({
      error: "Failed to fetch popular movies",
      details: error.message,
    });
  }
});

// Search movies (from ML dataset)
app.get("/api/movies/search", async (req, res) => {
  try {
    const { query, page = 1 } = req.query;

    if (!query) {
      return res.status(400).json({ error: "Query parameter is required" });
    }

    console.log(`Searching ML dataset for: "${query}"`);

    // Search in ML service
    const mlSearchResponse = await axios.get(`${ML_SERVICE_URL}/search`, {
      params: { query, limit: 50 },
      timeout: 5000,
    });

    const mlResults = mlSearchResponse.data.results;
    console.log(`ML search found ${mlResults.length} results`);

    if (mlResults.length === 0) {
      return res.json({
        page: 1,
        results: [],
        total_results: 0,
        total_pages: 0,
        query: query,
        filtered_by_ml: true,
        search_source: "ml_service",
        message: "No movies found in ML dataset",
      });
    }

    // Fetch TMDB data for ML results in batches
    const detailedMovies = [];
    const BATCH_SIZE = 5;
    const BATCH_DELAY = 500;

    for (let i = 0; i < mlResults.length; i += BATCH_SIZE) {
      const batch = mlResults.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map((movie) => fetchFromTMDB(`/movie/${movie.movie_id}`))
      );

      batchResults.forEach((result, idx) => {
        if (result.status === "fulfilled") {
          detailedMovies.push(result.value);
        } else {
          console.error(`Failed to fetch TMDB data for ${batch[idx].movie_id}`);
        }
      });

      if (i + BATCH_SIZE < mlResults.length) {
        await delay(BATCH_DELAY);
      }
    }

    res.json({
      page: 1,
      results: detailedMovies,
      total_results: mlSearchResponse.data.total_found,
      total_pages: 1,
      query: query,
      filtered_by_ml: true,
      search_source: "ml_service",
      returned: detailedMovies.length,
    });
  } catch (error) {
    console.error("Error searching movies:", error.message);
    res.status(500).json({
      error: "Failed to search movies",
      details: error.message,
    });
  }
});

// Movie details
app.get("/api/movies/:movieId", async (req, res) => {
  try {
    const { movieId } = req.params;
    console.log(`Fetching details for movie ${movieId}...`);

    const data = await fetchFromTMDB(`/movie/${movieId}`, {
      append_to_response: "credits,videos,similar",
    });

    res.json(data);
  } catch (error) {
    console.error("Error fetching movie details:", error.message);

    if (error.response?.status === 404) {
      res.status(404).json({ error: "Movie not found" });
    } else {
      res.status(500).json({
        error: "Failed to fetch movie details",
        details: error.message,
      });
    }
  }
});

// Get all ML movies with TMDB data
app.get("/api/ml/movies", async (req, res) => {
  try {
    const mlMovies = await getMLMovies();
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    console.log(
      `Fetching ML movies with TMDB data (limit: ${limit}, offset: ${offset})`
    );

    // Paginate ML movies
    const paginatedMovies = mlMovies.slice(offset, offset + limit);

    // Fetch TMDB data for each movie in batches
    const moviesWithDetails = [];
    const BATCH_SIZE = 5;
    const BATCH_DELAY = 500;

    for (let i = 0; i < paginatedMovies.length; i += BATCH_SIZE) {
      const batch = paginatedMovies.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (movie) => {
          try {
            const tmdbData = await fetchFromTMDB(`/movie/${movie.movie_id}`);
            return {
              ...movie,
              tmdb_data: tmdbData,
            };
          } catch (error) {
            console.error(`Failed to fetch TMDB data for ${movie.movie_id}`);
            return movie;
          }
        })
      );

      batchResults.forEach((result) => {
        if (result.status === "fulfilled") {
          moviesWithDetails.push(result.value);
        }
      });

      if (i + BATCH_SIZE < paginatedMovies.length) {
        await delay(BATCH_DELAY);
      }
    }

    res.json({
      movies: moviesWithDetails,
      total: mlMovies.length,
      limit,
      offset,
      returned: moviesWithDetails.length,
    });
  } catch (error) {
    console.error("Error fetching ML movies:", error.message);
    res.status(500).json({
      error: "Failed to fetch movies from ML service",
      details: error.message,
    });
  }
});

// Recommendations
app.post("/api/recommendations", async (req, res) => {
  try {
    const { movie_title, num_recommendations = 5 } = req.body;

    if (!movie_title) {
      return res.status(400).json({ error: "movie_title is required" });
    }

    console.log(`Generating recommendations for: "${movie_title}"`);

    const mlResponse = await axios.post(
      `${ML_SERVICE_URL}/recommend`,
      { movie_title, num_recommendations },
      { timeout: 10000 }
    );

    const recommendations = mlResponse.data.recommendations;
    const matchedMovie = mlResponse.data.matched_movie;

    console.log(
      `Got ${recommendations.length} recommendations from ML service`
    );

    // Fetch TMDB data in batches
    const detailedRecommendations = [];
    const BATCH_SIZE = 5;
    const BATCH_DELAY = 500;

    for (let i = 0; i < recommendations.length; i += BATCH_SIZE) {
      const batch = recommendations.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (rec) => {
          try {
            const tmdbData = await fetchFromTMDB(`/movie/${rec.movie_id}`);
            return { ...rec, tmdb_data: tmdbData };
          } catch (error) {
            console.error(`Failed to fetch details for ${rec.movie_id}`);
            return rec;
          }
        })
      );

      batchResults.forEach((result) => {
        if (result.status === "fulfilled") {
          detailedRecommendations.push(result.value);
        }
      });

      if (i + BATCH_SIZE < recommendations.length) {
        await delay(BATCH_DELAY);
      }
    }

    res.json({
      recommendations: detailedRecommendations,
      matched_movie: matchedMovie,
      total: detailedRecommendations.length,
    });
  } catch (error) {
    console.error("Error generating recommendations:", error.message);

    if (error.response?.status === 404) {
      res.status(404).json(error.response.data);
    } else {
      res.status(500).json({
        error: "Failed to generate recommendations",
        details: error.message,
      });
    }
  }
});
/* =========================
   PROTECTED ROUTES (DISABLED)
========================= */

// app.get("/api/user/favorites", checkJwt, async (req, res) => {
//   res.json({ user_id: req.auth.payload.sub, favorites: [] });
// });

// app.post("/api/user/favorites", checkJwt, async (req, res) => {
//   const { movieId } = req.body;
//   res.json({ message: "Added to favorites", movieId });
// });

// app.delete("/api/user/favorites/:movieId", checkJwt, async (req, res) => {
//   const { movieId } = req.params;
//   res.json({ message: "Removed from favorites", movieId });
// });

/* =========================
   SERVER START
========================= */

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});
