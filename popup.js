const button = document.getElementById("analyze");
const nameInput = document.getElementById("professorName");
const status = document.getElementById("status");
const result = document.getElementById("result");

button.addEventListener("click", async () => {
  const name = nameInput.value.trim();

  if (!name) {
    setStatus("Please enter a professor's name.");
    return;
  }

  document.querySelectorAll(".summary-card").forEach((card) => {
    card.style.display = "block";
  });
  document.querySelector(".summary-card-initial").style.display = "none";

  setStatus("Fetching professor data...");
  setResult("");

  try {
    const params = new URLSearchParams({
      name: name,
      reviews: "true"
    });

    const response = await fetch(
      `https://planetterp.com/api/v1/professor?${params}`
    );

    if (!response.ok) {
      throw new Error(`PlanetTerp request failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    const cleaned = cleanProfessor(data);
    const text = JSON.stringify(cleaned, null, 2);

    fillCards(cleaned);
    setResult(text);
    setStatus("Saving check.json...");

    const saveResponse = await fetch("http://127.0.0.1:3000/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: text
    });

    if (!saveResponse.ok) {
      throw new Error("The save server refused the file.");
    }

    setStatus("Saved organized check.json in the project folder.");
  } catch (error) {
    setStatus("Couldn't retrieve the data.");
    setResult(error.message);
  }
});

function setStatus(message) {
  if (status) status.textContent = message;
}

function setResult(message) {
  if (result) result.textContent = message;
}

function fillCards(cleaned) {
  document.getElementById("averageRating").textContent =
    `${cleaned.name}: ${cleaned.average_rating} stars from ${cleaned.review_count} reviews.`;

  const best = [...cleaned.courses].sort((a, b) => b.avg - a.avg)[0];
  const worst = [...cleaned.courses].sort((a, b) => a.avg - b.avg)[0];

  document.getElementById("positiveSummary").textContent = best
    ? `${best.course} has the highest average, ${best.avg}, from ${best.count} reviews.`
    : "No course ratings yet.";

  document.getElementById("negativeSummary").textContent = worst
    ? `${worst.course} has the lowest average, ${worst.avg}, from ${worst.count} reviews.`
    : "No course ratings yet.";

  document.getElementById("mixedSummary").textContent =
    "check.json has the 30 newest reviews ready for the Gemini summary.";
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
    created: review.created.slice(0, 10),
    course: review.course,
    rating: review.rating,
    review: review.review
  }));

  const rating = data.average_rating;

  return {
    name: data.name,
    slug: data.slug,
    average_rating: rating == null ? null : Math.round(rating * 100) / 100,
    review_count: reviews.length,
    courses: courses,
    recent_reviews: recentReviews
  };
}