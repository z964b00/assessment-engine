const API = "/api/assessment-generator.js?url=";
const link = document.getElementById("link");
const genBtn = document.getElementById("generate");
const loadDiv = document.getElementById("loading");
const quizForm = document.getElementById("quizForm");
const completeBtn = document.getElementById("complete");
const clearBtn = document.getElementById("clear");
const resultsPre = document.getElementById("results");

let currentAnswers = []; // e.g., ["A", "C", "D"]

genBtn.onclick = async () => {
  const url = link.value.trim();
  if (!url) return alert("Enter a link first.");
  loadDiv.classList.remove("hidden");
  genBtn.disabled = true;

  const res = await fetch(API + encodeURIComponent(url));
  const data = await res.json();
  loadDiv.classList.add("hidden");
  genBtn.disabled = false;

  if (data.error) return alert(data.error);

  // Render questions
  quizForm.innerHTML = "";
  const lines = data.quiz.split("\n").filter(Boolean);
  currentAnswers = [];
  lines.forEach((line) => {
    if (line.match(/^Q\d/i)) {
      const q = document.createElement("p");
      q.textContent = line;
      quizForm.appendChild(q);
    } else if (line.match(/^[A-D]\./)) {
      const radio = document.createElement("input");
      const label = document.createElement("label");
      const letter = line[0]; // A/B/C/D
      const questionNum = quizForm.querySelectorAll("p").length - 1;
      radio.type = "radio";
      radio.name = "q" + questionNum;
      radio.value = letter;
      label.textContent = " " + line;
      quizForm.appendChild(radio);
      quizForm.appendChild(label);
      quizForm.appendChild(document.createElement("br"));
    } else if (line.startsWith("Answer:")) {
      currentAnswers.push(line.replace("Answer: ", "").trim());
    }
  });

  quizForm.classList.remove("hidden");
  completeBtn.classList.remove("hidden");
  clearBtn.classList.remove("hidden");
  resultsPre.textContent = "";
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
  output += `\nTotal score: ${correct}/3\n`;
  resultsPre.textContent = output;

  // store temporary score in sessionStorage (Phase 3 will move to Supabase)
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