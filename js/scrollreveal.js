// === ChaacImpact Section Animations ===
document.addEventListener("DOMContentLoaded", () => {
  const hero = document.querySelector(".hero");
  const sections = document.querySelectorAll(".simulators, .game-section");

  // 🪄 Animación inicial solo para el hero
  if (hero) {
    hero.classList.add("fade-in");
  }

  // 🎬 Reveal para las demás secciones al hacer scroll
  const revealOnScroll = () => {
    sections.forEach(section => {
      const rect = section.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.80) {
        section.classList.add("visible");
      }
    });
  };

  window.addEventListener("scroll", revealOnScroll);
  revealOnScroll();
});