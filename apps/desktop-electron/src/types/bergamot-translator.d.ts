declare module "@browsermt/bergamot-translator/translator.js" {
  export interface TranslationRequest {
    from: string;
    to: string;
    text: string;
    html?: boolean;
    qualityScores?: boolean;
  }

  export interface TranslationResponse {
    target: { text: string };
  }

  export class LatencyOptimisedTranslator {
    constructor(options?: {
      pivotLanguage?: string | null;
      registryUrl?: string;
      downloadTimeout?: number;
      cacheSize?: number;
    });
    translate(request: TranslationRequest): Promise<TranslationResponse>;
    delete(): void;
  }
}
