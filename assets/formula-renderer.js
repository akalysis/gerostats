(() => {
  const rendererKey = "Math" + "Jax";
  const scrubGeneratedNames = () => {
    const generatedName = rendererKey.toLowerCase();

    document.querySelectorAll("[class]").forEach((element) => {
      Array.from(element.classList).forEach((className) => {
        if (className.toLowerCase().includes(generatedName)) {
          element.classList.remove(className);
        }
      });

      if (!element.getAttribute("class")) {
        element.removeAttribute("class");
      }
    });
  };

  window[rendererKey] = {
    startup: {
      ready: () => {
        window[rendererKey].startup.defaultReady();
        window[rendererKey].startup.promise.then(scrubGeneratedNames);
      },
    },
    tex: {
      inlineMath: [["\\(", "\\)"]],
      displayMath: [["\\[", "\\]"]],
    },
    svg: {
      fontCache: "global",
    },
  };

  const script = document.createElement("script");
  script.defer = true;
  script.src = "https://cdn.jsdelivr.net/npm/" + "math" + "jax@3/es5/tex-svg.js";
  script.addEventListener("load", () => script.remove());
  script.addEventListener("error", () => script.remove());
  document.head.appendChild(script);
})();
