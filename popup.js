const button = document.getElementById("analyze");
const nameInput = document.getElementById("professorName");
const status = document.getElementById("status");
const GEMINI_MODEL = "gemini-3.8-flash";

button.addEventListener("click", async () => {
  const name = nameInput.value.trim();

  if (!name) {
    setStatus("Please enter a professor's name.");
    return;
  }

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

    // 3. Call Gemini REST API directly (no Python needed)
    const summaryText = await callGeminiDirectly(cleaned, apiKey);

    // 4. Fill cards with parsed output
    fillCards(cleaned, summaryText);
    setStatus("Analysis complete!");
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`);
    document.getElementById("sentimentSummary").textContent = `Error: ${error.message}`;
  }
});

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