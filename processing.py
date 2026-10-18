import os
import json
import sys
from google import genai
import pandas as pd

def parse_professor_data_to_df(json_data: dict) -> tuple[pd.DataFrame, dict]:
    metadata = {
        "name": json_data.get("name"),
        "department": json_data.get("department"),
        "average_rating": json_data.get("average_rating"),
        "average_gpa": json_data.get("average_gpa"),
        "title": json_data.get("title", "Professor"),
        "slug": json_data.get("slug"),
        "total_courses": len(json_data.get("courses", []))
    }
    
    reviews_list = json_data.get("reviews", [])
    if not reviews_list:
        metadata["total_reviews"] = 0
        return pd.DataFrame(), metadata
        
    df = pd.DataFrame(reviews_list)
    df = df.dropna(subset=["review"])
    df = df[df["review"].str.strip() != ""]
    
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
    if "rating" in df.columns:
        df["rating"] = pd.to_numeric(df["rating"], errors="coerce")
        
    df["cleaned_review"] = df["review"].str.strip()
    df = df.reset_index(drop=True)
    metadata["total_reviews"] = len(df)
    return df, metadata

def summarize_with_gemini(metadata: dict, reviews_list: list[str]) -> str:
    # Pulls directly from GitHub Secret / Environment Variable: GEMINI_API_KEY
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return "Error: GEMINI_API_KEY secret/environment variable is not set."
        
    client = genai.Client(api_key=api_key)
    reviews_text_block = "\n".join(reviews_list) if reviews_list else "No qualitative reviews available."
    
    prompt = f"""
You are an academic advisor assistant at the University of Maryland (UMD). 
Please analyze the following student reviews and metadata for {metadata['name']} ({metadata.get('title', 'Professor')}).

Metadata:
- Average Rating: {metadata.get('average_rating', 'N/A')}
- Average GPA: {metadata.get('average_gpa', 'N/A')}
- Total Reviews Collected: {metadata['total_reviews']}

Student Reviews:
{reviews_text_block}

Please provide a concise, structured summary separated by newlines including:
1. **Overall Sentiment**: General consensus from students.
2. **Key Strengths**: What professors/courses do particularly well.
3. **Common Pitfalls / Challenges**: Difficulties, workload concerns, or exams to watch out for.
4. **Actionable Advice for Students**: Tips for succeeding based on past student feedback.
"""

    try:
        response = client.models.generate_content(
            model="gemini-3.8-flash", 
            contents=prompt,
        )
        return response.text or ""
    except Exception as e:
        return f"Error communicating with Gemini API: {e}"