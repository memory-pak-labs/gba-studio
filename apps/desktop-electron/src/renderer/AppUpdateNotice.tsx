import React, { useEffect, useRef, useState } from "react";
import type { AppUpdateResult, AppUpdateState } from "../shared/appUpdates.js";
import { useStudioI18n } from "./i18n";
import { appUpdateText } from "./appUpdateText";
import { StudioButton } from "./studioUi";
import { useStudioUiText } from "./studioUiText";
import "./styles/app-updates.css";

export function AppUpdateNotice({ onRestart }: { onRestart(): Promise<AppUpdateResult> }): React.ReactElement | null {
  const { locale } = useStudioI18n();
  const ui = useStudioUiText();
  const text = appUpdateText(locale);
  const [state, setState] = useState<AppUpdateState>({ status: "idle", currentVersion: "" });
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restartError, setRestartError] = useState<string>();
  const restarting = useRef(false);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const unsubscribe = window.gbaStudio.onAppUpdateState((next) => {
      receivedEvent = true;
      if (!active) return;
      setState(next);
      if (next.status === "available" || next.status === "downloaded" || next.status === "error") setVisible(true);
    });
    void window.gbaStudio.getAppUpdateState().then((next) => {
      if (active && !receivedEvent) { setState(next); if (["available", "downloaded"].includes(next.status)) setVisible(true); }
    }).catch(() => { /* No automatic error notice during renderer shutdown. */ });
    const unsubscribeCommand = window.gbaStudio.onAppCommand((command) => {
      if (command !== "app:check-updates") return;
      setVisible(true);
      void window.gbaStudio.checkAppUpdates().then(setState).catch(() => setState({ status: "error", currentVersion: "" }));
    });
    return () => { active = false; unsubscribe(); unsubscribeCommand(); };
  }, []);

  async function restart(): Promise<void> {
    if (restarting.current) return;
    restarting.current = true; setBusy(true); setRestartError(undefined);
    try {
      const result = await onRestart();
      if (!result.ok && result.error) setRestartError(result.error);
    } catch { setRestartError(text.savingError); }
    finally { restarting.current = false; setBusy(false); }
  }
  async function run(action: "check" | "download"): Promise<void> {
    setRestartError(undefined);
    try { setState(await (action === "check" ? window.gbaStudio.checkAppUpdates() : window.gbaStudio.downloadAppUpdate())); }
    catch { setState({ status: "error", currentVersion: state.currentVersion }); }
  }

  if (!visible) return null;
  const installing = state.status === "installing";
  const heading = state.status === "available" ? text.available : state.status === "downloaded" ? text.downloaded : text.title;
  const message = state.status === "checking" ? text.checking : state.status === "downloading" ? text.downloading
    : state.status === "not-available" ? text.current : state.status === "disabled" ? text.disabled
    : state.status === "error" ? text.error : state.status === "idle" ? text.idle : text.hint;
  return <>
    {(busy || installing) && <div className="app-update-shield" aria-busy="true" />}
    <section className="app-update-notice" aria-label={text.title}>
      <div role="status" aria-live="polite">
        <h2>{heading}</h2>
        {state.currentVersion && <p className="app-update-version">{ui("GBA Studio")} {state.currentVersion}{state.version ? ` → ${state.version}` : ""}</p>}
        <p>{installing || busy ? text.preparing : message}</p>
      </div>
      {state.status === "downloading" && <><progress aria-label={text.downloading} value={state.progress ?? 0} max={100}>{state.progress ?? 0}%</progress><span aria-hidden="true">{state.progress ?? 0}%</span></>}
      {restartError && <p role="alert">{restartError}</p>}
      <div className="app-update-actions">
        <StudioButton disabled={busy || installing} onClick={() => setVisible(false)}>{text.later}</StudioButton>
        {state.status === "available" && <StudioButton variant="primary" onClick={() => void run("download")}>{text.download}</StudioButton>}
        {state.status === "downloaded" && <StudioButton variant="primary" disabled={busy} onClick={() => void restart()}>{text.restart}</StudioButton>}
        {["idle", "not-available", "error"].includes(state.status) && <StudioButton onClick={() => void run("check")}>{text.check}</StudioButton>}
      </div>
    </section>
  </>;
}
