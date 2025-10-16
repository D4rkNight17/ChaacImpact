// Navbar background effect with glass blur and smooth transition
const navbar = document.querySelector(".navbar");

window.addEventListener("scroll", () => {
  if (window.scrollY > 50) {
    navbar.style.background = "rgba(17, 30, 45, 0.65)"; // tono translúcido Night Steel
    navbar.style.backdropFilter = "blur(16px)";
    navbar.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.25)";
  } else {
    navbar.style.background = "rgba(17, 30, 45, 0.9)";
    navbar.style.backdropFilter = "blur(8px)";
    navbar.style.boxShadow = "none";
  }
});


