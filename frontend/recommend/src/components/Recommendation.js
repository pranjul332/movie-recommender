export default function Recommendations({ selectedMovie, recommendations }) {
  return (
    <section className="my-16 p-8 bg-white/10 rounded-[20px] backdrop-blur-md">
      <h2 className="text-white text-3xl text-center mb-8">
        Movies Similar to{" "}
        <span className="text-yellow-400 italic">{selectedMovie}</span>
      </h2>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-8">
        {recommendations.map((rec, index) => {
          const tmdb = rec.tmdb_data || {};
          const imageUrl = tmdb.poster_path
            ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
            : "/placeholder-movie.png";

          return (
            <div
              key={rec.movie_id}
              className="relative bg-white rounded-xl overflow-hidden shadow-lg transform transition hover:-translate-y-1"
            >
              {/* Rank */}
              <div className="absolute top-2.5 left-2.5 bg-indigo-500 text-white px-3 py-1 rounded-full font-bold z-10 text-sm">
                #{index + 1}
              </div>

              {/* Poster */}
              <img
                src={imageUrl}
                alt={rec.title}
                className="w-full h-[350px] object-cover"
              />

              {/* Info */}
              <div className="p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-1">
                  {rec.title}
                </h3>

                {tmdb.vote_average && (
                  <p className="text-sm text-gray-600 mb-1">
                    ⭐ {tmdb.vote_average.toFixed(1)}
                  </p>
                )}

                {tmdb.overview && (
                  <p className="text-sm text-gray-600 leading-relaxed mb-2">
                    {tmdb.overview.substring(0, 150)}...
                  </p>
                )}

                <span className="inline-block bg-green-100 text-green-700 px-2 py-1 rounded text-sm font-semibold">
                  Match: {(rec.similarity_score * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
