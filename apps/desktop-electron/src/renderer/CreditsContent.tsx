import { Cpu, Heart, Sparkles, UserRound } from "lucide-react";

import { useStudioI18n } from "./i18n";

export function CreditsContent({ className = "welcome-credits-content" }: { className?: string }): React.ReactElement {
  const { t } = useStudioI18n();

  return (
    <div className={className}>
      <article className="welcome-credits-card welcome-credits-about">
        <h3><Sparkles aria-hidden="true" size={16} />{t("credits.aboutTitle")}</h3>
        <p>{t("credits.aboutBody")}</p>
      </article>

      <article className="welcome-credits-card welcome-credits-creator">
        <h3><UserRound aria-hidden="true" size={16} />{t("credits.creatorTitle")}</h3>
        <strong>Matheus Melo</strong>
        <span>{t("credits.creatorRole")}</span>
      </article>

      <article className="welcome-credits-card welcome-credits-thanks">
        <h3><Heart aria-hidden="true" size={16} />{t("credits.thanksTitle")}</h3>
        <dl>
          <div>
            <dt>GB Studio</dt>
            <dd>{t("credits.gbStudio")}</dd>
          </div>
          <div>
            <dt>Butano</dt>
            <dd>{t("credits.butano")}</dd>
          </div>
          <div>
            <dt>Tonc</dt>
            <dd>{t("credits.tonc")}</dd>
          </div>
          <div>
            <dt>devkitPro / devkitARM</dt>
            <dd>{t("credits.devkit")}</dd>
          </div>
          <div>
            <dt>mGBA</dt>
            <dd>{t("credits.mgba")}</dd>
          </div>
        </dl>
      </article>

      <footer className="welcome-credits-legal">
        <Cpu aria-hidden="true" size={15} />
        <p>{t("credits.legal")}</p>
      </footer>
    </div>
  );
}
