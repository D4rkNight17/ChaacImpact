// ==========================================================
// 🌐 ChaacImpact — Sistema de Idiomas (Simulador 3D)
// ==========================================================

document.addEventListener("DOMContentLoaded", () => {
  const savedLang = localStorage.getItem("lang") || "es";
  setLanguage(savedLang);
});

// ==========================================================
// 🈳 Traducción de elementos del HTML (data-es / data-en)
// ==========================================================
function setLanguage(lang) {
  // Traducción de textos
  document.querySelectorAll("[data-es][data-en]").forEach(el => {
    const text = el.getAttribute(`data-${lang}`);
    if (text) el.textContent = text;
  });

  // Traducción de placeholders
  document.querySelectorAll("input[data-es-placeholder][data-en-placeholder]").forEach(input => {
    const placeholder = input.getAttribute(`data-${lang}-placeholder`);
    if (placeholder) input.placeholder = placeholder;
  });

  localStorage.setItem("lang", lang);
}

