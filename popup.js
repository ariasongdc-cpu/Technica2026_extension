const button = document.getElementById("analyze");
const nameInput = document.getElementById("professorName");
const status = document.getElementById("status");
const result = document.getElementById("result");

button.addEventListener("click", async () => {
  const name = nameInput.value.trim();

  if (!name) {
    status.textContent = "Please enter a professor's name.";
    return;
  }

  Document.querySelectorAll(".summary-card").forEach(card =>{
    card.style.display = "block";
  });
  Document.querySelector(".summary-card-initial").style.display = "none";

  status.textContent = "Fetching professor data...";
  result.textContent = "";

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
    result.textContent = text;

    status.textContent = "Saving check.json...";

    const saveResponse = await fetch("http://127.0.0.1:3000/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: text
    });

    if (!saveResponse.ok) {
      throw new Error("The save server refused the file.");
    }

    status.textContent = "Saved organized check.json in the project folder.";
  } catch (error) {
    status.textContent = "Couldn't retrieve the data.";
    result.textContent = error.message;
  }
});

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