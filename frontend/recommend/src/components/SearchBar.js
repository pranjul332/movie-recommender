import { useState, useEffect } from "react";

export default function SearchBar({ onRecommend }) {
  const [query, setQuery] = useState("");
  const [movies, setMovies] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const fetchMovies = async () => {
      if (query.length < 2) {
        setMovies([]);
        setShowDropdown(false);
        return;
      }

      try {
        const response = await fetch(
          `http://localhost:5000/api/movies/search?query=${encodeURIComponent(
            query
          )}`
        );
        const data = await response.json();
        setMovies(data.results?.slice(0, 5) || []);
        setShowDropdown(true);
      } catch (error) {
        console.error("Error searching movies:", error);
      }
    };

    const timeoutId = setTimeout(fetchMovies, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleSelect = (movie) => {
    setQuery(movie.title);
    setShowDropdown(false);
    onRecommend(movie.title);
  };

  return (
    <div className="relative max-w-[600px] mx-auto">
      {/* Input */}
      <input
        type="text"
        placeholder="Search for a movie..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => movies.length > 0 && setShowDropdown(true)}
        className="w-full px-6 py-4 text-base rounded-full shadow-md outline-none"
      />

      {/* Dropdown */}
      {showDropdown && movies.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl max-h-[400px] overflow-y-auto z-10">
          {movies.map((movie) => (
            <div
              key={movie.id}
              onClick={() => handleSelect(movie)}
              className="flex gap-4 p-4 cursor-pointer transition hover:bg-gray-100"
            >
              <img
                src={
                  movie.poster_path
                    ? `https://image.tmdb.org/t/p/w92${movie.poster_path}`
                    : "/placeholder-movie.png"
                }
                alt={movie.title}
                className="w-[50px] h-[75px] object-cover rounded"
              />

              <div>
                <div className="font-semibold text-gray-800">{movie.title}</div>
                <div className="text-sm text-gray-500">
                  {movie.release_date?.substring(0, 4)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
