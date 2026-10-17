const button = document.getElementById("analyze");
const nameInput = document.getElementById("professorName");
const status = document.getElementById("status");

button.addEventListener("click", async () => {
  const name = nameInput.value.trim();

  if (!name) {
    setStatus("Please enter a professor's name.");
    return;
  }

  // Display cards and hide greeting
  document.querySelectorAll(".summary-card").forEach((card) => {
    card.style.display = "block";
  });
  const initialCard = document.querySelector(".summary-card-initial");
  if (initialCard) initialCard.style.display = "none";

  setStatus("Fetching reviews from PlanetTerp...");
  resetCards();

  try {
    const params = new URLSearchParams({
      name: name,
      reviews: "true"
    });

    const response = await fetch(
      `https://planetterp.com/api/v1/professor?${params}`
    );

    if (!response.ok) {
      throw new Error(`PlanetTerp error: ${response.statusText || response.status}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    const cleaned = cleanProfessor(data);
    setStatus("Generating AI summary with Gemini (approx. 3-5s)...");

    // Send to local server
    const saveResponse = await fetch("http://127.0.0.1:3000/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleaned, null, 2)
    });

    if (!saveResponse.ok) {
      throw new Error(`Server returned HTTP ${saveResponse.status}`);
    }

    const serverData = await saveResponse.json();

    if (serverData.error) {
      throw new Error(serverData.error);
    }

    const summaryText = serverData.summary || "";

    // If Gemini returned an error string instead of a summary
    if (summaryText.startsWith("Error")) {
      throw new Error(summaryText);
    }

    // Populate cards
    fillCards(cleaned, summaryText);
    setStatus("Analysis complete!");
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`);
    document.getElementById("sentimentSummary").textContent = `Error: ${error.message}`;
  }
});

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

  // Fallback: if regex missed headers, divide into paragraph blocks
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
    created: review.created,
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

  const recentReviews = reviews.slice(0, 30).map((review) => ({
    created: review.created ? review.created.slice(0, 10) : "",
    course: review.course,
    rating: review.rating,
    review: review.review
  }));

  return {
    name: data.name,
    slug: data.slug,
    average_rating: data.average_rating == null ? null : Math.round(data.average_rating * 100) / 100,
    review_count: reviews.length,
    courses: courses,
    recent_reviews: recentReviews
  };
}