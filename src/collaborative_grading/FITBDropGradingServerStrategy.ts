import { cli } from "winston/lib/winston/config";
import { applyFITBDropGradingOperation, FITBDropGraderState, FITBDropGradingOperation, FITBDropGradingRecords } from "./FITBDropGradingCommon";
import { db_getFullFITBDropRubric, db_upsertFITBDropRubricItem, db_upsertFITBDropEvaluator } from "../db/db_collaborative_grading";
import { assertNever } from "../util/util";
import { CollaborativeGradingServerStrategy } from "./CollaborativeGradingTypes";
import { StandardFITBDropGraderSpecification } from "examma-ray/dist/graders/StandardFITBDropGrader";
import { GraderSpecification } from "examma-ray/dist/graders/QuestionGrader";

export const FITB_DROP_GRADING_STRATEGY : CollaborativeGradingServerStrategy<"standard_fitb_drop"> = {

  grader_kind : "standard_fitb_drop",

  applyOperation(grading_records: FITBDropGradingRecords, op: FITBDropGradingOperation, client_uuid: string) : void {
    applyFITBDropGradingOperation(grading_records, op);
  },

  async recordOperation(op: FITBDropGradingOperation, client_uuid: string) : Promise<void> {
    switch(op.kind) {
      case "edit_rubric_item":
        await db_upsertFITBDropRubricItem(op.rubric_item);
        break;
      case "edit_rubric_item_evaluator":
        await db_upsertFITBDropEvaluator(op.evaluator);
        break;
      default:
        assertNever(op);
    }
  },

  loadGradingRecords(grading_server_pk: number) : Promise<FITBDropGradingRecords> {
    return db_getFullFITBDropRubric(grading_server_pk);
  },

  loadGraderSpec(grading_records: FITBDropGradingRecords): GraderSpecification<"standard_fitb_drop"> {

    return {
      grader_kind: "standard_fitb_drop",
      rubric: grading_records.rubric_items
        .sort((a,b)=>a.sort_index.localeCompare(b.sort_index))
        .map(item => ({
          title: item.title,
          points: item.points,
          description: item.description,
          policy: item.policy,
          evaluators: grading_records.evaluators
            .filter(ev => ev.rubric_item_uuid === item.rubric_item_uuid)
            .sort((a,b)=>a.sort_index.localeCompare(b.sort_index))
            .map(ev => ev.spec),
        })),
      points_possible: grading_records.rubric_items.reduce((acc, item) => acc + item.points, 0), // TODO: need to explicitly specify points possible and store in database if some rubric items might have penalties?
    };
  }

}
