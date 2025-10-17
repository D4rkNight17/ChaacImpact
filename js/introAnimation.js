  window.addEventListener("load", () => {
    const hero = document.querySelector(".hero");
    const navbar = document.querySelector(".navbar");

    // Inicia la animación del hero
    hero.classList.add("fade-in");

    // Espera el tiempo total del fade del hero (≈1.2 s)
    setTimeout(() => {
      navbar.classList.add("show");
    }, 1200); // puedes ajustar este tiempo si cambias la duración del hero
  });