import { CollaborativeGraderKind, CollaborativeGradingServerStrategy } from "./CollaborativeGradingTypes";
import { FITB_DROP_GRADING_STRATEGY } from "./FITBDropGradingServerStrategy";



export function collaborativeGradingStrategy<CGKind extends CollaborativeGraderKind>(kind: CGKind): CollaborativeGradingServerStrategy<CGKind> {
  switch (kind) {
    case "standard_fitb_drop": return FITB_DROP_GRADING_STRATEGY as CollaborativeGradingServerStrategy<CGKind>;
    default:
      throw new Error(`No collaborative grading strategy implemented for grader kind ${kind}`);
  }
}
