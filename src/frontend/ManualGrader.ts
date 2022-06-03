import avatar from "animal-avatar-generator";
import axios from "axios";
import { ExamComponentSkin, Question, QuestionSpecification } from "examma-ray";
import { applySkin, mk2html, mk2html_unwrapped } from "examma-ray/dist/core/render";
import { renderScoreBadge, renderShortPointsWorthBadge, renderUngradedBadge } from "examma-ray/dist/core/ui_components";
import hotkeys from "hotkeys-js";
import { EndOfMainStateCheckpoint } from "lobster-vis/dist/js/analysis/checkpoints";
import { Program } from "lobster-vis/dist/js/core/Program";
import { COMPLETION_ALL_CHECKPOINTS, Exercise, Project } from "lobster-vis/dist/js/core/Project";
import { Simulation } from "lobster-vis/dist/js/core/Simulation";
import { createRunestoneExerciseOutlet } from "lobster-vis/dist/js/view/embeddedExerciseOutlet";
import { SimpleExerciseLobsterOutlet } from "lobster-vis/dist/js/view/SimpleExerciseLobsterOutlet";
import { v4 as uuidv4 } from "uuid";
import { ActiveQuestionGraders, GradingGroupReassignment, isMeaningfulManualGradingResult, isMeaningfulRubricItemGradingResult, ManualCodeGraderConfiguration, ManualGradingEpochTransition, ManualGradingGroupRecord, ManualGradingOperation, ManualGradingPingRequest, ManualGradingPingResponse, ManualGradingQuestionRecords, ManualGradingResult, ManualGradingRubricItem, ManualGradingRubricItemStatus, ManualGradingSkins, ManualGradingSubmission, NextUngradedRequest, NextUngradedResponse, reassignGradingGroups, RubricItemGradingResult } from "../manual_grading";
import { asMutable, assert, assertFalse, assertNever } from "../util/util";
import { ExammaRayGraderClient } from "./Application";
import "./code-grader.css";
import randomColor from "randomcolor";



export interface ManualGradingSubmissionComponent {
  onConfigUpdate() : void;
  updateDisplayedSubmission() : void;
  renderSubmissionThumbnail(sub: ManualGradingSubmission) : string;
  groupOneSubmission(equivalenceGroups: (ManualGradingGroupRecord & { repProgram?: Program })[], sub: ManualGradingSubmission) : Promise<void>;
  autogradeGroup(group: ManualGradingGroupRecord) : Promise<(RubricItemGradingResult | undefined)[] | undefined>
}



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


export class ManualGraderApp {

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

  private groupMemberThumbnailsElem: JQuery;
  private statusElem: JQuery;
  private gradingProgressBarElem: JQuery;

  public submissionComponent: ManualGradingSubmissionComponent;
  
  private constructor(client: ExammaRayGraderClient, submissionComponent: new (app: ManualGraderApp) => ManualGradingSubmissionComponent, exam_id: string, question: Question, rubric: ManualGradingRubricItem[], config: ManualCodeGraderConfiguration, records: ManualGradingQuestionRecords, skins: ManualGradingSkins) {
    this.client = client;
    this.exam_id = exam_id;
    this.question = question;
    this.config = config;
    this.rubric = rubric;
    this.grading_records = records;
    this.skins = skins;

    this.submissionComponent = new submissionComponent(this);

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
    $(".examma-ray-autograde-button").on("click", async () => this.autograde());

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

  public static async create(submissionComponent: new (app: ManualGraderApp) => ManualGradingSubmissionComponent, exam_id: string, question_id: string) {

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

      return new ManualGraderApp(client, submissionComponent, exam_id, question, rubric, config, records, skins);
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
      this.submissionComponent.onConfigUpdate();
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
    
    this.submissionComponent.updateDisplayedSubmission();
    this.groupGrader.onGroupOpen(group);

    $(".examma-ray-submissions-column").find(".panel-primary").removeClass("panel-primary");
    this.groupThumbnailsPanel.onGroupOpened(group);

  }

  private createMemberThumbnail(group_uuid: string, sub: ManualGradingSubmission) {
    let jq = $(`
      <div class="panel panel-default examma-ray-group-member-thumbnail">
        <div class="panel-heading">
          <span class="label label-primary" style="background-color: ${randomColor({seed: sub.exam_id, luminosity: "bright"})};">${sub.exam_id}</span>
          ${sub.uniqname}
          <button type="button" class="btn btn-sm btn-danger examma-ray-group-member-remove-button" aria-label="Remove"><span aria-hidden="true">Remove</span></button>
        </div>
        <div class="panel-body">
          ${this.submissionComponent.renderSubmissionThumbnail(sub)}
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
    this.submissionComponent.updateDisplayedSubmission();
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
      await this.submissionComponent.groupOneSubmission(newGroups, sub);
    }

    let assignment : {[index: string]: string} = {};
    newGroups.forEach(group => group.submissions.forEach(sub => assignment[sub.submission_uuid] = group.group_uuid));

    this.performLocalOperation({
      kind: "assign_groups_operation",
      assignment: assignment
    });

    $("#examma-ray-grouping-progress-modal").modal("hide");
  }

  public async autograde() {

    $("#examma-ray-autograding-modal").modal("show");

    const attempted_groups = new Set<string>();

    await this.claimNextUngraded();

    while (this.currentGroup && !attempted_groups.has(this.currentGroup.group_uuid)) {
      const group = this.currentGroup;
      attempted_groups.add(group.group_uuid);

      // Attempt to autograde the group. Autograder will return undefined if it
      // declines to set any rubric items.
      let ag_result = await this.submissionComponent.autogradeGroup(group);
      if (ag_result && ag_result.some(res => res?.status)) {
        ag_result.forEach((result, i) => {
          if (result?.status) {
            this.performLocalOperation({
              kind: "set_rubric_item_status",
              group_uuid: group.group_uuid,
              rubric_item_uuid: this.rubric[i].rubric_item_uuid,
              status: result.status
            });
          }
        });
        
        this.performLocalOperation({
          kind: "set_group_finished",
          group_uuid: group.group_uuid,
          finished: true
        });
      }

      // Get the next submission to attempt to autograde
      await this.claimNextUngraded();
    }

    
    $("#examma-ray-autograding-modal").modal("hide");
  }


  public rubricFilter(group: ManualGradingGroupRecord, rubricFilter : {[index: string]: boolean | undefined}) {
  
    return this.groupGrader.getRubricItemOutlets().every(ri => {
      let rf = rubricFilter[""+ri?.display_index];
      if (rf === undefined) {
        // no specification in the filter, ok
        return true;
      }

      const status = group.grading_result[ri?.rubricItem.rubric_item_uuid]?.status;

      if (rf === true) {
        return status === "on";
      }

      if (rf === false) {
        return !status || status === "off" || status === "unknown";
      }

      return false;
    });
  }

};




const VERIFIED_ICON = `<i class="bi bi-check2-circle" style="vertical-align: text-top;"></i> `;

class GroupGraderOutlet {

  public readonly app: ManualGraderApp;

  private rubricItemOutlets: {
    [index: string]: RubricItemOutlet | undefined
  } = { };

  private rubricBarElem: JQuery;
  private gradingFinishedButtonElem: JQuery;

  public constructor(app: ManualGraderApp) {
    this.app = app;

    this.rubricBarElem = $(".examma-ray-grading-rubric-buttons")
      .addClass("list-group");

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

    // Note that this needs to match against "*", rather than "1,2,3,4,5,6,7,8,9"
    // because the latter will only match against key events where they numeric
    // key is the ONLY thing currently pressed. This causes issues for graders that
    // use a "rolling" style where they press hotkeys in quick succession with
    // multiple fingers, where the next hotkey wouldn't be registered if the previous
    // key hadn't yet been fully released.
    hotkeys("*", (event, handler) => {

      // do nothing if modifier keys are held
      if (event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      
      let key = parseInt(event.key);
      if (Number.isNaN(key) || key < 0 || key > 9) {
        return; // It wasn't a numeric hotkey (or was somehow not 0-9 idk if that's possible lol)
      }

      // do nothing if any modal is open
      if ($(".modal.in").length > 0) {
        return;
      }

      Object.values(this.rubricItemOutlets).forEach(ri => {
        if (ri!.display_index === key) {
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

    let sub = group.submissions[0];
    let skin = sub ? this.app.skins[sub.skin_id] : undefined;
    let gr = this.app.currentGroup?.grading_result;
    this.app.rubric?.forEach((ri, i) => this.rubricItemOutlets[ri.rubric_item_uuid]
      ?.updateSkin(skin)
      ?.updateStatus(gr && gr[ri.rubric_item_uuid]?.status)
      .updateNotes(gr && gr[ri.rubric_item_uuid]?.notes)
      .clearHighlights());
    this.updateGroupFinishedButton();
  }

  public onGroupClose() {
    $(".examma-ray-grading-group-name").html("[No group selected]");
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

  public onGroupSubmissionsChanged(remote_grader_email?: string) {
    if (!this.app.currentGroup) {
      return;
    }
    this.onGroupOpen(this.app.currentGroup);
  }

  public getRubricItemOutlets() {
    return <RubricItemOutlet[]>Object.values(this.rubricItemOutlets);
  }
}

class RubricItemOutlet {

  public readonly app: ManualGraderApp;

  public readonly rubricItem: ManualGradingRubricItem;
  private status?: ManualGradingRubricItemStatus;
  private notes?: string;
  private skin?: ExamComponentSkin;

  public readonly display_index?: number;

  public readonly elem: JQuery;
  private readonly contentElem: JQuery;

  public constructor(app: ManualGraderApp, elem: JQuery, ri: ManualGradingRubricItem, display_index: number | undefined, grading_result?: RubricItemGradingResult, skin?: ExamComponentSkin) {
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

  public updateSkin(skin: ExamComponentSkin | undefined) {
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

  public readonly app: ManualGraderApp;

  private elem: JQuery;

  private groupThumbnailOutletsMap: {
    [index: string]: GroupThumbnailOutlet | undefined
  } = { };
  
  private groupThumbnailOutlets: GroupThumbnailOutlet[] = [];

  private submissionsUniqnameFilter? : string;
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

  public constructor(app: ManualGraderApp, elem: JQuery) {
    this.app = app;
    this.elem = elem;
  
    this.initComponents();

    this.createGroupThumbnails();
  }

  private initComponents() {
    
    const self = this;

    $("#examma-ray-submissions-uniqname-filter").on("input", function() {
      self.setSubmissionsUniqnameFilter($(this).val()?.toString() ?? "")
    });

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
      return outlet;
    });
    this.updateDisplayedThumbnails();

    if (this.app.currentGroup) {
      this.onGroupOpened(this.app.currentGroup);
    }

    $("#examma-ray-submissions-uniqname-list").html(
      this.groupThumbnailOutlets.flatMap(gout => gout.group.submissions.map(sub => `<option value="${sub.uniqname}">`)).join("\n")
    );
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

  public setSubmissionsUniqnameFilter(uniqname: string) {
    this.submissionsUniqnameFilter = uniqname;
    this.updateDisplayedThumbnails();
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

    let uniqnameFilter : string | undefined;
    let rubricFilter : {[index: string]: boolean | undefined} | undefined;

    try {
      // Attempt to parse as a rubric filter
      let rfParsed : {[index: string]: boolean | undefined} = JSON.parse(this.submissionsUniqnameFilter ?? "{");
  
      if (rfParsed && typeof rfParsed === "object") {
        rubricFilter = rfParsed;
      }
    }
    catch(e) { }

    if (!rubricFilter) {
      uniqnameFilter = this.submissionsUniqnameFilter;
    }

    // Attached filtered, sorted, elements
    this.groupThumbnailOutlets = Object.values(this.groupThumbnailOutletsMap).map(to => to!.group)
      .filter(group => !uniqnameFilter || group.submissions.find(sub => sub.uniqname === uniqnameFilter))
      .filter(group => !rubricFilter || this.app.rubricFilter(group, rubricFilter))
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

  public readonly app: ManualGraderApp;
  public readonly group: ManualGradingGroupRecord;

  public readonly elem: JQuery;
  private readonly badgesElem : JQuery;
  private readonly avatarsElem : JQuery;

  private activeGraders: string[] = [];
  

  public constructor(app: ManualGraderApp, elem: JQuery, group: ManualGradingGroupRecord) {
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

    this.elem.css("position", "relative");
    this.elem.html(`
      <div class="panel-heading">
        <span class="group-thumbnail-badges"></span>
        <span class="badge">${this.group.submissions.length}</span>
        ${this.group.group_uuid} 
      </div>
      <div class="panel-body">
        ${this.app.submissionComponent.renderSubmissionThumbnail(this.group.submissions[0])}
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