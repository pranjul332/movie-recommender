"use client"
import { useState, useEffect } from "react";
import Head from "next/head";
import { useUser } from "@auth0/nextjs-auth0/client";
import MovieCard from "../components/MovieCard";
import SearchBar from "../components/SearchBar";
import Recommendations from "../components/Recommendation";


export default function Home() {
  const { user, error, isLoading } = useUser();
  const [popularMovies, setPopularMovies] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  useEffect(() => {
    fetchPopularMovies();
  }, []);

  const fetchPopularMovies = async () => {
    try {
      const response = await fetch("http://localhost:5000/api/movies/popular");
      const data = await response.json();
      setPopularMovies(data.results?.slice(0, 12) || []);
    } catch (error) {
      console.error("Error fetching popular movies:", error);
    }
  };

  const handleGetRecommendations = async (movieTitle) => {
    setLoadingRecs(true);
    try {
      const response = await fetch(
        "http://localhost:5000/api/recommendations",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            movie_title: movieTitle,
            num_recommendations: 5,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to get recommendations");
      }

      const data = await response.json();
      setRecommendations(data.recommendations);
      setSelectedMovie(movieTitle);
    } catch (error) {
      console.error("Error getting recommendations:", error);
      alert("Failed to get recommendations. Please try again.");
    } finally {
      setLoadingRecs(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600">
      <Head>
        <title>Movie Recommender</title>
      </Head>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/30 backdrop-blur-md">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between px-8 py-4">
          <h1 className="text-white text-2xl font-bold">🎬 MovieRec</h1>

          {!isLoading && (
            <>
              {user ? (
                <div className="flex items-center gap-4">
                  <span className="text-white text-sm">Hello, {user.name}</span>
                  <a
                    href="/api/auth/logout"
                    className="bg-white text-indigo-500 px-6 py-2 rounded-full font-semibold hover:scale-105 transition"
                  >
                    Logout
                  </a>
                </div>
              ) : (
                <a
                  href="/api/auth/login"
                  className="bg-white text-indigo-500 px-6 py-2 rounded-full font-semibold hover:scale-105 transition"
                >
                  Login
                </a>
              )}
            </>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="max-w-[1400px] mx-auto px-8 py-8">
        {/* Hero */}
        <section className="text-center text-white py-16">
          <h2 className="text-4xl font-bold mb-4 drop-shadow-lg">
            Discover Your Next Favorite Movie
          </h2>
          <p className="text-lg opacity-90 mb-8">
            Get personalized recommendations based on movies you love
          </p>
          <SearchBar onRecommend={handleGetRecommendations} />
        </section>

        {/* Loading */}
        {loadingRecs && (
          <div className="flex flex-col items-center py-12 text-white">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4" />
            <p>Finding recommendations...</p>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <Recommendations
            selectedMovie={selectedMovie}
            recommendations={recommendations}
          />
        )}

        {/* Popular Movies */}
        <section className="mt-16">
          <h2 className="text-white text-3xl text-center mb-8">
            Popular Movies
          </h2>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-8">
            {popularMovies.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                onRecommend={handleGetRecommendations}
              />
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-black/30 text-white text-center py-8 mt-16">
        © 2026 MovieRec. Powered by TMDB API
      </footer>
    </div>
  );
}
