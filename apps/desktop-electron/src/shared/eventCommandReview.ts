/** Product decisions for retained historical definitions, independent of native support. */
export type EventCommandReviewDecision = "candidate" | "specialized" | "defer";
export interface EventCommandReview {
  readonly decision: EventCommandReviewDecision;
  readonly title: string;
  readonly reason: string;
  readonly message: string;
  /** Similar authored actions, never automatic aliases or equivalent runtime semantics. */
  readonly alternatives: readonly string[];
}
// The 26 historical definitions now have authored contracts and native consumers.
export function eventCommandReview(_verb: string): EventCommandReview | null { return null; }
