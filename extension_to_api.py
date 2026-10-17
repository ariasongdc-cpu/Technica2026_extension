import json
import os
import sys
from pathlib import Path
import pandas as pd

# Import functions from processing.py
# (Ensure processing.py is in the same directory)
from processing import parse_professor_data_to_df, summarize_with_gemini

CHECK_FILE = Path("check.json")
OUTPUT_FILE = Path("professor_summary.txt")


def adapt_check_json_format(data: dict) -> dict:
    """
    Adapts the cleaned JSON format from popup.js (check.json)
    into the format expected by processing.py.
    """
    normalized = dict(data)

    # 1. Normalize reviews key ('recent_reviews' -> 'reviews')
    reviews = normalized.get("recent_reviews") or normalized.get("reviews", [])

    # 2. Normalize date key ('created' -> 'date')
    adapted_reviews = []
    for r in reviews:
        review_copy = dict(r)
        if "date" not in review_copy and "created" in review_copy:
            review_copy["date"] = review_copy["created"]
        adapted_reviews.append(review_copy)

    normalized["reviews"] = adapted_reviews
    return normalized


def run_pipeline(input_file: Path = CHECK_FILE, output_file: Path = OUTPUT_FILE):
    if not input_file.exists():
        print(f"Error: '{input_file}' not found. Please click 'Analyze reviews' in the extension first.")
        sys.exit(1)

    print(f"Loading incoming data from '{input_file}'...")
    with open(input_file, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    # Adapt schema from popup.js
    adapted_data = adapt_check_json_format(raw_data)

    # 1. Parse reviews & build DataFrame
    df, metadata = parse_professor_data_to_df(adapted_data)
    print(f"Parsed {metadata['total_reviews']} reviews for {metadata['name']}.")

    # 2. Format review list for Gemini prompt
    cleaned_reviews_list = []
    if not df.empty and "cleaned_review" in df.columns:
        for _, row in df.iterrows():
            date_str = row["date"].strftime("%Y-%m-%d") if pd.notnull(row["date"]) else "Unknown date"
            rating_str = row["rating"] if pd.notnull(row["rating"]) else "N/A"
            course_str = row.get("course", "General")
            cleaned_reviews_list.append(
                f"[{date_str}] ({course_str}) Rating: {rating_str}/5 - \"{row['cleaned_review']}\""
            )

    # 3. Call Gemini API
    summary = summarize_with_gemini(metadata, cleaned_reviews_list)

    # 4. Generate structured output
    output_content = f"""{"="*50}
 GEMINI SUMMARY FOR {str(metadata['name']).upper()} 
{"="*50}
Average Rating: {metadata.get('average_rating', 'N/A')}
Total Reviews Analyzed: {metadata['total_reviews']}
{"="*50}

{summary}
{"="*50}
"""

    output_file.write_text(output_content, encoding="utf-8")
    print(f"\nSummary generated and saved to '{output_file}':\n")
    print(output_content)


if __name__ == "__main__":
    run_pipeline()