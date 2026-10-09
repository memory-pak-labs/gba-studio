import { ExternalLink, Heart, Sparkles } from "lucide-react";

import { useStudioI18n } from "./i18n";

const references = [
  {
    description: "Projeto de Chris Maltby e sua comunidade, referência essencial para fluxos de autoria visual e acessibilidade na criação de jogos.",
    href: "https://github.com/chrismaltby/gb-studio",
    name: "GB Studio"
  },
  {
    description: "Engine moderna para Game Boy Advance que serviu como referência técnica durante a evolução da engine própria.",
    href: "https://github.com/gvaliente/butano",
    name: "Butano"
  },
  {
    description: "Guia comunitário de programação do Game Boy Advance usado como referência de hardware, vídeo e sprites.",
    href: "https://github.com/gbadev-org/tonc",
    name: "Tonc"
  }
] as const;

export function CreditsReferencesPanel({ compact = false }: { compact?: boolean }): React.ReactElement {
  const { t } = useStudioI18n();

  return (
    <section aria-label={t("credits.referencesTitle")} className={compact ? "credits-references-panel compact" : "credits-references-panel"}>
      <div className="credits-references-heading">
        <span aria-hidden="true"><Sparkles size={16} /></span>
        <div>
          <strong>{t("credits.referencesTitle")}</strong>
          <p>{t("credits.referencesSubtitle")}</p>
        </div>
      </div>
      <div className="credits-references-list">
        {references.map((reference) => (
          <article key={reference.name}>
            <div>
              <strong>{reference.name}</strong>
              <p>{reference.name === "GB Studio" ? t("credits.gbStudio") : reference.name === "Butano" ? t("credits.butano") : t("credits.tonc")}</p>
            </div>
            <a href={reference.href} rel="noreferrer" target="_blank">
              <ExternalLink aria-hidden="true" size={14} />
              <span>{t("credits.openSource")}</span>
            </a>
          </article>
        ))}
      </div>
      {!compact ? (
        <p className="credits-references-legal">
          <Heart aria-hidden="true" size={14} />
          <span>{t("credits.legal")}</span>
        </p>
      ) : null}
    </section>
  );
}
