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
      throw new Error(`Request failed: ${response.status}`);
    }

    const data = await response.json();

    status.textContent = "Data retrieved! Here's the raw response:";
    result.textContent = JSON.stringify(data, null, 2);
    console.log(data);
  } catch (error) {
    status.textContent = "Couldn't retrieve the data.";
    result.textContent = error.message;
  }
});
