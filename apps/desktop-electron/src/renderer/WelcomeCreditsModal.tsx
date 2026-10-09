import { Sparkles, X } from "lucide-react";
import { useEffect } from "react";

import { CreditsContent } from "./CreditsContent";
import { useStudioI18n } from "./i18n";

interface WelcomeCreditsModalProps {
  onClose: () => void;
}

export function WelcomeCreditsModal({ onClose }: WelcomeCreditsModalProps): React.ReactElement {
  const { t } = useStudioI18n();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop welcome-credits-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="welcome-credits-title"
        aria-modal="true"
        className="modal-card welcome-credits-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-card-header welcome-credits-header">
          <span className="welcome-credits-heading-icon" aria-hidden="true"><Sparkles size={18} /></span>
          <div>
            <h2 id="welcome-credits-title">{t("credits.title")}</h2>
            <p>{t("credits.subtitle")}</p>
          </div>
          <button
            autoFocus
            aria-label={t("credits.close")}
            className="icon-button welcome-credits-close"
            type="button"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <CreditsContent />
      </section>
    </div>
  );
}
