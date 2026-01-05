export default function MovieCard({ movie, onRecommend }) {
  const imageUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : "/placeholder-movie.png";

  return (
    <div className="relative rounded-xl overflow-hidden cursor-pointer shadow-md transform transition hover:-translate-y-2 group">
      {/* Poster */}
      <img
        src={imageUrl}
        alt={movie.title}
        className="w-full h-[300px] object-cover"
      />

      {/* Overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 text-white opacity-0 transition-opacity group-hover:opacity-100">
        <h3 className="text-sm font-semibold mb-2">{movie.title}</h3>

        {movie.vote_average && (
          <p className="text-sm mb-2">⭐ {movie.vote_average.toFixed(1)}</p>
        )}

        <button
          onClick={() => onRecommend(movie.title)}
          className="w-full bg-indigo-500 hover:bg-indigo-600 transition text-white py-2 rounded-md text-sm"
        >
          Get Similar Movies
        </button>
      </div>
    </div>
  );
}
