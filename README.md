# TerpWhisper ⭒

> **Understand your professors and courses in a whisper.**  
> An AI-powered Chrome Extension for University of Maryland (UMD) students that transforms long PlanetTerp review threads into actionable, structured insights using Google Gemini.

---

## ✨ Features

- **⚡ Instant PlanetTerp Auto-Detection:** Automatically detects when you are browsing a professor (`/professor/...`) or course (`/course/...`) page on [PlanetTerp](https://planetterp.com) and initiates analysis without requiring manual input.
- **👨‍🏫 Professor Deep-Dives:** Generates structured breakdowns for any instructor:
  - **Overall Sentiment:** Broad consensus from student experiences.
  - **Key Strengths:** Teaching clarity, office hours support, and engagement.
  - **Common Pitfalls & Challenges:** Exam difficulty, project workloads, or quirks to watch out for.
  - **Actionable Advice:** Specific student tips for succeeding in the class.
- **📚 Course-Wide Instructor Comparison:** Look up a course code (e.g., `CMSC131`, `MATH140`) to view overall GPA, credit count, and concise 3–4 sentence comparison summaries for every professor who teaches it.
- **🔒 Secure & Private API Key Storage:** Your Google Gemini API key is stored locally in your browser's encrypted `chrome.storage.sync`. Keys are never committed to Git, baked into extension packages, or routed through third-party telemetry.

---

## 📸 Preview

```text
+------------------------------------------+
| ⭒ TerpWhisper                         ⚙️ |
| Understand your professors and classes...|
| [ Professor ]  [ Class ]                 |
| [ Enter professor's name               ] |
| [            analyze reviews           ] |
|                                          |
| ⭒ Overall Sentiment                      |
| Larry Herman (4.2 ⭐ across 180 reviews)  |
| Students praise rigorous assignments...  |
+------------------------------------------+
```

---

## 🚀 Installation & Setup

### 1. Get a Free Gemini API Key
TerpWhisper uses Google's Gemini API to analyze review sentiment:
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account and click **Get API key**.
3. Create a free key and copy it.

### 2. Install the Extension in Chrome
1. Download the latest zip file from the 'Actions' tab and extract all files.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click **Load unpacked** in the top left corner.
5. Select the extracted project folder.

### 3. Add Your API Key
1. Click the **TerpWhisper** icon in your Chrome toolbar to open the popup.
2. Click the gear icon (**⚙️**) in the top right corner.
3. Paste your Gemini API key into the input box and click **Save**.

---

## 💡 Tech Stack

- **Platform:** Chrome Extension Manifest V3
- **Languages:** JavaScript (ES6+), HTML5, CSS3 (Glassmorphism & Radial Gradients)
- **AI Model:** `gemini-3.8-flash` via Google Generative Language API
- **Data Source:** [PlanetTerp API](https://planetterp.com/api)
