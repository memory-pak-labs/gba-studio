import { Moon, Sun } from "lucide-react";
import { toggleStudioTheme } from "../shared/studioTheme";
import { useStudioTheme } from "./useStudioTheme";
import { useStudioI18n } from "./i18n";

type StudioThemeToggleProps = {
  className?: string;
};

export function StudioThemeToggle({ className }: StudioThemeToggleProps): React.ReactElement {
  const { t } = useStudioI18n();
  const { theme, setTheme } = useStudioTheme();

  function handleToggle(): void {
    setTheme(toggleStudioTheme(theme));
  }

  const isDark = theme === "dark";

  return (
    <button
      aria-label={isDark ? t("theme.activateLight") : t("theme.activateDark")}
      aria-pressed={isDark}
      className={["theme-toggle-button", className].filter(Boolean).join(" ")}
      onClick={handleToggle}
      title={isDark ? t("theme.light") : t("theme.dark")}
      type="button"
    >
      {isDark ? (
        <Sun aria-hidden="true" size={16} strokeWidth={2.3} />
      ) : (
        <Moon aria-hidden="true" size={16} strokeWidth={2.3} />
      )}
      <span className="topbar-action-label">{isDark ? t("theme.light") : t("theme.dark")}</span>
    </button>
  );
}
