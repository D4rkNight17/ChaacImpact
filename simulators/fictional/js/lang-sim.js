// ==========================================================
// 🌐 ChaacImpact — Language Sync Script (Simulador 3D)
// ==========================================================

document.addEventListener("DOMContentLoaded", () => {
  const savedLang = localStorage.getItem("lang") || "es";
  setLanguage(savedLang);
});

function setLanguage(lang) {
  const elements = document.querySelectorAll("[data-en]");
  elements.forEach(el => {
    // 🚫 Evitar solo el burger
    if (el.classList.contains("burger-toggle")) {
      el.title = el.getAttribute(`data-${lang}`);
      return;
    }

    // ✅ Traducir texto normal
    el.textContent = el.getAttribute(`data-${lang}`);
  });

  // ✅ Traducir placeholders
  document.querySelectorAll("input[data-en-placeholder]").forEach(input => {
    const placeholderText = input.getAttribute(`data-${lang}-placeholder`);
    if (placeholderText) input.placeholder = placeholderText;
  });

  // ✅ Guardar idioma actual
  localStorage.setItem("lang", lang);
}