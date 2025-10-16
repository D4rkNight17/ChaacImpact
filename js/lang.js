// Smooth fade language switcher 🇺🇸 / 🇲🇽
const langBtn = document.getElementById("lang-switch");
const flagIcon = document.getElementById("flag-icon");
let currentLang = localStorage.getItem("lang") || "en";

function setLanguage(lang) {
  const elements = document.querySelectorAll("[data-en]");
  elements.forEach(el => {
    el.classList.add("fade-out");
    setTimeout(() => {
      el.textContent = el.getAttribute(`data-${lang}`);
      el.classList.remove("fade-out");
    }, 200);
  });

  localStorage.setItem("lang", lang);
  flagIcon.src = lang === "en"
    ? "https://flagcdn.com/us.svg"
    : "https://flagcdn.com/mx.svg";
  flagIcon.alt = lang === "en" ? "English" : "Español";
}

langBtn.addEventListener("click", () => {
  currentLang = currentLang === "en" ? "es" : "en";
  setLanguage(currentLang);
});

window.addEventListener("DOMContentLoaded", () => setLanguage(currentLang));
