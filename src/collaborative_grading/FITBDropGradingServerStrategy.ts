import { cli } from "winston/lib/winston/config";
import { applyFITBDropGradingOperation, FITBDropGraderState, FITBDropGradingOperation, FITBDropGradingRecords } from "./FITBDropGradingCommon";
import { db_getFullFITBDropRubric, db_upsertFITBDropRubricItem, db_upsertFITBDropRubricItemEvaluator } from "../db/db_collaborative_grading";
import { assertNever } from "../util/util";
import { CollaborativeGradingServerStrategy } from "./CollaborativeGradingTypes";

export const FITB_DROP_GRADING_STRATEGY : CollaborativeGradingServerStrategy<"standard_fitb_drop"> = {

  grader_kind : "standard_fitb_drop",

  applyOperation(grading_records: FITBDropGradingRecords, op: FITBDropGradingOperation, client_uuid: string) : void {
    applyFITBDropGradingOperation(grading_records, op);
  },

  async recordOperation(op: FITBDropGradingOperation, client_uuid: string) : Promise<void> {
    switch(op.kind) {
      case "update_rubric_item":
        await db_upsertFITBDropRubricItem(op.rubric_item);
        break;
      case "update_rubric_item_evaluator":
        await db_upsertFITBDropRubricItemEvaluator(op.rubric_item);
        break;
      default:
        assertNever(op);
    }
  },

  loadGradingRecords(grading_server_pk: number) : Promise<FITBDropGradingRecords> {
    return db_getFullFITBDropRubric(grading_server_pk);
  }

}
