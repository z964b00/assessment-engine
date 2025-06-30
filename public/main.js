const supa = supabase.createClient(
  "https://hwkcqsxqccjevteicolq.supabase.co",
  "***REMOVED***"
);

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
  window.currentSubject = data.subject || "General";
  loadDiv.classList.add("hidden");
  genBtn.disabled = false;

  if (data.error) {
    resultsPre.textContent = "⚠️ " + data.error;
    return;
  }

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

completeBtn.onclick = async () => {
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

  const subject = window.currentSubject || "General";
  await supa.from("quiz_scores").insert([{ subject, score: correct }]);
  updateScoreboard();

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

async function updateScoreboard() {
  const { data, error } = await supa
    .from("quiz_scores")
    .select("subject, score");
  if (error) return console.error(error);

  // Aggregate totals
  const totals = {};
  data.forEach(({ subject, score }) => {
    totals[subject] = (totals[subject] || 0) + score;
  });

  const list = document.getElementById("scores");
  list.innerHTML = "";
  Object.entries(totals).forEach(([subj, pts]) => {
    const li = document.createElement("li");
    li.textContent = `${subj}: ${pts} pts`;
    list.appendChild(li);
  });
}

// Call once on page load
updateScoreboard();