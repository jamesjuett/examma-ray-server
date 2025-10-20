import type { FITBDropEvaluatorSpecification } from "examma-ray/dist/graders/StandardFITBDropGrader";
import { assertNever } from "../util/util";
import type { CollaborativeGraderStateBase, CollaborativeGradingOperationBase, CollaborativeGradingRecordsBase } from "./CollaborativeGradingTypes";

export interface CollaborativeGradingFITBDropRubricItem {
  readonly rubric_item_uuid: string;
  readonly grading_server_pk: number;
  title: string;
  points: number;
  description: string;
  policy: "first_match" | "best_score";
  sort_index: string;
  active: boolean;
}

export interface CollaborativeGradingFITBDropEvaluator {
  readonly evaluator_uuid: string;
  readonly rubric_item_uuid: string;
  name: string;
  spec: FITBDropEvaluatorSpecification;
  sort_index: string;
}

export interface CollaborativeGradingFullFITBDropRubric extends CollaborativeGradingRecordsBase{
  readonly rubric_items: CollaborativeGradingFITBDropRubricItem[];
  readonly evaluators: CollaborativeGradingFITBDropEvaluator[];
}

export type FITBDropGradingRecords = CollaborativeGradingFullFITBDropRubric;

export interface FITBDropUpdateRubricItemOperation extends CollaborativeGradingOperationBase {
  readonly kind: "edit_rubric_item",
  readonly rubric_item: CollaborativeGradingFITBDropRubricItem;
}

export interface FITBDropUpdateRubricItemEvaluatorOperation extends CollaborativeGradingOperationBase {
  readonly kind: "edit_rubric_item_evaluator",
  readonly evaluator: CollaborativeGradingFITBDropEvaluator;
}

export type FITBDropGradingOperation =
  | FITBDropUpdateRubricItemOperation
  | FITBDropUpdateRubricItemEvaluatorOperation;

export interface FITBDropGraderState extends CollaborativeGraderStateBase {
  readonly client_uuid: string,
};

export function applyFITBDropGradingOperation(grading_records: FITBDropGradingRecords, op: FITBDropGradingOperation) : void {
  switch(op.kind) {
    case "edit_rubric_item": {
      const item = op.rubric_item;
      const existing_item = grading_records.rubric_items.find(i => i.rubric_item_uuid === item.rubric_item_uuid);
      if (!existing_item) {
        grading_records.rubric_items.push(Object.assign(item, { evaluators: [] }));
      }
      else {
        Object.assign(existing_item, item);
      }
      break;
    }
    case "edit_rubric_item_evaluator": {
      const evaluator = op.evaluator;
      const existing_evaluator = grading_records.evaluators.find(e => e.evaluator_uuid === evaluator.evaluator_uuid);
      if (!existing_evaluator) {
        grading_records.evaluators.push(evaluator);
      }
      else {
        Object.assign(existing_evaluator, evaluator);
      }
      break;
    }
    default:
      assertNever(op);
  }
}