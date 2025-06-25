const API = "/api/assessment-generator?url=";
const link = document.getElementById("link");
const genBtn = document.getElementById("generate");
const loadDiv = document.getElementById("loading");
const quizForm = document.getElementById("quizForm");
const completeBtn = document.getElementById("complete");
const clearBtn = document.getElementById("clear");
const resultsPre = document.getElementById("results");

let currentAnswers = [];

genBtn.onclick = async () => {
  const url = link.value.trim();
  if (!url) return alert("Enter a link first.");
  loadDiv.classList.remove("hidden");
  genBtn.disabled = true;
  resultsPre.textContent = "";

  try {
    const res = await fetch(API + encodeURIComponent(url));
    const data = await res.json();
    console.log("Fetched quiz:", data);

    loadDiv.classList.add("hidden");
    genBtn.disabled = false;

    if (data.error) return alert(data.error);
    if (!data.questions || !Array.isArray(data.questions)) {
      throw new Error("Quiz is not formatted as expected.");
    }

    // Render the quiz
    quizForm.innerHTML = "";
    currentAnswers = [];

    data.questions.forEach((q, index) => {
      const fieldset = document.createElement("fieldset");

      const legend = document.createElement("legend");
      legend.textContent = `Q${index + 1}. ${q.question}`;
      fieldset.appendChild(legend);

      q.options.forEach((option, optIndex) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        const letter = String.fromCharCode(65 + optIndex); // A, B, C, D...

        input.type = "radio";
        input.name = `q${index}`;
        input.value = letter;

        label.appendChild(input);
        label.appendChild(document.createTextNode(` ${letter}. ${option}`));
        fieldset.appendChild(label);
        fieldset.appendChild(document.createElement("br"));
      });

      currentAnswers.push(q.answer.toUpperCase());
      quizForm.appendChild(fieldset);
    });

    quizForm.classList.remove("hidden");
    completeBtn.classList.remove("hidden");
    clearBtn.classList.remove("hidden");
  } catch (err) {
    console.error("❌ Error rendering quiz:", err);
    resultsPre.textContent = "❌ Failed to render quiz. See console for details.";
    loadDiv.classList.add("hidden");
    genBtn.disabled = false;
  }
};

completeBtn.onclick = () => {
  const chosen = [];
  currentAnswers.forEach((_, i) => {
    const picked = (
      quizForm.querySelector(`input[name="q${i}"]:checked`) || {}
    ).value;
    chosen.push(picked || "?");
  });

  let correct = 0;
  let output = "";
  chosen.forEach((pick, i) => {
    const isRight = pick === currentAnswers[i];
    if (isRight) correct++;
    output += `Q${i + 1}: You picked ${pick}. ${
      isRight ? "✔️ Correct!" : `❌ Wrong (Correct: ${currentAnswers[i]})`
    }\n`;
  });
  output += `\nTotal score: ${correct}/${currentAnswers.length}\n`;
  resultsPre.textContent = output;

  sessionStorage.setItem("latestScore", correct);
};

clearBtn.onclick = () => {
  quizForm.classList.add("hidden");
  completeBtn.classList.add("hidden");
  clearBtn.classList.add("hidden");
  resultsPre.textContent = "";
  quizForm.innerHTML = "";
  link.value = "";
};