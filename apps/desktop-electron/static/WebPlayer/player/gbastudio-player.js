(function () {
  "use strict";

  function nonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
  }

  function mount(config) {
    const mountTarget = document.querySelector(nonEmptyString(config && config.mount));
    const runtimeUrl = nonEmptyString(config && config.runtimeUrl);
    const runtimeRomUrl = nonEmptyString(config && config.runtimeRomUrl);

    if (!mountTarget || !runtimeUrl || !runtimeRomUrl) {
      console.error("GBA Studio Player nao recebeu configuracao valida.");
      return null;
    }

    const frameUrl = new URL(runtimeUrl, document.baseURI);
    frameUrl.searchParams.set("rom", runtimeRomUrl);
    frameUrl.searchParams.set("title", nonEmptyString(config.title) || "GBA Studio");
    frameUrl.searchParams.set("color", nonEmptyString(config.color) || "#6d2df4");

    const frame = document.createElement("iframe");
    frame.className = "gba-studio-player-frame";
    frame.title = `Jogar ${nonEmptyString(config.title) || "GBA Studio"}`;
    frame.allow = "autoplay; fullscreen; gamepad";
    frame.src = frameUrl.toString();
    mountTarget.replaceChildren(frame);
    mountTarget.dataset.player = "gbastudio";

    return frame;
  }

  window.GBAStudioPlayer = Object.freeze({ mount });

  const config = window.GBAStudioPlayerConfig;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { mount(config); }, { once: true });
  } else {
    mount(config);
  }
})();
