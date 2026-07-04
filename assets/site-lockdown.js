(function () {
  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  ["copy", "cut", "paste", "selectstart", "dragstart", "contextmenu"].forEach((type) => {
    document.addEventListener(type, stop, true);
  });

  document.addEventListener(
    "keydown",
    (event) => {
      const key = event.key.toLowerCase();
      const modifier = event.metaKey || event.ctrlKey;

      if (modifier && ["a", "c", "x", "v", "s", "u", "p"].includes(key)) {
        stop(event);
      }
    },
    true
  );
})();
