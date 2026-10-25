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
    const romSha256 = nonEmptyString(config.romSha256);
    if (/^[a-f0-9]{64}$/.test(romSha256)) frameUrl.searchParams.set("battery", romSha256);
    if (config.touchControls === true) frameUrl.searchParams.set("touch", "1");

    const frame = document.createElement("iframe");
    frame.className = "gba-studio-player-frame";
    frame.title = `Jogar ${nonEmptyString(config.title) || "GBA Studio"}`;
    frame.allow = "autoplay; fullscreen; gamepad";
    frame.src = frameUrl.toString();
    // Relay only this runtime's bounded battery messages. The host keeps the sandbox opaque.
    const pending = new Set();
    window.addEventListener("message", function (event) {
      const data = event.data;
      if (event.source === frame.contentWindow && data?.type === "gbastudio:battery:request") {
        if (window.parent === window || pending.size >= 64 || typeof data.requestId !== "string" || data.requestId.length > 100 || data.romSha256 !== romSha256 || !["read", "write"].includes(data.operation) || data.operation === "write" && (typeof data.value !== "string" || data.value.length > 176000)) return;
        pending.add(data.requestId);
        window.parent.postMessage(data, "*");
      } else if (event.source === window.parent && data?.type === "gbastudio:battery:response" && pending.delete(data.requestId)) {
        frame.contentWindow?.postMessage(data, "*");
      }
    });
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
