# import json
# import os
# import sys
# from http.server import BaseHTTPRequestHandler, HTTPServer
# from pathlib import Path
# import pandas as pd

# from processing import parse_professor_data_to_df, summarize_with_gemini
# from extension_to_api import adapt_check_json_format

# class Handler(BaseHTTPRequestHandler):
#     def _send_json(self, status_code: int, data: dict):
#         """Sends a JSON response with proper headers to prevent Chrome fetch from hanging."""
#         body = json.dumps(data).encode("utf-8")
#         self.send_response(status_code)
#         self.send_header("Access-Control-Allow-Origin", "*")
#         self.send_header("Access-Control-Allow-Headers", "Content-Type")
#         self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
#         self.send_header("Content-Type", "application/json")
#         self.send_header("Content-Length", str(len(body)))
#         self.send_header("Connection", "close")
#         self.end_headers()
#         self.wfile.write(body)

#     def do_OPTIONS(self):
#         self.send_response(204)
#         self.send_header("Access-Control-Allow-Origin", "*")
#         self.send_header("Access-Control-Allow-Headers", "Content-Type")
#         self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
#         self.send_header("Content-Length", "0")
#         self.send_header("Connection", "close")
#         self.end_headers()

#     def do_POST(self):
#         try:
#             length = int(self.headers.get("Content-Length", 0))
#             raw_body = self.rfile.read(length)
#             data = json.loads(raw_body.decode("utf-8"))
            
#             prof_name = data.get("name", "Unknown")
#             print(f"\n[1/4] Received data from extension for: {prof_name}")
            
#             # Save backup to check.json
#             Path("check.json").write_text(json.dumps(data, indent=2), encoding="utf-8")

#             # Adapt data and parse to DataFrame
#             adapted_data = adapt_check_json_format(data)
#             df, metadata = parse_professor_data_to_df(adapted_data)

#             # Build reviews payload
#             cleaned_reviews_list = []
#             if not df.empty and "cleaned_review" in df.columns:
#                 for _, row in df.iterrows():
#                     date_str = row["date"].strftime("%Y-%m-%d") if pd.notnull(row["date"]) else "Unknown date"
#                     rating_str = row["rating"] if pd.notnull(row["rating"]) else "N/A"
#                     course_str = row.get("course", "Course")
#                     cleaned_reviews_list.append(
#                         f"[{date_str}] ({course_str}) Rating: {rating_str}/5 - \"{row['cleaned_review']}\""
#                     )

#             print(f"[2/4] Calling Gemini API for {prof_name} ({len(cleaned_reviews_list)} reviews)...")
#             summary = summarize_with_gemini(metadata, cleaned_reviews_list)
            
#             # Check if Gemini returned an error message
#             if summary.startswith("Error"):
#                 print(f"[!] Gemini returned an issue: {summary}")
#             else:
#                 print(f"[3/4] Successfully generated Gemini summary!")

#             Path("summary.txt").write_text(summary, encoding="utf-8")

#             print("[4/4] Sending summary back to Chrome extension...")
#             self._send_json(200, {"status": "success", "summary": summary})

#         except Exception as e:
#             print(f"[Server Error] {e}")
#             self._send_json(500, {"status": "error", "error": str(e)})

# if __name__ == "__main__":
#     api_key = os.getenv("GEMINI_API_KEY")
#     if not api_key:
#         print("\n WARNING: GEMINI_API_KEY is NOT set in this terminal!")
#         print("Set it before running: export GEMINI_API_KEY=\"your_key\"\n")
#     else:
#         print("\n GEMINI_API_KEY detected.")

#     print("TerpWhisper server listening on http://127.0.0.1:3000 ...")
#     HTTPServer(("127.0.0.1", 3000), Handler).serve_forever()