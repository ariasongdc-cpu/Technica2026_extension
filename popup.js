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
    const text = JSON.stringify(data, null, 2);

    result.textContent = text;

    const saveResponse = await fetch("http://localhost:3000/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: text
    });

    if (!saveResponse.ok) {
      throw new Error("Could not save check.json");
    }

    status.textContent = "Saved check.json in the project folder.";
    console.log(data);
  } catch (error) {
    status.textContent = "Couldn't retrieve the data.";
    result.textContent = error.message;
  }
});