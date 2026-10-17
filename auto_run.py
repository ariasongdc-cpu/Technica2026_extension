# not working as for now, don't use

# import json
# from http.server import BaseHTTPRequestHandler, HTTPServer
# from pathlib import Path
# from extension_to_api import adapt_check_json_format, parse_professor_data_to_df, summarize_with_gemini

# class Handler(BaseHTTPRequestHandler):
#     def do_OPTIONS(self):
#         self.send_response(204)
#         self.send_header("Access-Control-Allow-Origin", "*")
#         self.send_header("Access-Control-Allow-Headers", "Content-Type")
#         self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
#         self.end_headers()

#     def do_POST(self):
#         length = int(self.headers.get("Content-Length", 0))
#         data = json.loads(self.rfile.read(length))
        
#         # Save check.json
#         Path("check.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
        
#         # Automatically run Gemini pipeline
#         adapted_data = adapt_check_json_format(data)
#         df, metadata = parse_professor_data_to_df(adapted_data)
        
#         reviews_list = [
#             f"Rating: {row.get('rating', 'N/A')}/5 - \"{row.get('cleaned_review', '')}\""
#             for _, row in df.iterrows()
#         ]
        
#         summary = summarize_with_gemini(metadata, reviews_list)
#         Path("professor_summary.txt").write_text(summary, encoding="utf-8")

#         # Return summary to the Chrome extension
#         self.send_response(200)
#         self.send_header("Access-Control-Allow-Origin", "*")
#         self.send_header("Content-Type", "application/json")
#         self.end_headers()
#         self.wfile.write(json.dumps({"summary": summary}).encode("utf-8"))

# if __name__ == "__main__":
#     print("Server running on http://127.0.0.1:3000 ...")
#     HTTPServer(("127.0.0.1", 3000), Handler).serve_forever()