const analyzeBtn = document.getElementById("analyze");
const searchInput = document.getElementById("searchInput");
const status = document.getElementById("status");
const profModeBtn = document.getElementById("profModeBtn");
const courseModeBtn = document.getElementById("courseModeBtn");
const profContainer = document.getElementById("professorContainer");
const courseContainer = document.getElementById("courseContainer");
const initialGreeting = document.querySelector(".summary-card-initial");

const GEMINI_MODEL = "gemini-3.8-flash";
let currentMode = "professor"; // "professor" | "course"

// Mode tab selection
profModeBtn.addEventListener("click", () => setMode("professor"));
courseModeBtn.addEventListener("click", () => setMode("course"));

function setMode(mode) {
  currentMode = mode;
  if (mode === "professor") {
    profModeBtn.classList.add("active");
    courseModeBtn.classList.remove("active");
    searchInput.placeholder = "Enter professor's name";
  } else {
    courseModeBtn.classList.add("active");
    profModeBtn.classList.remove("active");
    searchInput.placeholder = "Enter class code (e.g. CMSC131)";
  }
}

// Handle analyze click
analyzeBtn.addEventListener("click", () => {
  const query = searchInput.value.trim();
  if (!query) {
    setStatus(`Please enter a ${currentMode === "professor" ? "professor name" : "class code"}.`);
    return;
  }

  // Auto-detect if user entered a class code pattern (e.g. "CMSC131" or "MATH 140")
  const isCourseCode = /^[A-Za-z]{4}\s*\d{3}[A-Za-z]?$/i.test(query);
  if (isCourseCode && currentMode === "professor") {
    setMode("course");
  }

  if (currentMode === "course" || isCourseCode) {
    runCourseAnalysis(query);
  } else {
    runProfessorAnalysis(query);
  }
});

// Auto-detection on page load
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const detected = await detectFromActiveTab();
    if (detected) {
      setMode(detected.type);
      searchInput.value = detected.name;
      setStatus(`Detected ${detected.type}: ${detected.name}. Analyzing...`);
      if (detected.type === "course") {
        runCourseAnalysis(detected.name);
      } else {
        runProfessorAnalysis(detected.name);
      }
    }
  } catch (err) {
    console.debug("Auto-detect skipped:", err);
  }
});

/**
 * Detects whether active tab is a PlanetTerp /professor/ or /course/ page
 */
async function detectFromActiveTab() {
  if (!chrome.tabs || !chrome.tabs.query) return null;

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !activeTab.url) return null;

  // 1. Check for Course page: e.g. planetterp.com/course/CMSC131
  const courseMatch = activeTab.url.match(/^https?:\/\/(?:www\.)?planetterp\.com\/course\/([^/?#]+)/i);
  if (courseMatch) {
    const code = decodeURIComponent(courseMatch[1]).toUpperCase().replace(/\s+/g, "");
    return { type: "course", name: code };
  }

  // 2. Check for Professor page: e.g. planetterp.com/professor/Larry_Herman
  const profMatch = activeTab.url.match(/^https?:\/\/(?:www\.)?planetterp\.com\/professor\/([^/?#]+)/i);
  if (profMatch) {
    let name = "";
    try {
      if (chrome.scripting) {
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => document.querySelector("h1")?.innerText?.trim() || null
        });
        name = result;
      }
    } catch (e) {
      console.warn("DOM extraction fallback:", e);
    }
    if (!name) {
      name = decodeURIComponent(profMatch[1]).replace(/_/g, " ").trim();
    }
    return { type: "professor", name };
  }

  return null;
}

/* ========================================================
   COURSE ANALYSIS PIPELINE
   ======================================================== */
async function runCourseAnalysis(courseQuery) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    setStatus("Error: GEMINI_API_KEY not found in config.js or storage.");
    return;
  }

  const cleanCourse = courseQuery.toUpperCase().replace(/\s+/g, "");
  prepareUIForCourse();
  setStatus(`Fetching ${cleanCourse} reviews from PlanetTerp...`);

  try {
    const ptResponse = await fetch(`https://planetterp.com/api/v1/course?name=${encodeURIComponent(cleanCourse)}&reviews=true`);
    if (!ptResponse.ok) {
      throw new Error(`PlanetTerp error: ${ptResponse.statusText || ptResponse.status}`);
    }

    const courseData = await ptResponse.json();
    if (courseData.error) throw new Error(courseData.error);

    setStatus("Summarizing professors with Gemini...");
    const summaries = await summarizeCourseProfessors(courseData, apiKey);

    renderCourseCards(courseData, summaries);
    setStatus(`Analysis complete for ${cleanCourse}!`);
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`);
    courseContainer.innerHTML = `<div class="summary-card avg" style="display:block;"><h2>Notice</h2><p>Error: ${error.message}</p></div>`;
  }
}

async function summarizeCourseProfessors(courseData, apiKey) {
  // Group reviews by professor
  const profReviews = {};
  for (const prof of courseData.professors || []) {
    profReviews[prof] = [];
  }
  for (const rev of courseData.reviews || []) {
    if (rev.professor) {
      if (!profReviews[rev.professor]) profReviews[rev.professor] = [];
      profReviews[rev.professor].push(rev);
    }
  }

  const allProfNames = Array.from(new Set([...(courseData.professors || []), ...Object.keys(profReviews)]));

  if (allProfNames.length === 0) {
    return [];
  }

  // Format context for each professor
  let contextText = "";
  for (const prof of allProfNames) {
    const reviews = profReviews[prof] || [];
    contextText += `\n### Professor: ${prof} (${reviews.length} reviews for this course)\n`;
    if (reviews.length === 0) {
      contextText += "No specific student reviews found for this course.\n";
    } else {
      // Limit to 8 recent reviews per professor to keep token usage efficient
      reviews.slice(0, 8).forEach((r) => {
        contextText += `- [Rating: ${r.rating ?? "N/A"}/5]: "${(r.review || "").replace(/\s+/g, " ").trim()}"\n`;
      });
    }
  }

  const prompt = `You are an academic advisor at the University of Maryland (UMD).
Analyze student feedback for each professor who teaches ${courseData.department}${courseData.course_number}: "${courseData.title || ''}" (Avg GPA: ${courseData.average_gpa ?? "N/A"}).

Student feedback per professor:
${contextText}

Instructions:
For EACH professor, write exactly ONE concise, self-contained summary paragraph (3-4 sentences) that covers:
1. Overall student sentiment and teaching style.
2. Exam fairness, project workload, or difficulty.
3. A practical tip/recommendation for succeeding with them.

Format your output strictly as:
### [Professor Name]
[One block summary paragraph here]`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error?.message || `Gemini API error (${response.status})`);
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Parse output blocks
  const blocks = rawText.split(/###\s*/).filter(Boolean);
  const parsed = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const profName = lines[0].replace(/[*#]/g, "").trim();
    const summary = lines.slice(1).join(" ").trim();
    if (profName && summary) {
      parsed.push({ name: profName, summary });
    }
  }
  return parsed;
}

function renderCourseCards(courseData, summaries) {
  courseContainer.innerHTML = "";

  // 1. Course overview card
  const headerCard = document.createElement("div");
  headerCard.className = "summary-card avg";
  headerCard.innerHTML = `
    <h2>⭒ ${courseData.department}${courseData.course_number || ""}: ${courseData.title || "Course Overview"}</h2>
    <p><strong>Average GPA:</strong> ${courseData.average_gpa ? courseData.average_gpa.toFixed(2) : "N/A"} &nbsp;|&nbsp; <strong>Credits:</strong> ${courseData.credits ?? "N/A"}<br>
    ${courseData.description ? courseData.description.slice(0, 150) + "..." : ""}</p>
  `;
  courseContainer.appendChild(headerCard);

  // 2. Professor summary cards
  const cardStyles = ["positive", "mixed", "avg", "negative"];

  if (summaries.length === 0) {
    const emptyCard = document.createElement("div");
    emptyCard.className = "summary-card mixed";
    emptyCard.innerHTML = `<h2>⭒ Professors</h2><p>No professor reviews were found for this course.</p>`;
    courseContainer.appendChild(emptyCard);
    return;
  }

  summaries.forEach((prof, i) => {
    const card = document.createElement("div");
    card.className = `summary-card ${cardStyles[i % cardStyles.length]}`;
    card.innerHTML = `
      <h2>⭒ ${prof.name}</h2>
      <p>${prof.summary}</p>
    `;
    courseContainer.appendChild(card);
  });
}

/* ========================================================
   PROFESSOR ANALYSIS PIPELINE
   ======================================================== */
async function runProfessorAnalysis(name) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    setStatus("Error: GEMINI_API_KEY not found in config.js or storage.");
    return;
  }

  prepareUIForProfessor();
  setStatus("Fetching data from PlanetTerp...");
  resetProfCards();

  try {
    const ptResponse = await fetch(`https://planetterp.com/api/v1/professor?name=${encodeURIComponent(name)}&reviews=true`);
    if (!ptResponse.ok) {
      throw new Error(`PlanetTerp error: ${ptResponse.statusText || ptResponse.status}`);
    }

    const data = await ptResponse.json();
    if (data.error) throw new Error(data.error);

    const cleaned = cleanProfessor(data);
    setStatus("Generating AI summary with Gemini...");

    const summaryText = await callGeminiDirectly(cleaned, apiKey);
    fillProfCards(cleaned, summaryText);
    setStatus("Analysis complete!");
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`);
    document.getElementById("sentimentSummary").textContent = `Error: ${error.message}`;
  }
}

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
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error?.message || `Gemini API error (${response.status})`);
  }

  const result = await response.json();
  return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

/* ========================================================
   HELPERS & UI UTILITIES
   ======================================================== */
async function getApiKey() {
  if (typeof CONFIG !== "undefined" && CONFIG.GEMINI_API_KEY) {
    return CONFIG.GEMINI_API_KEY.trim();
  }
  const storageData = await chrome.storage?.sync?.get(["geminiApiKey"]);
  return storageData?.geminiApiKey || null;
}

function setStatus(msg) {
  if (status) status.textContent = msg;
}

function prepareUIForProfessor() {
  if (initialGreeting) initialGreeting.style.display = "none";
  courseContainer.style.display = "none";
  profContainer.style.display = "block";
  profContainer.querySelectorAll(".summary-card").forEach((c) => (c.style.display = "block"));
}

function prepareUIForCourse() {
  if (initialGreeting) initialGreeting.style.display = "none";
  profContainer.style.display = "none";
  courseContainer.style.display = "block";
}

function resetProfCards() {
  document.getElementById("sentimentSummary").textContent = "Analyzing overall sentiment...";
  document.getElementById("strengthsSummary").textContent = "Analyzing key strengths...";
  document.getElementById("pitfallsSummary").textContent = "Analyzing common pitfalls...";
  document.getElementById("adviceSummary").textContent = "Analyzing actionable advice...";
}

function fillProfCards(cleaned, summaryText) {
  const sections = parseGeminiSummary(summaryText);
  const metaHeader = `${cleaned.name} (${cleaned.average_rating ?? "N/A"} ⭐ across ${cleaned.review_count} reviews)`;
  document.getElementById("sentimentSummary").textContent = [metaHeader, sections.sentiment || "No consensus text found."].filter(Boolean).join("\n\n");
  document.getElementById("strengthsSummary").textContent = sections.strengths || "No key strengths reported.";
  document.getElementById("pitfallsSummary").textContent = sections.pitfalls || "No major pitfalls reported.";
  document.getElementById("adviceSummary").textContent = sections.advice || "No specific advice reported.";
}

function parseGeminiSummary(text) {
  if (!text) return {};
  const clean = (str) => str.replace(/^\s*(?:#+|\d+\.|\*+)*\s*(?:Overall Sentiment|Key Strengths|Common Pitfalls|Challenges|Actionable Advice)[^\n:]*[:\-]?\s*/i, "").trim();
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

function cleanProfessor(data) {
  const reviews = (data.reviews || []).map((review) => ({
    course: review.course || "Unknown",
    rating: review.rating,
    created: review.created ? review.created.slice(0, 10) : "",
    review: (review.review || "").replace(/\s+/g, " ").trim()
  }));

  reviews.sort((a, b) => new Date(b.created) - new Date(a.created));

  return {
    name: data.name,
    average_rating: data.average_rating == null ? null : Math.round(data.average_rating * 100) / 100,
    review_count: reviews.length,
    recent_reviews: reviews.slice(0, 30)
  };
}