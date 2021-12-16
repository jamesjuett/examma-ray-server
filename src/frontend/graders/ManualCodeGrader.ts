import indentString from "indent-string";
import { Program, SimpleProgram, SourceFile } from "lobster-vis/dist/js/core/Program"
import { SimpleExerciseLobsterOutlet } from "lobster-vis/dist/js/view/SimpleExerciseLobsterOutlet"
import { createRunestoneExerciseOutlet } from "lobster-vis/dist/js/view/embeddedExerciseOutlet"

import { applySkin, highlightCode, mk2html, mk2html_unwrapped } from "examma-ray/dist/core/render";
import "highlight.js/styles/github.css";

import "./code-grader.css";
import { COMPLETION_ALL_CHECKPOINTS, Exercise, Project } from "lobster-vis/dist/js/core/Project";
import "lobster-vis/dist/css/buttons.css"
import "lobster-vis/dist/css/main.css"
import "lobster-vis/dist/css/code.css"
import "lobster-vis/dist/css/exercises.css"
import "lobster-vis/dist/css/frontend.css"
import { Checkpoint, EndOfMainStateCheckpoint } from "lobster-vis/dist/js/analysis/checkpoints";
import "lobster-vis/dist/js/lib/standard";
import { renderScoreBadge, renderShortPointsWorthBadge, renderUngradedBadge } from "examma-ray/dist/core/ui_components";
import { QuestionSpecification, ExamComponentSkin, Question } from "examma-ray";
import deepEqual from "deep-equal";
import { v4 as uuidv4 } from "uuid";

import queryString from "query-string";
import { ActiveExamGraders, ActiveQuestionGraders, GradingGroupReassignment, isMeaningfulManualGradingResult, isMeaningfulRubricItemGradingResult, ManualCodeGraderConfiguration, ManualGradingGroupRecord, ManualGradingPingRequest, ManualGradingPingResponse, ManualGradingQuestionRecords, ManualGradingResult, ManualGradingRubricItem, ManualGradingRubricItemStatus, ManualGradingSkins, ManualGradingSubmission, NextUngradedRequest, NextUngradedResponse, reassignGradingGroups, RubricItemGradingResult } from "../../manual_grading";
import { asMutable, assert, assertFalse, assertNever } from "../../util/util";
import axios from "axios";
import { ExammaRayGraderClient } from "../Application";
import avatar from "animal-avatar-generator";
import { EditRubricItemOperation, ManualGradingEpochTransition, ManualGradingOperation, SetRubricItemStatusOperation } from "../../manual_grading";
import { Simulation } from "lobster-vis/dist/js/core/Simulation";

import hotkeys from "hotkeys-js";

// Because this grader is based on Lobster, it only works for C++ code
// Perhaps in the future it will be generalized to other languages and
// have the option to just use a regular codemirror instance rather than
// lobster.
const CODE_LANGUAGE = "cpp";

const ACTIVE_GRADER_AVATAR_SIZE = 30;

const N_CLAIM_NEXT_UNGRADED = 10;


type SubmissionsFilterCriterion = "all" | "graded" | "ungraded";
type SubmissionsSortCriterion = "name" | "size" | "score";
type SubmissionsSortOrdering = "asc" | "dsc";

const SUBMISSION_FILTERS : {
  [k in SubmissionsFilterCriterion]: (group: ManualGradingGroupRecord) => boolean
} = {
  "all": (group: ManualGradingGroupRecord) => true,
  "graded": (group: ManualGradingGroupRecord) => !!group.finished,
  "ungraded": (group: ManualGradingGroupRecord) => !group.finished,
}

// export type CodeWritingManualGraderAppSpecification = {
//   testHarness: string,
//   extract_code?: (raw_submission: string, skin: ExamComponentSkin) => string,
//   skin_override?: ExamComponentSkin,
//   preprocess?: (submission: string) => string,
//   checkpoints: Checkpoint[],
//   // autograder: (ex: Exercise) => ManualGradingResult,
//   groupingFunctionName: string
// };

export const DEFAULT_EXTRACT_CODE = (raw_submission: string) => {
  assert(typeof raw_submission === "string");
  return raw_submission;
};

export class ManualCodeGraderApp {

  public readonly client: ExammaRayGraderClient;
  public readonly groupGrader: GroupGraderOutlet;
  public readonly groupThumbnailsPanel: GroupThumbnailsPanel;

  public readonly exam_id: string;
  public readonly question: Question;
  public readonly rubric: ManualGradingRubricItem[];
  public readonly config: ManualCodeGraderConfiguration;
  public readonly grading_records: ManualGradingQuestionRecords;
  public readonly skins: ManualGradingSkins;

  public readonly currentGroup?: ManualGradingGroupRecord;

  private local_changes: ManualGradingOperation[] = [];
  private pendingPing: boolean = false;

  public readonly active_graders: ActiveQuestionGraders = {graders: {}};

  // public readonly currentGroup?: ManualGradingGroupRecord;


  // private extract_code: (raw_submission: string, skin: ExamComponentSkin) => string;
  // public skin_override?: ExamComponentSkin;
  // private preprocess?: (submission: string) => string;
  // private testHarness: string;
  // private groupingFunctionName: string;

  private groupMemberThumbnailsElem: JQuery;
  private statusElem: JQuery;
  private gradingProgressBarElem: JQuery;
  
  private constructor(client: ExammaRayGraderClient, exam_id: string, question: Question, rubric: ManualGradingRubricItem[], config: ManualCodeGraderConfiguration, records: ManualGradingQuestionRecords, skins: ManualGradingSkins) {
    this.client = client;
    this.exam_id = exam_id;
    this.question = question;
    this.config = config;
    this.rubric = rubric;
    this.grading_records = records;
    this.skins = skins;

    this.statusElem = $("#examma-ray-manual-grader-app-status");
    this.gradingProgressBarElem = $("#examma-ray-grading-progress-bar");

    this.groupGrader = new GroupGraderOutlet(this);
    this.groupThumbnailsPanel = new GroupThumbnailsPanel(this, $(".examma-ray-group-thumbnails"));

    // this.testHarness = spec.testHarness;
    // this.extract_code = spec.extract_code ?? DEFAULT_EXTRACT_CODE;
    // this.skin_override = spec.skin_override;
    // this.preprocess = spec.preprocess;
    // this.groupingFunctionName = spec.groupingFunctionName;

    this.groupMemberThumbnailsElem = $(".examma-ray-group-member-thumbnails");

    $(".examma-ray-grading-title").html(this.question.question_id);

    this.initComponents();
    this.initHotkeys();

    this.updateGradingProgressBar();

    setInterval(() => this.sendPing(), 1000);
  }

  private initComponents() {
    
    $("#edit-code-grader-config-open-modal-button").on("click", async () => {
      $("#edit-code-grader-config-input-grouping-function").val(this.config.grouping_function);
      $("#edit-code-grader-config-input-test-harness").val(this.config.test_harness);
      $("#edit-code-grader-config-modal").modal("show");
    });

    $("#edit-code-grader-config-submit-button").on("click", async () => {
      this.performLocalOperation({
        kind: "edit_code_grader_config",
        edits: {
          question_id: this.question.question_id,
          grouping_function: ""+$("#edit-code-grader-config-input-grouping-function").val(),
          test_harness: ""+$("#edit-code-grader-config-input-test-harness").val()
        }
      });

      $("#edit-code-grader-config-modal").modal("hide");
    });

    
    $(".examma-ray-auto-group-button").on("click", async () => this.autoGroup());

    $("#examma-ray-next-ungraded-button").on("click", async() => this.claimNextUngraded());
  }

  private initHotkeys() {
    hotkeys('z', (event, handler) => {

      // do nothing if any modal is open
      if ($(".modal.in").length > 0) {
        return;
      }
      
      // do nothing if modifier keys are held
      if (event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      this.claimNextUngraded();
    });
  }

  private updateGradingProgressBar() {
    let groups = Object.values(this.grading_records.groups);
    let n_graded = groups.filter(g => g!.finished).length;
    this.gradingProgressBarElem.html(`${n_graded} / ${groups.length}`);
    this.gradingProgressBarElem.css("width", `${n_graded / groups.length * 100}%`);
    // if (n_graded/groups.length < 0.15) {
    //   this.gradingProgressBarElem.append(`<span class="float: right;">${groups.length} groups</span>`)
    // }
  }

  public static async create(exam_id: string, question_id: string) {

    try {
      const client = await ExammaRayGraderClient.create();

      const question_response = await axios({
        url: `api/exams/${exam_id}/questions/${question_id}`,
        method: "GET",
        data: {},
        headers: {
            'Authorization': 'bearer ' + client.getBearerToken()
        }
      });
      
      const question = Question.create(<QuestionSpecification>question_response.data);
      const rubric = await loadRubric(client, exam_id, question_id);
      const config = await loadConfig(client, exam_id, question_id);
      const records = await loadGradingRecords(client, exam_id, question_id);
      const skins = await loadSkins(client, exam_id, question_id);

      return new ManualCodeGraderApp(client, exam_id, question, rubric, config, records, skins);
    }
    catch(e: unknown) {
      alert("Error loading grading records :(");
      throw e;
    }

  }

  private async sendPing() {

    // only one ping at a time
    if (this.pendingPing) {
      return;
    }

    if (!this.question || !this.grading_records) {
      return;
    }
    
    this.pendingPing = true;

    let pingRequest: ManualGradingPingRequest = {
      client_uuid: this.client.client_uuid,
      exam_id: this.exam_id,
      question_id: this.question.question_id,
      group_uuid: this.currentGroup?.group_uuid,
      my_grading_epoch: this.grading_records.grading_epoch,
      my_operations: this.local_changes.slice() // copy
    };

    // All local changes will be sent with the request and
    // reflected in the response to come up to the latest grading
    // epoch, so they'll be reapplied and we don't need to keep them.
    this.local_changes.length = 0; // clear the array

    try {
      const ping_response = await axios({
        url: `api/manual_grading/${this.exam_id}/questions/${this.question.question_id}/ping`,
        method: "POST",
        data: pingRequest,
        headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      });
  
      // Note that after this promise resolves, there may be new local changes
      // that will be reapplied after processing the remote ones via the call
      // here
      
      this.onPingResponse(<ManualGradingPingResponse>ping_response.data);
      this.statusElem.html('<span class="label label-success"><i class="bi bi-cloud-check-fill"></i> Connected to Server</span>');
    }
    catch(e: unknown) {
      console.log(e);
      this.statusElem.html('<span class="label label-danger"><i class="bi bi-cloud-slash-fill"></i> Error: Not Connected</span>');
    }
    
    this.pendingPing = false;
  }

  private onPingResponse(pingResponse: ManualGradingPingResponse) {

    this.updateGraderAvatars(pingResponse);
    this.groupThumbnailsPanel.updateGraderAvatars(pingResponse);

    if (pingResponse.epoch_transitions === "invalid") {
      alert("Uh oh, something went wrong synchronizing your work to the server. This should never happen. Try reloading the page, I guess? :(");
    }
    else if (pingResponse.epoch_transitions === "reload") {
      // await this.reloadGradingRecords();
      alert("Uh oh - looks like your local records are behind. Please refresh the page.")
    }
    else {
      this.applyRemoteEpochTransitions(pingResponse.epoch_transitions, pingResponse.grading_epoch);
    }
  }

  private applyRemoteEpochTransitions(transitions: readonly ManualGradingEpochTransition[], to_epoch: number) {
    
    assert(this.grading_records);

    // Apply remote transitions
    transitions.forEach(t => t.ops.forEach(op => this.applyOperation(op, t.client_uuid !== this.client.client_uuid ? t.grader_email : undefined)))

    // Reapply our current set of local operations
    this.local_changes.forEach(op => this.applyOperation(op));

    this.grading_records.grading_epoch = to_epoch;
  }

  private updateGraderAvatars(pingResponse: ManualGradingPingResponse) {
    let active_graders = pingResponse.active_graders;
    asMutable(this).active_graders = active_graders;
    let avatarsElem = $(".examma-ray-active-graders").empty();
    Object.entries(active_graders.graders)
      .map(([client_uuid, grader]) => ({client_uuid: client_uuid, ...grader}))
      .sort((g1, g2) => g1.email.localeCompare(g2.email))
      .forEach(grader => {
      $(`<div style="display: inline-block;" data-toggle="tooltip" data-placement="bottom" title="${grader.email}">
        ${avatar(grader.email, { size: ACTIVE_GRADER_AVATAR_SIZE })}
      </div>`).appendTo(avatarsElem).on("click", () => {
        let jump_to = this.active_graders.graders[grader.client_uuid].group_uuid;
        if (jump_to) {
          this.openGroup(jump_to);
        }
      });
    });
    $(".examma-ray-active-graders div").tooltip();
  }

  private setUpEventHandlers() {


    // let fileInput = $("#load-grading-assignment-input");
    // let loadButton = $("#load-grading-assignment-button");
    // let autogradeButton = $("#examma-ray-grading-autograde-button");
  
    // loadButton.on("click", () => GRADING_APP.loadGradingAssignmentFile());
  
    // autogradeButton.on("click", () => GRADING_APP.autograde());
  
    // $(".examma-ray-auto-group-button").on("click", async function() {
    //     self.autoGroup();
    // });
  
    // $(".examma-ray-grading-finished-button").on("click", async function() {
    //     self.toggleGroupFinished();
    // });
  
  }

  public performLocalOperation(op: ManualGradingOperation) {
    this.applyOperation(op);
    this.local_changes.push(op);
  }

  private applyOperation(op: ManualGradingOperation, remote_grader_email?: string) {
    if (!this.grading_records || !this.rubric) {
      return;
    }

    if (op.kind === "set_rubric_item_status") {
      let group = this.grading_records.groups[op.group_uuid]
      if (group) {
        group.grading_result[op.rubric_item_uuid] ??= {};
        group.grading_result[op.rubric_item_uuid]!.status = op.status;
      }
      if (op.group_uuid === this.currentGroup?.group_uuid) {
        this.groupGrader.onRubricItemStatusSet(op.rubric_item_uuid, op.status, remote_grader_email);
      }

      this.groupThumbnailsPanel.onGroupGradingResultUpdated(op.group_uuid);
    }
    else if (op.kind === "set_rubric_item_notes") {
      let group = this.grading_records.groups[op.group_uuid]
      if (group) {
        group.grading_result[op.rubric_item_uuid] ??= {};
        group.grading_result[op.rubric_item_uuid]!.notes = op.notes;
      }
      if (op.group_uuid === this.currentGroup?.group_uuid) {
        this.groupGrader.onRubricItemNotesSet(op.rubric_item_uuid, op.notes, remote_grader_email);
      }

      this.groupThumbnailsPanel.onGroupGradingResultUpdated(op.group_uuid);
    }
    else if (op.kind === "set_group_finished") {
      let group = this.grading_records.groups[op.group_uuid];
      if (group) { group.finished = op.finished; }
      if (op.group_uuid === this.currentGroup?.group_uuid) {
        this.groupGrader.onGroupFinishedSet(op.group_uuid, remote_grader_email);
      }
      this.groupThumbnailsPanel.onGroupFinishedSet(op.group_uuid, remote_grader_email);
      this.updateGradingProgressBar();
    }
    else if (op.kind === "edit_rubric_item") {
      let existingRi = this.rubric.find(ri => ri.rubric_item_uuid === op.rubric_item_uuid);
      if (existingRi) {
        Object.assign(existingRi, op.edits);
        this.groupGrader.onRubricItemEdit(op.rubric_item_uuid, remote_grader_email);
        this.groupThumbnailsPanel.onRubricUpdated();
      }
      else {
        // tehcnically should never get here - rubric items can't be deleted, only hidden
        return assertFalse();
      }
    }
    else if (op.kind === "create_rubric_item") {
      let existingRi = this.rubric.find(ri => ri.rubric_item_uuid === op.rubric_item.rubric_item_uuid);
      if (existingRi) {
        Object.assign(existingRi, op.rubric_item);
        this.groupGrader.onRubricItemEdit(op.rubric_item.rubric_item_uuid, remote_grader_email);
        this.groupThumbnailsPanel.onRubricUpdated();
      }
      else {
        asMutable(this.rubric).push(op.rubric_item);
        this.groupGrader.onRubricItemCreated(op.rubric_item, remote_grader_email);
        this.groupThumbnailsPanel.onRubricUpdated();
      }
      
    }
    else if (op.kind === "edit_code_grader_config") {
      Object.assign(this.config, op.edits);
      this.groupGrader.onGraderConfigEdit(remote_grader_email);
    }
    else if (op.kind === "assign_groups_operation") {
      
      reassignGradingGroups(this.grading_records, op.assignment);

      this.groupThumbnailsPanel.onGroupsChanged(remote_grader_email);

      if (this.currentGroup) {
        this.groupGrader.onGroupSubmissionsChanged(remote_grader_email);
      }
    }
    else {
      return assertNever(op);
    }
  }

  // private refreshGroups() {
  //   this.updateGroupThumbnails();
  //   // if (this.currentGroup) {
  //   //   $(".examma-ray-grading-group-name").html(this.currentGroup.group_uuid);
  //   //   $(".examma-ray-grading-group-num-members").html(""+this.currentGroup.submissions.length);
  //   // }
  // }

  // private async reloadGradingRecords() {
  
  //   try {

  //     const rubric_response = await axios({
  //       url: `api/manual_grading/${this.exam_id}/questions/${this.question.question_id}/rubric`,
  //       method: "GET",
  //       data: {},
  //       headers: {
  //           'Authorization': 'bearer ' + this.client.getBearerToken()
  //       }
  //     });
  //     const rubric = <ManualGradingRubricItem[]>rubric_response.data;
  
  //     const records_response = await axios({
  //       url: `api/manual_grading/${this.exam_id}/questions/${this.question.question_id}/records`,
  //       method: "GET",
  //       data: {},
  //       headers: {
  //           'Authorization': 'bearer ' + this.client.getBearerToken()
  //       }
  //     });
  //     const records = <ManualGradingQuestionRecords>records_response.data;

  //     this.setRubric(rubric);
  //     this.setGradingRecords(records);

  //     // Reapply our current set of local operations
  //     this.local_changes.forEach(op => this.applyOperation(op));
  //   }
  //   catch(e: unknown) {
  //     alert("Error loading grading records :(");
  //   }
  // }

  // private setRubric(rubric: readonly ManualGradingRubricItem[]) {
  //   asMutable(this).rubric = rubric;
  //   this.createRubricBar();
  // }

  public openGroup(group_uuid: string) {
    let group = this.grading_records.groups[group_uuid];

    if (!group) {
      return;
    }

    if (this.currentGroup) {
      this.groupThumbnailsPanel.onGroupClosed(this.currentGroup);
    }

    asMutable(this).currentGroup = group;

    this.groupMemberThumbnailsElem.empty();
    group.submissions.forEach(sub => {
      this.groupMemberThumbnailsElem.append(this.createMemberThumbnail(group!.group_uuid, sub));
    })
    
    this.groupGrader.onGroupOpen(group);

    $(".examma-ray-submissions-column").find(".panel-primary").removeClass("panel-primary");
    this.groupThumbnailsPanel.onGroupOpened(group);

  }

  public applyHarness(sub: ManualGradingSubmission) {

    let code = this.config.test_harness.replace("{{submission}}", indentString(sub.submission, 4));

    code = applySkin(code, this.skins[sub.skin_id]);
    return code;
  }

  private createMemberThumbnail(group_uuid: string, sub: ManualGradingSubmission) {
    let response = sub.submission;
    let jq = $(`
      <div class="panel panel-default examma-ray-group-member-thumbnail">
        <div class="panel-heading">
          <button type="button" class="btn btn-sm btn-danger examma-ray-group-member-remove-button" aria-label="Remove"><span aria-hidden="true">Remove</span></button>
          ${sub.uniqname}
        </div>
        <div class="panel-body">
          <pre><code>${highlightCode(response, CODE_LANGUAGE)}</code></pre>
        </div>
      </div>
    `);
    let removeButton = jq.find(".examma-ray-group-member-remove-button");
    removeButton.on("click", () => {
      let group = this.grading_records.groups[group_uuid];
      if (group && group.submissions.length > 1) {
        this.removeFromGroup(sub);
        jq.fadeOut(() => jq.remove());
      }
    })
    return jq;
  }

  private removeFromGroup(subToRemove: ManualGradingSubmission) {
    let reassignment: GradingGroupReassignment = {};
    reassignment[subToRemove.submission_uuid] = uuidv4();
    this.performLocalOperation({
      kind: "assign_groups_operation",
      assignment: reassignment
    });
  }

  private closeGroup() {
    this.groupGrader.onGroupClose();
    this.groupMemberThumbnailsElem.empty();
    delete asMutable(this).currentGroup;
  }

  public async claimNextUngraded() {
    try {
      const response = await axios({
        url: `api/manual_grading/${this.exam_id}/questions/${this.question.question_id}/claim_next_ungraded`,
        method: "POST",
        data: <NextUngradedRequest>{
          client_uuid: this.client.client_uuid,
          desired: this.groupThumbnailsPanel.getNextNGroups(N_CLAIM_NEXT_UNGRADED)
        },
        headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      });

      let next_uuid = (<NextUngradedResponse>response.data).group_uuid;
      if (next_uuid) {
        this.openGroup(next_uuid)
      }
      // else do nothing
    }
    catch(e: unknown) {
      console.log(e);
      this.statusElem.html('<span class="label label-danger"><i class="bi bi-cloud-slash-fill"></i> Error: Not Connected</span>');
    }
  }

  public pointsEarned(gr?: ManualGradingResult) {
    assert(this.rubric);

    if (!gr || !this.question) {
      return 0;
    }
    return Math.max(0, Math.min(this.question.pointsPossible,
      this.rubric.reduce((p, ri) => p + (gr[ri.rubric_item_uuid]?.status === "on" ? ri.points : 0), 0)
    ));
  }

  
  public async autoGroup() {

    $("#examma-ray-grouping-progress-modal").modal("show");

    // let equivalenceGroups : (ManualGradingGroupRecord & { repProgram?: Program })[] = [];

    // Create a set of single-submission groups with the first from each original group
    // THAT HAS A GRADING RESULT while all remaining submissions go into a list.
    let submissionsToPlace : ManualGradingSubmission[] = [];
    let newGroups : (ManualGradingGroupRecord & { repProgram?: Program })[] = [];
    Object.values(this.grading_records.groups).forEach(group => {
      if (group!.submissions.length === 0) {
        return; // ignore empty groups
      }

      if (group!.finished || Object.values(group!.grading_result).filter(isMeaningfulRubricItemGradingResult).length > 0) {
        // A group with some grading already done. Keep this group together.
        newGroups.push(group!);
      }
      else {
        // A group that has not been graded at all. Break it up.
        group!.submissions.forEach(sub => submissionsToPlace.push(sub));
      }
    });

    for(let i = 0; i < submissionsToPlace.length; ++i) {
      let sub = submissionsToPlace[i];
      let percent = 100*i/submissionsToPlace.length;
      if (Math.floor(percent/5) % 2 === 0) {
        $(".examma-ray-grouping-progress .progress-bar").html("♪┏(・o･)┛♪┗( ･o･)┓♪")
      }
      else {
        $(".examma-ray-grouping-progress .progress-bar").html("♪┗( ･o･)┓♪┏(・o･)┛♪")
      }
      $(".examma-ray-grouping-progress .progress-bar").css("width", percent + "%");
      console.log(i);
      await this.autoGroupHelper(newGroups, sub);
    }

    let assignment : {[index: string]: string} = {};
    newGroups.forEach(group => group.submissions.forEach(sub => assignment[sub.submission_uuid] = group.group_uuid));

    this.performLocalOperation({
      kind: "assign_groups_operation",
      assignment: assignment
    });

    $("#examma-ray-grouping-progress-modal").modal("hide");
  }

  private getGroupingFunctionName(sub: ManualGradingSubmission) {
    return applySkin(this.config.grouping_function, this.skins[sub.skin_id]);
  }

  private autoGroupHelper(equivalenceGroups: (ManualGradingGroupRecord & { repProgram?: Program })[], sub: ManualGradingSubmission) {

    return new Promise<void>((resolve, reject) => {

      window.setTimeout(() => {
        let code = this.applyHarness(sub);

        try {
    
          let p = new SimpleProgram(code);
    
          let fn = getFunc(p, this.getGroupingFunctionName(sub));
          if (!fn) {
            // Didn't parse or can't find function, make a new group
            equivalenceGroups.push({
              group_uuid: uuidv4(),
              finished: false,
              repProgram: p,
              submissions: [sub],
              grading_result: {}
            });
            resolve();
            return;
          }
    
          let matchingGroup = equivalenceGroups.find(group => {

            // Only group blank submissions with other blank submissions
            if ( (group.submissions[0].submission === "") !== (sub.submission === "")) {
              return false;
            }
            
            let rep = group.repProgram;
            if (!rep) { return false; }
            let repFunc = getFunc(rep, this.getGroupingFunctionName(group.submissions[0]));
            return repFunc && getFunc(p, this.getGroupingFunctionName(sub))!.isSemanticallyEquivalent(repFunc, {});
          });
    
          if (matchingGroup) {
            matchingGroup.submissions.push(sub);
          }
          else {
            equivalenceGroups.push({
              group_uuid: uuidv4(),
              finished: false,
              repProgram: p,
              submissions: [sub],
              grading_result: {}
            });
          }
        }
        catch(e) {
          // Lobster might randomly crash on an obscure case. Just add to
          // a new group with no representative program.
          equivalenceGroups.push({
            group_uuid: uuidv4(),
            finished: false,
            submissions: [sub],
            grading_result: {}
          });
        }
        
        resolve();
      }, 0);
   });
  }

  // private removeFromCurrentGroup(subToRemove: CodeWritingSubmission) {
  //   if (!this.assn || !this.currentGroup || this.currentGroup.submissions.length <= 1) {
  //     return;
  //   }

  //   let i = this.currentGroup.submissions.findIndex(sub => sub.question_uuid === subToRemove.question_uuid);
  //   i !== -1 && this.currentGroup.submissions.splice(i, 1);

  //   this.assn.groups.push({
  //     name: "group_" + this.assn.groups.length,
  //     representative_index: 0,
  //     submissions: [subToRemove],
  //     grading_result: copyGradingResult(this.currentGroup.grading_result)
  //   });

  //   this.refreshGroups();
  // }

};




function getFunc(program: Program, name: string | string[]) {
  if (typeof name === "string") {
    name = [name];
  }
  for(let i = 0; i < name.length; ++i) {
    if (name[0].indexOf("::[[constructor]]") !== -1) {
      let className = name[0].slice(0, name[0].indexOf("::[[constructor]]"));
      let ctor = program.linkedClassDefinitions[className]?.constructors[0].definition;
      if (ctor) {
        return ctor;
      }
      continue;
    }

    let def = program.linkedFunctionDefinitions[name[i]]?.definitions[0];
    if (def) {
      return def;
    }
  }
  return undefined;
}

function areEquivalentGradingResults(gr1: ManualGradingResult | undefined, gr2: ManualGradingResult | undefined) {
  return deepEqual(gr1, gr2);
}

function copyGradingResult(gr: ManualGradingResult) {
  return Object.assign({}, gr);
}

const VERIFIED_ICON = `<i class="bi bi-check2-circle" style="vertical-align: text-top;"></i> `;

class GroupGraderOutlet {

  public readonly app: ManualCodeGraderApp;

  private lobster: SimpleExerciseLobsterOutlet;

  private rubricItemOutlets: {
    [index: string]: RubricItemOutlet | undefined
  } = { };

  private rubricBarElem: JQuery;
  private gradingFinishedButtonElem: JQuery;

  public constructor(app: ManualCodeGraderApp) {
    this.app = app;

    this.rubricBarElem = $(".examma-ray-grading-rubric-buttons")
      .addClass("list-group");

    this.lobster = this.createLobster();
    this.createRubricBar();
    this.initComponents();

    this.gradingFinishedButtonElem = $(".examma-ray-grading-finished-button")
      .on("click", () => {
        this.toggleGroupFinished();
      });

    this.initHotkeys();
  }

  private initComponents() {

    $("#create-rubric-item-open-modal").on("click", async () => {
      $("#edit-rubric-item-submit-button").html("Create");
      $("#edit-rubric-item-input-uuid").val(uuidv4());
      $("#edit-rubric-item-input-title").val("");
      $("#edit-rubric-item-input-description").val("");
      $("#edit-rubric-item-input-sort-index").val("");
      $("#edit-rubric-item-input-points").val("");
      $("#edit-rubric-item-modal").data("edit-rubric-item-mode", "create");
      $("#edit-rubric-item-modal").modal("show");
    });
      
    $("#edit-rubric-item-submit-button").on("click", async () => {
      let sort_index = ""+$("#edit-rubric-item-input-sort-index").val();
      if ($("#edit-rubric-item-modal").data("edit-rubric-item-mode") === "create") {
        this.app.performLocalOperation({
          kind: "create_rubric_item",
          rubric_item: {
            rubric_item_uuid: ""+$("#edit-rubric-item-input-uuid").val(),
            title: ""+$("#edit-rubric-item-input-title").val(),
            description: ""+$("#edit-rubric-item-input-description").val(),
            sort_index: sort_index ?? undefined, // pass undefined if it was falsey, which includes ""
            points: parseFloat(""+$("#edit-rubric-item-input-points").val()),
            active: true
          }
        });
      }
      else {
        this.app.performLocalOperation({
          kind: "edit_rubric_item",
          rubric_item_uuid: ""+$("#edit-rubric-item-input-uuid").val(),
          edits: {
            title: ""+$("#edit-rubric-item-input-title").val(),
            description: ""+$("#edit-rubric-item-input-description").val(),
            sort_index: sort_index ?? undefined, // pass undefined if it was falsey, which includes ""
            points: parseFloat(""+$("#edit-rubric-item-input-points").val()),
            active: true
          }
        });
      }

      $("#edit-rubric-item-modal").modal("hide");
    });

    $("#edit-rubric-notes-submit-button").on("click", async () => {
      
      this.app.performLocalOperation({
        kind: "set_rubric_item_notes",
        group_uuid: ""+$("#edit-rubric-notes-input-group-uuid").val(),
        rubric_item_uuid: ""+$("#edit-rubric-notes-input-rubric-item-uuid").val(),
        notes: ""+$("#edit-rubric-notes-input-notes").val()
      });

      $("#edit-rubric-notes-modal").modal("hide");
    });

  }

  private initHotkeys() {
    hotkeys('1,2,3,4,5,6,7,8,9', (event, handler) => {

      // do nothing if any modal is open
      if ($(".modal.in").length > 0) {
        return;
      }

      // do nothing if modifier keys are held
      if (event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      
      let num = parseInt(handler.key);

      Object.values(this.rubricItemOutlets).forEach(ri => {
        if (ri!.display_index === num) {
          this.toggleRubricItem(ri!.rubricItem.rubric_item_uuid);
        }
      });
    });
    hotkeys('f', (event, handler) => {

      // do nothing if any modal is open
      if ($(".modal.in").length > 0) {
        return;
      }

      // do nothing if modifier keys are held
      if (event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      
      this.toggleGroupFinished();
    });
  }
  
  public onGroupOpen(group: ManualGradingGroupRecord) {
    $(".examma-ray-grading-group-name").html(group.group_uuid);
    $(".examma-ray-grading-group-num-members").html(""+group.submissions.length);

    this.updateDisplayedSubmission();

    let gr = this.app.currentGroup?.grading_result;
    this.app.rubric?.forEach((ri, i) => this.rubricItemOutlets[ri.rubric_item_uuid]
      ?.updateStatus(gr && gr[ri.rubric_item_uuid]?.status)
      .updateNotes(gr && gr[ri.rubric_item_uuid]?.notes)
      .clearHighlights());
    this.updateGroupFinishedButton();
  }

  private updateDisplayedSubmission() {
    let sub = this.app.currentGroup?.submissions[0];
    if (sub) {
      let code = this.app.applyHarness(sub);
      this.lobster.project.setFileContents(new SourceFile("file.cpp", code));

      // get line number of submission
      let i = this.app.config.test_harness.indexOf("{{submission}}");
      if (i !== -1) {
        // number of lines
        let line = this.app.config.test_harness.slice(0, i).split("\n").length - 1;
        
        // number of lines in the submission
        let n = sub.submission.split("\n").length;

        // prefer to have it scroll so the submission is more in the middle
        let magic_offset = Math.floor(Math.max(0, 10 - n/5));

        this.lobster.projectEditor.codeMirror.scrollIntoView({from: {line: line, ch: 0}, to: {line: line + n + magic_offset, ch: 0}});

        for(let i = line; i < line + n; ++i) {
          this.lobster.projectEditor.codeMirror.addLineClass(i, "background", "examma-ray-codemirror-submission");
        }
        this.lobster.projectEditor.codeMirror.addLineClass(line, "background", "examma-ray-codemirror-submission-first");
        this.lobster.projectEditor.codeMirror.addLineClass(line + n - 1, "background", "examma-ray-codemirror-submission-last");
      }
    }
    else {
      this.lobster.project.setFileContents(new SourceFile("file.cpp", "[EMPTY GROUP]"));
    }
  }

  public onGroupClose() {
    $(".examma-ray-grading-group-name").html("[No group selected]");
    this.lobster.project.setFileContents(new SourceFile("file.cpp", "No submissions opened"));
  }

  public toggleRubricItem(rubric_item_uuid: string) {
    assert(this.app.rubric);

    if(!this.app.currentGroup) {
      return;
    }

    let currentStatus = this.app.currentGroup.grading_result[rubric_item_uuid]?.status ?? "off";
    if (currentStatus === "off") {
      currentStatus = "on";
    }
    else {
      currentStatus = "off";
    }
    // if (currentStatus === "off") {
    //   currentStatus = "on";
    // }
    // else if (currentStatus === "on") {
    //   currentStatus = "unknown";
    // }
    // else if (currentStatus === "unknown") {
    //   currentStatus = "off";
    // }
    // else {
    //   assertNever(currentStatus);
    // }
    
    this.app.performLocalOperation({
      kind: "set_rubric_item_status",
      group_uuid: this.app.currentGroup.group_uuid,
      rubric_item_uuid: rubric_item_uuid,
      status: currentStatus
    });
  }

  private updateGroupFinishedButton() {
    let elem = this.gradingFinishedButtonElem;
    elem.removeClass("btn-default").removeClass("btn-success");
    if (this.app.currentGroup?.finished) {
      elem.html(`<code>F</code> <i class="bi bi-check2-circle"></i> Finished`);
      elem.addClass("btn-success");
    }
    else {
      elem.html("<code>F</code> Mark as Finished");
      elem.addClass("btn-default");
    }
  }

  public toggleGroupFinished() {
    assert(this.app.rubric);

    if(!this.app.currentGroup) {
      return;
    }
    
    this.app.performLocalOperation({
      kind: "set_group_finished",
      group_uuid: this.app.currentGroup.group_uuid,
      finished: !this.app.currentGroup.finished
    });

  }

  private createRubricBar() {
    this.app.rubric
      .sort((ri_a, ri_b) => (ri_a.sort_index ?? "").localeCompare(ri_b.sort_index ?? ""))
      .forEach((ri, i) => this.createRubricItemOutlet(ri, i+1));
  }

  private resortRubricBar() {
    // detach all rubric item elements
    Object.values(this.rubricItemOutlets).forEach(ri_outlet => ri_outlet!.elem.detach());

    // Add back sorted elements
    Object.values(this.rubricItemOutlets)
      .sort((ri_out_a, ri_out_b) => (ri_out_a!.rubricItem.sort_index ?? "").localeCompare(ri_out_b!.rubricItem.sort_index ?? ""))
      .forEach((ri_out, i) => {
        ri_out!.updateDisplayIndex(i+1);
        ri_out!.elem.appendTo(this.rubricBarElem)
      });
  }

  private createRubricItemOutlet(ri: ManualGradingRubricItem, display_index: number | undefined) {
    let rubricItemElem = $(`<button type="button" class="list-group-item"></button>`).appendTo(this.rubricBarElem);
    let sub = this.app.currentGroup?.submissions[0];
    let skin = sub ? this.app.skins[sub?.skin_id] : undefined;
    let outlet = new RubricItemOutlet(this.app, rubricItemElem, ri, display_index, undefined, skin);
    this.rubricItemOutlets[ri.rubric_item_uuid] = outlet;
    rubricItemElem.on("click", () => {
      this.toggleRubricItem(ri.rubric_item_uuid);
    });
  }

  private createLobster() {
    let lobsterElem = $("#lobster-exercise");
  
    lobsterElem.append(createRunestoneExerciseOutlet("1"));
  
    let ex = new Exercise({
      checkpoints: [
        new EndOfMainStateCheckpoint("Passes Test Cases", (sim: Simulation) => {
          return !sim.hasAnyEventOccurred
        }, "", 5000)
      ],
      completionCriteria: COMPLETION_ALL_CHECKPOINTS,
      starterCode: "",
      completionMessage: "Code passes all checkpoints."
    });
  
    let project = new Project("test", undefined, [{ name: "file.cpp", isTranslationUnit: true, code: "" }], ex).turnOnAutoCompile(500);
    // new ProjectEditor($("#lobster-project-editor"), project);
    return new SimpleExerciseLobsterOutlet(lobsterElem, project);
  
  }

  public onRubricItemStatusSet(rubric_item_uuid: string, status: ManualGradingRubricItemStatus, remote_grader_email?: string) {
      this.rubricItemOutlets[rubric_item_uuid]?.updateStatus(status).highlight(remote_grader_email);
  }

  public onRubricItemNotesSet(rubric_item_uuid: string, notes: string, remote_grader_email?: string) {
      this.rubricItemOutlets[rubric_item_uuid]?.updateNotes(notes).highlight(remote_grader_email);
  }

  public onRubricItemEdit(rubric_item_uuid: string, remote_grader_email?: string) {
    this.rubricItemOutlets[rubric_item_uuid]?.update().highlight(remote_grader_email);
    this.resortRubricBar();
  }

  public onGroupFinishedSet(group_uuid: string, remote_grader_email?: string) {
    this.updateGroupFinishedButton();
  }

  public onRubricItemCreated(ri: ManualGradingRubricItem, remote_grader_email?: string) {
    this.createRubricItemOutlet(ri, this.app.rubric.length);
    this.rubricItemOutlets[ri.rubric_item_uuid]?.highlight(remote_grader_email);
    this.resortRubricBar();
  }

  public onGraderConfigEdit(remote_grader_email?: string) {
    if (!this.app.currentGroup) {
      return;
    }
    this.updateDisplayedSubmission();
  }

  public onGroupSubmissionsChanged(remote_grader_email?: string) {
    if (!this.app.currentGroup) {
      return;
    }
    this.onGroupOpen(this.app.currentGroup);
  }
}

class RubricItemOutlet {

  public readonly app: ManualCodeGraderApp;

  public readonly rubricItem: ManualGradingRubricItem;
  private status?: ManualGradingRubricItemStatus;
  private notes?: string;
  private skin?: ExamComponentSkin;

  public readonly display_index?: number;

  public readonly elem: JQuery;
  private readonly contentElem: JQuery;

  public constructor(app: ManualCodeGraderApp, elem: JQuery, ri: ManualGradingRubricItem, display_index: number | undefined, grading_result?: RubricItemGradingResult, skin?: ExamComponentSkin) {
    this.app = app;
    this.elem = elem;
    this.rubricItem = ri;
    this.display_index = display_index;
    this.status = grading_result?.status;
    this.notes = grading_result?.notes;
    this.skin = skin;

    this.contentElem = $("<div></div>").appendTo(elem);

    $('<div class="examma-ray-rubric-item-avatar-bar" style="position: absolute; bottom: 0; left: 5px; text-align: left;"></div>').appendTo(elem);

    let buttonBar = $('<div class="examma-ray-rubric-item-button-bar"></div>').appendTo(elem);
    $(`<button class="btn btn-primary btn-xs">Edit</button>`)
      .appendTo(buttonBar)
      .on("click", async (e) => {
        e.stopPropagation();
        this.openEditModal()
      });
    buttonBar.append(" ");
    $(`<button class="btn btn-primary btn-xs">Notes</button>`)
      .appendTo(buttonBar)
      .on("click", async (e) => {
        e.stopPropagation();
        this.openNotesModal()
      });

    this.refreshContent();
  }

  public update() {
    // assert(rubric_item.rubric_item_uuid === this.rubricItem.rubric_item_uuid);
    // this.rubricItem = rubric_item;
    this.refreshContent();
    return this;
  }

  public updateStatus(status: ManualGradingRubricItemStatus | undefined) {
    this.status = status;
    this.refreshContent();
    return this;
  }

  public updateNotes(notes: string | undefined) {
    this.notes = notes;
    this.refreshContent();
    return this;
  }

  public updateSkin(skin: ExamComponentSkin) {
    this.skin = skin;
    this.refreshContent();
    return this;
  }

  public updateDisplayIndex(display_index: number) {
    asMutable(this).display_index = display_index;
    this.refreshContent();
    return this;
  }

  public refreshContent() {
    let skinnedTitle = applySkin(this.rubricItem.title, this.skin);
    let skinnedDesc = applySkin(this.rubricItem.description, this.skin);
    this.contentElem.html(`
      ${renderShortPointsWorthBadge(this.rubricItem.points)}
      <div class="examma-ray-rubric-item-title"><b>${this.renderDisplayIndexLabel()} ${mk2html_unwrapped(skinnedTitle)}</b></div>
      ${mk2html(skinnedDesc)}
    `);
    
    this.elem.removeClass("list-group-item-success").removeClass("list-group-item-danger").removeClass("list-group-item-warning");
    this.elem.find(".examma-ray-unknown-rubric-item-icon").remove();
    this.elem.find(".examma-ray-rubric-item-notes-icon").remove();
    if (this.status === "on") {
      if (this.rubricItem.points >= 0) {
        this.elem.addClass("list-group-item-success");
      }
      else {
        this.elem.addClass("list-group-item-danger");
      }
    }
    else if (this.status === "unknown") {
      this.elem.addClass("list-group-item-warning");
      this.elem.append($(`<span class="examma-ray-unknown-rubric-item-icon"><i class="bi bi-question-diamond-fill"></i><span>`));
    }

    if (this.notes) {
      this.elem.append($(`<span class="examma-ray-rubric-item-notes-icon"><i class="bi bi-info-circle-fill"></i><span>`));
    }
  }

  private renderDisplayIndexLabel() {
    return this.display_index !== undefined ? `<code>${this.display_index}</code>` : "";
  }

  private openEditModal() {
    $("#edit-rubric-item-submit-button").html("Edit");
    $("#edit-rubric-item-input-uuid").val(this.rubricItem.rubric_item_uuid);
    $("#edit-rubric-item-input-title").val(this.rubricItem.title);
    $("#edit-rubric-item-input-description").val(this.rubricItem.description);
    $("#edit-rubric-item-input-sort-index").val(this.rubricItem.sort_index ?? "");
    $("#edit-rubric-item-input-points").val(this.rubricItem.points);
    $("#edit-rubric-item-modal").data("edit-rubric-item-mode", "edit");
    $("#edit-rubric-item-modal").modal("show");
  }

  private openNotesModal() {
    if (!this.app.currentGroup) {
      return;
    }

    $("#edit-rubric-notes-input-group-uuid").val(this.app.currentGroup.group_uuid);
    $("#edit-rubric-notes-input-rubric-item-uuid").val(this.rubricItem.rubric_item_uuid);
    $("#edit-rubric-notes-title").html(this.rubricItem.title);
    $("#edit-rubric-notes-description").html(this.rubricItem.description);
    $("#edit-rubric-notes-input-notes").val(this.notes ?? "");
    $("#edit-rubric-notes-modal").modal("show");
  }

  public highlight(grader_email: string | undefined) {
    if (!grader_email) { return; }
    let avatarElem = $(`<div style="display: inline-block" data-toggle="tooltip" data-placement="bottom" title="${grader_email}">
      ${avatar(grader_email, { size: ACTIVE_GRADER_AVATAR_SIZE })}
    </div>`);
    this.elem.find(".examma-ray-rubric-item-avatar-bar").append(avatarElem);
    setTimeout(() => avatarElem.fadeOut(3000, () => avatarElem.remove()), 5000);
    return this;
  }

  public clearHighlights() {
    this.elem.find(".examma-ray-rubric-item-avatar-bar").empty();
  }
}


class GroupThumbnailsPanel {

  public readonly app: ManualCodeGraderApp;

  private elem: JQuery;

  private groupThumbnailOutletsMap: {
    [index: string]: GroupThumbnailOutlet | undefined
  } = { };
  
  private groupThumbnailOutlets: GroupThumbnailOutlet[] = [];

  private submissionsFilterCriterion : SubmissionsFilterCriterion = "all";
  private submissionsSortCriteria : SubmissionsSortCriterion = "name";
  private submissionsSortOrdering : SubmissionsSortOrdering = "asc";

  private SUBMISSION_SORTS : {
    [k in SubmissionsSortCriterion]: (a: ManualGradingGroupRecord, b: ManualGradingGroupRecord) => number
  } = {
    "name": (a: ManualGradingGroupRecord, b: ManualGradingGroupRecord) => a.group_uuid.localeCompare(b.group_uuid, undefined, {numeric: true}),
    "size": (a: ManualGradingGroupRecord, b: ManualGradingGroupRecord) => a.submissions.length - b.submissions.length,
    "score": (a: ManualGradingGroupRecord, b: ManualGradingGroupRecord) => this.app.pointsEarned(a.grading_result) - this.app.pointsEarned(b.grading_result),
  };

  public constructor(app: ManualCodeGraderApp, elem: JQuery) {
    this.app = app;
    this.elem = elem;
  
    this.initComponents();

    this.createGroupThumbnails();
  }

  private initComponents() {
    
    const self = this;
    $(".examma-ray-submissions-filter-button").on("click", function() {
        $(".examma-ray-submissions-filter-button").removeClass("btn-primary").addClass("btn-default");
        $(this).removeClass("btn-default").addClass("btn-primary");
        self.setSubmissionsFilterCriterion($(this).data("filter-criterion"))
    });
  
    $(".examma-ray-submissions-sort-button").on("click", function() {
        $(".examma-ray-submissions-sort-button").removeClass("btn-primary").addClass("btn-default");
        $(this).removeClass("btn-default").addClass("btn-primary");
        self.setSubmissionsSortCriterion($(this).data("sort-criterion"))
    });
  
    $(".examma-ray-submissions-sort-ordering-button").on("click", function() {
        $(".examma-ray-submissions-sort-ordering-button").removeClass("btn-primary").addClass("btn-default");
        $(this).removeClass("btn-default").addClass("btn-primary");
        self.setSubmissionsSortOrdering($(this).data("sort-ordering"));
    });
  }

  private createGroupThumbnails() {

    this.elem.empty();
    Object.values(this.groupThumbnailOutletsMap).forEach(out => out!.dispose());
    this.groupThumbnailOutletsMap = {};

    this.groupThumbnailOutlets = Object.values(this.app.grading_records.groups).map(group => {
      let outlet = new GroupThumbnailOutlet(this.app, $("<div></div>"), group!);
      this.groupThumbnailOutletsMap[group!.group_uuid] = outlet;
      return outlet
    });
    this.updateDisplayedThumbnails();

    if (this.app.currentGroup) {
      this.onGroupOpened(this.app.currentGroup);
    }
  }

  public getNextNGroups(n: number) {

    let candidates = this.groupThumbnailOutlets;

    if (this.app.currentGroup) {
      let currentGroupIndex = this.groupThumbnailOutlets.findIndex(outlet => outlet.group.group_uuid === this.app.currentGroup!.group_uuid);
      if (currentGroupIndex != -1) {
        // lets say current group is X:
        // [ A B C X D E F G]
        // This rearranges to:
        // [ D E F G A B C]
        candidates = candidates.slice(currentGroupIndex + 1).concat(candidates.slice(0, currentGroupIndex))
      }
    }

    candidates = candidates.filter(outlet => !outlet.group.finished);

    return candidates.slice(0, 10).map(outlet => outlet.group.group_uuid);
  }

  public onGroupOpened(group: ManualGradingGroupRecord) {
    this.groupThumbnailOutletsMap[group.group_uuid]?.onGroupOpened();
  }

  public onGroupClosed(group: ManualGradingGroupRecord) {
    this.groupThumbnailOutletsMap[group.group_uuid]?.onGroupClosed();
  }

  public setSubmissionsFilterCriterion(criterion: SubmissionsFilterCriterion) {
    this.submissionsFilterCriterion = criterion;
    this.updateDisplayedThumbnails();
  }

  public setSubmissionsSortCriterion(criterion: SubmissionsSortCriterion) {
    this.submissionsSortCriteria = criterion;
    this.updateDisplayedThumbnails();
  }

  public setSubmissionsSortOrdering(ordering: SubmissionsSortOrdering) {
    this.submissionsSortOrdering = ordering;
    this.updateDisplayedThumbnails();
  }

  private updateDisplayedThumbnails() {
    
    // detach all thumbnail elements
    Object.values(this.groupThumbnailOutletsMap).forEach(to => to!.elem.detach());

    // Attached filtered, sorted, elements
    this.groupThumbnailOutlets = Object.values(this.groupThumbnailOutletsMap).map(to => to!.group)
      .filter(SUBMISSION_FILTERS[this.submissionsFilterCriterion])
      .sort(this.SUBMISSION_SORTS[this.submissionsSortCriteria])
      .map(group => this.groupThumbnailOutletsMap[group.group_uuid]!);
      
    if (this.submissionsSortOrdering === "dsc") {
      this.groupThumbnailOutlets = this.groupThumbnailOutlets.reverse();
    }

    this.groupThumbnailOutlets.forEach(to => to.elem.appendTo(this.elem));
  }

  public onGroupGradingResultUpdated(group_uuid: string) {
    this.groupThumbnailOutletsMap[group_uuid]?.onGroupGradingResultUpdated();
  }

  public onGroupFinishedSet(group_uuid: string, remote_grader_email?: string) {
    this.groupThumbnailOutletsMap[group_uuid]?.onGroupFinishedSet(remote_grader_email);
  }

  public onRubricUpdated() {
    Object.values(this.groupThumbnailOutletsMap).forEach(to => to!.onRubricUpdated());
  }

  public updateGraderAvatars(pingResponse: ManualGradingPingResponse) {
    Object.values(this.groupThumbnailOutletsMap).forEach(to => to!.updateActiveGraders(pingResponse));
  }

  public onGroupsChanged(remote_grader_email?: string) {
    this.createGroupThumbnails();
  }
}

class GroupThumbnailOutlet {

  public readonly app: ManualCodeGraderApp;
  public readonly group: ManualGradingGroupRecord;

  public readonly elem: JQuery;
  private readonly badgesElem : JQuery;
  private readonly avatarsElem : JQuery;

  private activeGraders: string[] = [];
  

  public constructor(app: ManualCodeGraderApp, elem: JQuery, group: ManualGradingGroupRecord) {
    this.app = app;
    this.elem = elem;
    this.group = group;

    elem.addClass("panel panel-default examma-ray-grading-group-thumbnail");
    this.createContent();
    this.badgesElem = this.elem.find(".group-thumbnail-badges");
    this.avatarsElem = this.elem.find(".group-thumbnail-avatars");
    this.refreshBadges();
    
    elem.on("click", () => {
      this.app.openGroup(group.group_uuid);
    });
  }

  public dispose() {
    // nothing to do
  }

  private createContent() {
    if (this.group.submissions.length === 0) {
      this.elem.html("[EMPTY GROUP ] " + this.group.group_uuid);
      return;
    }

    let response = this.group.submissions[0].submission;

    this.elem.css("position", "relative");
    this.elem.html(`
      <div class="panel-heading">
        <span class="group-thumbnail-badges"></span>
        <span class="badge">${this.group.submissions.length}</span>
        ${this.group.group_uuid} 
      </div>
      <div class="panel-body">
        <pre><code>${highlightCode(response, CODE_LANGUAGE)}</code></pre>
      </div>
      <span class="group-thumbnail-avatars"></span>
    `);
  }

  private refreshBadges() {
    this.badgesElem.html(
      this.group.finished || isMeaningfulManualGradingResult(this.group.grading_result)
        ? renderScoreBadge(this.app.pointsEarned(this.group.grading_result), this.app.question.pointsPossible, this.group.finished ? VERIFIED_ICON : "")
        : renderUngradedBadge(this.app.question.pointsPossible)
    );
  }

  public onGroupOpened() {
    this.elem.addClass("panel-primary");
    this.elem[0].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }

  public onGroupClosed() {
    this.elem.removeClass("panel-primary");
  }

  public onGroupGradingResultUpdated() {
    this.refreshBadges();
  }

  public onGroupFinishedSet(remote_grader_email?: string) {
    this.refreshBadges();
  }

  public onRubricUpdated() {
    this.refreshBadges();
  }

  public updateActiveGraders(pingResponse: ManualGradingPingResponse) {
    let clients = pingResponse.active_graders.graders;
    this.avatarsElem.empty();
    Object.values(clients).forEach(client => {
      if (client.group_uuid === this.group.group_uuid) {
        let avatarElem = $(`<div style="display: inline-block; margin-left: 5px;" data-toggle="tooltip" data-placement="bottom" title="${client.email}">
          ${avatar(client.email, { size: ACTIVE_GRADER_AVATAR_SIZE })}
        </div>`);
        this.avatarsElem.append(avatarElem);
      }
    });
    this.avatarsElem.children().tooltip();
  }
}


async function loadRubric(client: ExammaRayGraderClient, exam_id: string, question_id: string) {
  const rubric_response = await axios({
    url: `api/manual_grading/${exam_id}/questions/${question_id}/rubric`,
    method: "GET",
    data: {},
    headers: {
        'Authorization': 'bearer ' + client.getBearerToken()
    }
  });
  return <ManualGradingRubricItem[]>rubric_response.data;
}

async function loadConfig(client: ExammaRayGraderClient, exam_id: string, question_id: string) {
  const rubric_response = await axios({
    url: `api/manual_grading/${exam_id}/questions/${question_id}/config`,
    method: "GET",
    data: {},
    headers: {
        'Authorization': 'bearer ' + client.getBearerToken()
    }
  });
  return <ManualCodeGraderConfiguration>rubric_response.data;
}

async function loadGradingRecords(client: ExammaRayGraderClient, exam_id: string, question_id: string) {
  const records_response = await axios({
    url: `api/manual_grading/${exam_id}/questions/${question_id}/records`,
    method: "GET",
    data: {},
    headers: {
        'Authorization': 'bearer ' + client.getBearerToken()
    }
  });
  return <ManualGradingQuestionRecords>records_response.data;
}

async function loadSkins(client: ExammaRayGraderClient, exam_id: string, question_id: string) {
  const records_response = await axios({
    url: `api/manual_grading/${exam_id}/questions/${question_id}/skins`,
    method: "GET",
    data: {},
    headers: {
        'Authorization': 'bearer ' + client.getBearerToken()
    }
  });
  return <ManualGradingSkins>records_response.data;
}