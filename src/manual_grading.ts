import { ExamComponentSkin } from "examma-ray";

export type ManualCodeGraderConfiguration = {
  question_id: string,
  test_harness: string,
  grouping_function: string,
  // replacements: {[index: string]: string}
};


export type ManualGradingSubmission = {
  submission_uuid: string,
  question_id: string,
  exam_id: string,
  uniqname: string,
  submission: string,
  skin_id: string,
  group_uuid: string,
}

export type ManualGradingRubricItemStatus = "on" | "off" | "unknown";

export type ManualGradingRubricItem = {
  rubric_item_uuid: string,
  points: number,
  title: string,
  description: string,
  sort_index?: string,
  active: boolean
};

export type RubricItemGradingResult = {
  status?: ManualGradingRubricItemStatus,
  notes?: string
}

export function isMeaningfulRubricItemGradingResult(ri: RubricItemGradingResult | undefined) {
  return ri && (ri.status !== undefined && ri.status !== "off" || ri.notes)
}

export type ManualGradingResult = {
  [index: string]: RubricItemGradingResult | undefined
};

export function isMeaningfulManualGradingResult(gr: ManualGradingResult | undefined) {
  return gr && Object.values(gr).some(ri => isMeaningfulRubricItemGradingResult(ri));
}

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
  active_graders: ActiveQuestionGraders
};

export type ActiveQuestionGraders = {
  // Client ID
  graders: {[index: string]: {
    group_uuid?: string,
    email: string
  }}
};

export type ActiveExamGraders = {
  // Question ID
  [index: string]: ActiveQuestionGraders
};





export type NextUngradedRequest = {
  client_uuid: string,
  desired: string[]
};

export type NextUngradedResponse = {
  group_uuid?: string;
}



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
  assignment: {[index: string]: string | undefined} // mapping of submission uuids to group uuids. undefined means leave it in current group
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

export type GradingGroupReassignment = {[index: string]: string | undefined};

export function reassignGradingGroups(grading_record: ManualGradingQuestionRecords, reassignment: GradingGroupReassignment) {
  
  Object.values(grading_record.groups).forEach(group => {

    // A list of new submissions for this group
    let new_subs : ManualGradingSubmission[] = [];

    group!.submissions.forEach(sub => {
      let new_group_uuid = reassignment[sub.submission_uuid];
      if (!new_group_uuid || new_group_uuid === group!.group_uuid) {
        // wasn't in the reassignment or it was reassigned
        // to its existing group, so we keep it in this group
        new_subs.push(sub);
        return;
      }

      // Otherwise, were are we going?
      let existing_group = grading_record.groups[new_group_uuid];
      
      if (existing_group) {
        // joining another existing group
        existing_group.submissions.push(sub);
      }
      else {
        // create new group
        grading_record.groups[new_group_uuid] = {
          group_uuid: new_group_uuid,
          grading_result: {},
          submissions: [sub],
          finished: false
        };
      }
    });

    // change to filtered list of submissions we're keeping.
    group!.submissions = new_subs;
  });

  // Remove empty groups
  Object.entries(grading_record.groups).forEach(([group_uuid, group]) => {
    if (group!.submissions.length === 0) {
      delete grading_record.groups[group_uuid];
    }
  });
}