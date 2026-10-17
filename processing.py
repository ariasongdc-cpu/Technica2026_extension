import os
import json
import sys
from google import genai
import pandas as pd

def parse_professor_data_to_df(json_data: dict) -> tuple[pd.DataFrame, dict]:
    """
    Parses PlanetTerp professor JSON response into a Pandas DataFrame 
    and extracts professor metadata.
    """
    # 1. Extract professor-level metadata
    metadata = {
        "name": json_data.get("name"),
        "department": json_data.get("department"),
        "average_rating": json_data.get("average_rating"),
        "average_gpa": json_data.get("average_gpa"),
        "title": json_data.get("title", "Professor"),
        "slug": json_data.get("slug"),
        "total_courses": len(json_data.get("courses", []))
    }
    
    # 2. Extract the reviews list
    reviews_list = json_data.get("reviews", [])
    if not reviews_list:
        print("Warning: No reviews found in the JSON data.")
        metadata["total_reviews"] = 0
        return pd.DataFrame(), metadata
        
    # 3. Convert reviews list directly to a DataFrame
    df = pd.DataFrame(reviews_list)
    
    # ==========================================
    # 4. Preprocessing Steps
    # ==========================================
    
    # Drop rows where the review text is missing or completely empty
    df = df.dropna(subset=["review"])
    df = df[df["review"].str.strip() != ""]
    
    # Convert 'date' strings to proper datetime objects for time-series analysis
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        
    # Standardize ratings to numeric values (just in case they are strings)
    if "rating" in df.columns:
        df["rating"] = pd.to_numeric(df["rating"], errors="coerce")
        
    # Clean up review text (remove leading/trailing whitespaces)
    df["cleaned_review"] = df["review"].str.strip()
    
    # Reset index for clean row numbering
    df = df.reset_index(drop=True)
    
    metadata["total_reviews"] = len(df)
    return df, metadata

def summarize_with_gemini(metadata: dict, reviews_list: list[str]) -> str:
    """
    Sends the parsed review texts and metadata to the Gemini API for summarization.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable is not set.")
        sys.exit(1)
        
    # Initialize the official google-genai client
    client = genai.Client(api_key=api_key)
    
    # Construct prompt payload
    reviews_text_block = "\n".join(reviews_list) if reviews_list else "No qualitative reviews available."
    
    prompt = f"""
You are an academic advisor assistant at the University of Maryland (UMD). 
Please analyze the following student reviews and metadata for {metadata['name']} ({metadata['title']}).

Metadata:
- Average Rating: {metadata.get('average_rating', 'N/A')}
- Average GPA: {metadata.get('average_gpa', 'N/A')}
- Total Reviews Collected: {metadata['total_reviews']}

Student Reviews:
{reviews_text_block}

Please provide a concise, structured summary including:
1. **Overall Sentiment**: General consensus from students.
2. **Key Strengths**: What professors/courses do particularly well.
3. **Common Pitfalls / Challenges**: Difficulties, workload concerns, or exams to watch out for.
4. **Actionable Advice for Students**: Tips for succeeding based on past student feedback.
"""

    print("Generating AI summary via Gemini API...")
    try:
        # Using gemini-2.5-flash
        response = client.models.generate_content(
            model="gemini-2.5-flash", 
            contents=prompt,
        )
        return response.text or ""
    except Exception as e:
        return f"Error communicating with Gemini API: {e}"

if __name__ == "__main__":
    # Define the filename of the JSON file in the same working directory
    json_filename = "check.json" 
    output_filename = "summary.txt"

    if not os.path.exists(json_filename):
        print(f"Error: Could not find '{json_filename}' in the current directory.")
        sys.exit(1)

    # 1. Load JSON file from the local working directory
    print(f"Loading data from {json_filename}...")
    with open(json_filename, "r", encoding="utf-8") as f:
        raw_json_data = json.load(f)
    
    # 2. Parse reviews & structure metadata via DataFrame preprocessing
    df, metadata = parse_professor_data_to_df(raw_json_data)
    
    print(f"Successfully parsed {metadata['total_reviews']} review(s) for {metadata['name']}.")
    
    # Extract cleaned review strings list for Gemini prompt payload
    cleaned_reviews_list = []
    if not df.empty and "cleaned_review" in df.columns:
        for _, row in df.iterrows():
            date_str = row["date"].strftime("%Y-%m-%d") if pd.notnull(row["date"]) else "Unknown date"
            rating_str = row["rating"] if pd.notnull(row["rating"]) else "N/A"
            cleaned_reviews_list.append(f"[{date_str}] Rating: {rating_str}/5 - \"{row['cleaned_review']}\"")

    # 3. Call Gemini API to summarize reviews
    summary = summarize_with_gemini(metadata, cleaned_reviews_list)
    
    # 4. Format output results and write to a text file
    output_content = f"""{"="*50}
 GEMINI SUMMARY FOR {str(metadata['name']).upper()} 
{"="*50}
Department: {metadata.get('department', 'N/A')}
Average Rating: {metadata.get('average_rating', 'N/A')}
Average GPA: {metadata.get('average_gpa', 'N/A')}
Total Reviews Analyzed: {metadata['total_reviews']}
{"="*50}

{summary}
{"="*50}
"""

    with open(output_filename, "w", encoding="utf-8") as out_f:
        out_f.write(output_content)

    print(f"\nResults successfully written to {output_filename}")
    print(output_content)
