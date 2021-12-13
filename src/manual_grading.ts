import { ExamComponentSkin } from "examma-ray";

export type ManualCodeGraderConfiguration = {
  question_id: string,
  test_harness: string,
  grouping_function: string
};


export type ManualGradingSubmission = {
  submission_uuid: string,
  uniqname: string,
  submission: string,
  skin_id: string
}

export type ManualGradingRubricItemStatus = "on" | "off" | "unknown";

export type ManualGradingRubricItem = {
  rubric_item_uuid: string,
  points: number,
  title: string,
  description: string,
  active: boolean
};

export type RubricItemGradingResult = {
  status?: ManualGradingRubricItemStatus,
  notes?: string
}

export type ManualGradingResult = {
  [index: string]: RubricItemGradingResult | undefined
};

export type ManualGradingGroupRecord = {
  // name: string,
  group_uuid: string,
  submissions: ManualGradingSubmission[],
  finished?: boolean,
  grader?: string,
  grading_result: ManualGradingResult
}

export type ManualGradingQuestionRecords = {
  // name?: string,
  // exam_id: string,
  grading_epoch: number,
  question_id: string,
  groups: {
    [index: string]: ManualGradingGroupRecord | undefined
  }
};

export type ManualGradingSkins = {
  [index: string]: ExamComponentSkin
};




export type ManualGradingPingRequest = {
  client_uuid: string,
  exam_id: string,
  question_id: string,
  group_uuid?: string,
  my_grading_epoch: number
  my_operations: readonly ManualGradingOperation[]
};

export type ManualGradingPingResponse = {

  exam_id: string,
  question_id: string,

  /**
   * What grading epoch are we on
   */
  grading_epoch: number,

  /**
   * Tranistions needed to come up to the current epoch
   */
  epoch_transitions: readonly ManualGradingEpochTransition[] | "reload" | "invalid"

  /**
   * Who has active browser tabs open on this question?
   */
  active_graders: ActiveGraders
};

export type ActiveGraders = {
  // Question ID
  [index: string]: {
    graders: {
      // Client ID
      [index: string]: {
        group_uuid?: string,
        email: string
      }
    }
  }
};








export type SetRubricItemStatusOperation = {
  kind: "set_rubric_item_status",
  group_uuid: string,
  rubric_item_uuid: string,
  status: ManualGradingRubricItemStatus
};

export type SetRubricItemNotesOperation = {
  kind: "set_rubric_item_notes",
  group_uuid: string,
  rubric_item_uuid: string,
  notes: string
};

export type SetGroupFinishedOperation = {
  kind: "set_group_finished",
  group_uuid: string,
  finished: boolean
};

export type EditRubricItemOperation = {
  kind: "edit_rubric_item",
  rubric_item_uuid: string,
  edits: Partial<ManualGradingRubricItem>
};

export type CreateRubricItemOperation = {
  kind: "create_rubric_item",
  rubric_item: ManualGradingRubricItem,
  // after: string
};

export type EditCodeGraderConfigOperation = {
  kind: "edit_code_grader_config",
  edits: Partial<ManualCodeGraderConfiguration>
};

export type AssignGroupsOperation = {
  kind: "assign_groups_operation",
  assignment: {[index: string]: string} // mapping of submission uuids to group uuids
};

// NOTE: all operations must be idempotent and must not depend on previous state
export type ManualGradingOperation =
 | SetRubricItemStatusOperation
 | SetRubricItemNotesOperation
 | SetGroupFinishedOperation
 | EditRubricItemOperation
 | CreateRubricItemOperation
 | EditCodeGraderConfigOperation
 | AssignGroupsOperation;

export type ManualGradingEpochTransition = {
  readonly client_uuid: string,
  readonly grader_email: string,
  readonly ops: readonly ManualGradingOperation[]
};