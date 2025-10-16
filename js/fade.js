window.addEventListener("load", () => {
  const chaac = document.getElementById("chaac");
  const impact = document.getElementById("impact");

  setTimeout(() => {
    chaac.style.opacity = 1;
    chaac.style.transform = "translateY(0)";
  }, 700);

  setTimeout(() => {
    impact.style.opacity = 1;
    impact.style.transform = "translateY(0)";
  }, 2000);
});

