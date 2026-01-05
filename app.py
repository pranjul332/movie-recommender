from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pickle
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
import uvicorn
from difflib import get_close_matches

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the movie data and similarity matrix
try:
    movies_df = pickle.load(open('movies.pkl', 'rb'))
    similarity = pickle.load(open('similarity.pkl', 'rb'))
    print(f"✓ Loaded {len(movies_df)} movies")
    print(f"✓ Similarity matrix shape: {similarity.shape}")
except Exception as e:
    print(f"✗ Error loading pickle files: {e}")
    movies_df = None
    similarity = None

class RecommendationRequest(BaseModel):
    movie_title: str
    num_recommendations: int = 5

class RecommendationResponse(BaseModel):
    recommendations: list[dict]
    matched_movie: str = None

@app.get("/")
def read_root():
    return {"message": "Movie Recommender ML Service"}

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "model_loaded": movies_df is not None,
        "total_movies": len(movies_df) if movies_df is not None else 0
    }

@app.get("/movies")
def get_all_movies():
    """Get list of all available movies"""
    if movies_df is None:
        raise HTTPException(status_code=500, detail="Model not loaded")
    
    movies_list = movies_df[['movie_id', 'title']].to_dict('records')
    return {"movies": movies_list, "total": len(movies_list)}

def find_best_movie_match(title: str, movies_df: pd.DataFrame):
    """
    Find the best matching movie using multiple strategies:
    1. Exact match (case-insensitive)
    2. Partial match (contains)
    3. Fuzzy match using difflib
    """
    title_lower = title.lower().strip()
    
    # Strategy 1: Exact match
    exact_match = movies_df[movies_df['title'].str.lower() == title_lower]
    if not exact_match.empty:
        print(f"✓ Exact match found: {exact_match.iloc[0]['title']}")
        return exact_match.index[0], exact_match.iloc[0]['title']
    
    # Strategy 2: Contains match
    contains_match = movies_df[
        movies_df['title'].str.lower().str.contains(title_lower, na=False)
    ]
    if not contains_match.empty:
        print(f"✓ Partial match found: {contains_match.iloc[0]['title']}")
        return contains_match.index[0], contains_match.iloc[0]['title']
    
    # Strategy 3: Fuzzy match
    all_titles = movies_df['title'].tolist()
    close_matches = get_close_matches(title, all_titles, n=1, cutoff=0.6)
    
    if close_matches:
        matched_title = close_matches[0]
        movie_index = movies_df[movies_df['title'] == matched_title].index[0]
        print(f"✓ Fuzzy match found: {matched_title}")
        return movie_index, matched_title
    
    # No match found
    print(f"✗ No match found for: {title}")
    # Get some suggestions
    suggestions = get_close_matches(title, all_titles, n=5, cutoff=0.3)
    return None, suggestions

@app.post("/recommend", response_model=RecommendationResponse)
def recommend_movies(request: RecommendationRequest):
    if movies_df is None or similarity is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    try:
        print(f"→ Searching for movie: '{request.movie_title}'")
        
        # Find the best matching movie
        result = find_best_movie_match(request.movie_title, movies_df)
        
        if result[0] is None:
            # No match found - return suggestions
            suggestions = result[1]
            raise HTTPException(
                status_code=404,
                detail={
                    "error": f"Movie '{request.movie_title}' not found",
                    "suggestions": suggestions[:5] if suggestions else []
                }
            )
        
        movie_index, matched_title = result
        print(f"→ Using movie: {matched_title}")

        # Get similarity scores
        distances = similarity[movie_index]
        movies_list = sorted(
            list(enumerate(distances)),
            reverse=True,
            key=lambda x: x[1]
        )[1 : request.num_recommendations + 1]

        recommendations = [
            {
                "movie_id": int(movies_df.iloc[i]["movie_id"]),
                "title": movies_df.iloc[i]["title"],
                "similarity_score": float(score),
            }
            for i, score in movies_list
        ]

        print(f"✓ Generated {len(recommendations)} recommendations")

        return {
            "recommendations": recommendations,
            "matched_movie": matched_title
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error generating recommendations: {str(e)}",
        )

@app.get("/movie/{movie_id}")
def get_movie_by_id(movie_id: int):
    """Get movie details by ID"""
    if movies_df is None:
        raise HTTPException(status_code=500, detail="Model not loaded")
    
    movie = movies_df[movies_df['movie_id'] == movie_id]
    
    if movie.empty:
        raise HTTPException(status_code=404, detail="Movie not found")
    
    return movie.to_dict('records')[0]

@app.get("/search")
def search_movies(query: str, limit: int = 10):
    """Search for movies by partial title match"""
    if movies_df is None:
        raise HTTPException(status_code=500, detail="Model not loaded")
    
    matches = movies_df[
        movies_df['title'].str.lower().str.contains(query.lower(), na=False)
    ]
    
    results = matches[['movie_id', 'title']].head(limit).to_dict('records')
    
    return {
        "query": query,
        "results": results,
        "total_found": len(matches)
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)