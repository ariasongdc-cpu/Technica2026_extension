const button = document.getElementById("analyze");
const nameInput = document.getElementById("professorName");
const status = document.getElementById("status");
const GEMINI_MODEL = "gemini-3.8-flash";

// Trigger analysis on button click
button.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) {
    setStatus("Please enter a professor's name.");
    return;
  }
  runAnalysis(name);
});

// Automatically check if the active tab is on PlanetTerp when popup opens
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const detectedName = await detectProfessorFromActiveTab();
    if (detectedName) {
      nameInput.value = detectedName;
      setStatus(`Detected: ${detectedName}. Running analysis...`);
      runAnalysis(detectedName);
    }
  } catch (err) {
    console.debug("Auto-detection skipped:", err);
  }
});

/**
 * Checks the active tab and extracts the professor's name if on PlanetTerp
 */
async function detectProfessorFromActiveTab() {
  if (!chrome.tabs || !chrome.tabs.query) return null;

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !activeTab.url) return null;

  // Check if we are on a PlanetTerp professor page: e.g. https://planetterp.com/professor/Larry_Herman
  const professorUrlPattern = /^https?:\/\/(?:www\.)?planetterp\.com\/professor\/([^/?#]+)/i;
  const match = activeTab.url.match(professorUrlPattern);

  if (!match) return null;

  // 1. Try reading the professor's name directly from the page DOM (h1 header)
  try {
    if (chrome.scripting) {
      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
          const h1 = document.querySelector("h1");
          if (h1 && h1.innerText.trim()) {
            return h1.innerText.trim();
          }
          // Fallback to title tag if h1 isn't available
          if (document.title) {
            return document.title.split(/[|\-]/)[0].trim();
          }
          return null;
        }
      });

      const extractedName = injectionResults?.[0]?.result;
      if (extractedName) return extractedName;
    }
  } catch (e) {
    console.warn("Script injection failed, using URL fallback:", e);
  }

  // 2. Fallback: Parse the slug from the URL (e.g., "Larry_Herman" -> "Larry Herman")
  const slug = match[1];
  return decodeURIComponent(slug).replace(/_/g, " ").trim();
}

/**
 * Main review fetching and Gemini analysis pipeline
 */
async function runAnalysis(name) {
  // 1. Retrieve the Gemini API key
  const apiKey = await getApiKey();
  if (!apiKey) {
    setStatus("Error: GEMINI_API_KEY not found in config.js or storage.");
    return;
  }

  // Show summary cards and hide initial greeting
  document.querySelectorAll(".summary-card").forEach((card) => {
    card.style.display = "block";
  });
  const initialCard = document.querySelector(".summary-card-initial");
  if (initialCard) initialCard.style.display = "none";

  setStatus("Fetching data from PlanetTerp...");
  resetCards();

  try {
    const params = new URLSearchParams({
      name: name,
      reviews: "true"
    });

    const ptResponse = await fetch(`https://planetterp.com/api/v1/professor?${params}`);
    if (!ptResponse.ok) {
      throw new Error(`PlanetTerp error: ${ptResponse.statusText || ptResponse.status}`);
    }

    const data = await ptResponse.json();
    if (data.error) throw new Error(data.error);

    const cleaned = cleanProfessor(data);
    setStatus("Generating AI summary with Gemini...");

    // 2. Call Gemini REST API directly
    const summaryText = await callGeminiDirectly(cleaned, apiKey);

    // 3. Fill cards with parsed output
    fillCards(cleaned, summaryText);
    setStatus("Analysis complete!");
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`);
    document.getElementById("sentimentSummary").textContent = `Error: ${error.message}`;
  }
}

/**
 * Gets API key from config.js (GitHub Secret) or chrome.storage
 */
async function getApiKey() {
  if (typeof CONFIG !== "undefined" && CONFIG.GEMINI_API_KEY) {
    return CONFIG.GEMINI_API_KEY.trim();
  }
  const storageData = await chrome.storage?.sync?.get(["geminiApiKey"]);
  return storageData?.geminiApiKey || null;
}

/**
 * Calls Google's Gemini REST API directly from the extension
 */
async function callGeminiDirectly(cleaned, apiKey) {
  const reviewsText = cleaned.recent_reviews
    .map((r) => `[${r.created}] (${r.course}) Rating: ${r.rating}/5 - "${r.review}"`)
    .join("\n");

  const prompt = `You are an academic advisor assistant at the University of Maryland (UMD).
Please analyze the following student reviews and metadata for ${cleaned.name}.

Metadata:
- Average Rating: ${cleaned.average_rating ?? "N/A"}
- Total Reviews Collected: ${cleaned.review_count}

Student Reviews:
${reviewsText || "No qualitative reviews available."}

Please provide a concise, structured summary separated by newlines including:
1. **Overall Sentiment**: General consensus from students.
2. **Key Strengths**: What professors/courses do particularly well.
3. **Common Pitfalls / Challenges**: Difficulties, workload concerns, or exams to watch out for.
4. **Actionable Advice for Students**: Tips for succeeding based on past student feedback.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error?.message || `Gemini API error (${response.status})`);
  }

  const result = await response.json();
  return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function setStatus(message) {
  if (status) status.textContent = message;
}

function resetCards() {
  document.getElementById("sentimentSummary").textContent = "Analyzing overall sentiment...";
  document.getElementById("strengthsSummary").textContent = "Analyzing key strengths...";
  document.getElementById("pitfallsSummary").textContent = "Analyzing common pitfalls...";
  document.getElementById("adviceSummary").textContent = "Analyzing actionable advice...";
}

function parseGeminiSummary(text) {
  if (!text) return {};

  const clean = (str) =>
    str
      .replace(/^\s*(?:#+|\d+\.|\*+)*\s*(?:Overall Sentiment|Key Strengths|Common Pitfalls|Challenges|Actionable Advice)[^\n:]*[:\-]?\s*/i, "")
      .trim();

  const getSection = (startRegex, endRegex) => {
    const regex = new RegExp(`${startRegex}[\\s\\S]*?(?=${endRegex}|$)`, "i");
    const match = text.match(regex);
    return match ? clean(match[0]) : "";
  };

  const sentiment = getSection("(?:1\\.|#+|\\*\\*).*?Overall Sentiment", "(?:2\\.|#+|\\*\\*).*?Key Strengths");
  const strengths = getSection("(?:2\\.|#+|\\*\\*).*?Key Strengths", "(?:3\\.|#+|\\*\\*).*?(?:Common Pitfalls|Challenges)");
  const pitfalls  = getSection("(?:3\\.|#+|\\*\\*).*?(?:Common Pitfalls|Challenges)", "(?:4\\.|#+|\\*\\*).*?Actionable Advice");
  const advice    = getSection("(?:4\\.|#+|\\*\\*).*?Actionable Advice", "$");
  const blocks = text.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);

  return {
    sentiment: sentiment || blocks[0] || "",
    strengths: strengths || blocks[1] || "",
    pitfalls:  pitfalls  || blocks[2] || "",
    advice:    advice    || blocks[3] || ""
  };
}

function fillCards(cleaned, summaryText) {
  const sections = parseGeminiSummary(summaryText);

  // 1. Overall Sentiment card
  const metaHeader = `${cleaned.name} (${cleaned.average_rating ?? "N/A"} ⭐ across ${cleaned.review_count} reviews)`;
  document.getElementById("sentimentSummary").textContent = [
    metaHeader,
    sections.sentiment || "No consensus text found."
  ]
    .filter(Boolean)
    .join("\n\n");

  // 2. Key Strengths card
  document.getElementById("strengthsSummary").textContent =
    sections.strengths || "No key strengths reported.";

  // 3. Common Pitfalls & Challenges card
  document.getElementById("pitfallsSummary").textContent =
    sections.pitfalls || "No major pitfalls reported.";

  // 4. Actionable Advice card
  document.getElementById("adviceSummary").textContent =
    sections.advice || "No specific advice reported.";
}

function cleanProfessor(data) {
  const reviews = (data.reviews || []).map((review) => ({
    course: review.course || "Unknown",
    rating: review.rating,
    created: review.created ? review.created.slice(0, 10) : "",
    review: (review.review || "").replace(/\s+/g, " ").trim()
  }));

  reviews.sort((a, b) => new Date(b.created) - new Date(a.created));

  const byCourse = new Map();
  for (const review of reviews) {
    const current = byCourse.get(review.course) || {
      course: review.course,
      count: 0,
      total: 0
    };
    current.count += 1;
    current.total += review.rating;
    byCourse.set(review.course, current);
  }

  const courses = [...byCourse.values()]
    .map((course) => ({
      course: course.course,
      count: course.count,
      avg: Math.round((course.total / course.count) * 100) / 100
    }))
    .sort((a, b) => b.count - a.count);

  return {
    name: data.name,
    slug: data.slug,
    average_rating: data.average_rating == null ? null : Math.round(data.average_rating * 100) / 100,
    review_count: reviews.length,
    courses: courses,
    recent_reviews: reviews.slice(0, 30)
  };
}