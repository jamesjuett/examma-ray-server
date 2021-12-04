// import indentString from "indent-string";
// import { Program, SimpleProgram, SourceFile } from "lobster-vis/dist/js/core/Program"
// import { SimpleExerciseLobsterOutlet } from "lobster-vis/dist/js/view/SimpleExerciseLobsterOutlet"
// import { createRunestoneExerciseOutlet } from "lobster-vis/dist/js/view/embeddedExerciseOutlet"

// import { applySkin, highlightCode, mk2html } from "examma-ray/dist/core/render";
// import "highlight.js/styles/github.css";

// import "./code-grader.css";
// import { COMPLETION_ALL_CHECKPOINTS, Exercise, Project } from "lobster-vis/dist/js/core/Project";
// import "lobster-vis/dist/css/buttons.css"
// import "lobster-vis/dist/css/main.css"
// import "lobster-vis/dist/css/code.css"
// import "lobster-vis/dist/css/exercises.css"
// import "lobster-vis/dist/css/frontend.css"
// import { Checkpoint } from "lobster-vis/dist/js/analysis/checkpoints";
// import "lobster-vis/dist/js/lib/standard";
// import { renderScoreBadge, renderShortPointsWorthBadge, renderUngradedBadge } from "examma-ray/dist/core/ui_components";
// import { QuestionSpecification, ExamComponentSkin, Question } from "examma-ray";
// import deepEqual from "deep-equal";
// import { v4 as uuidv4 } from "uuid";

// import queryString from "query-string";
// import { ManualCodeGraderConfiguration, ManualGradingGroupRecord, ManualGradingPingRequest, ManualGradingPingResponse, ManualGradingQuestionRecords, ManualGradingResult, ManualGradingRubricItem, ManualGradingRubricItemStatus, ManualGradingSubmission } from "../../manual_grading";
// import { asMutable, assert, assertFalse, assertNever } from "../../util/util";
// import axios from "axios";
// import { ExammaRayGraderClient } from "../Application";
// import avatar from "animal-avatar-generator";
// import { EditRubricItemOperation, ManualGradingEpochTransition, ManualGradingOperation, SetRubricItemStatusOperation } from "../../ExammaRayGradingServer";

// // Because this grader is based on Lobster, it only works for C++ code
// // Perhaps in the future it will be generalized to other languages and
// // have the option to just use a regular codemirror instance rather than
// // lobster.
// const CODE_LANGUAGE = "cpp";

// const ACTIVE_GRADER_AVATAR_SIZE = 30;



// type SubmissionsFilterCriterion = "all" | "graded" | "ungraded";
// type SubmissionsSortCriterion = "name" | "size" | "score";
// type SubmissionsSortOrdering = "asc" | "dsc";


// function isFullyGraded(sub: ManualGradingGroupRecord) {
//   return !!sub.grading_result?.verified;
// }

// const SUBMISSION_FILTERS : {
//   [k in SubmissionsFilterCriterion]: (sub: ManualGradingGroupRecord) => boolean
// } = {
//   "all": (sub: ManualGradingGroupRecord) => true,
//   "graded": (sub: ManualGradingGroupRecord) => isFullyGraded(sub),
//   "ungraded": (sub: ManualGradingGroupRecord) => !isFullyGraded(sub),
// }

// // export type CodeWritingManualGraderAppSpecification = {
// //   testHarness: string,
// //   extract_code?: (raw_submission: string, skin: ExamComponentSkin) => string,
// //   skin_override?: ExamComponentSkin,
// //   preprocess?: (submission: string) => string,
// //   checkpoints: Checkpoint[],
// //   // autograder: (ex: Exercise) => ManualGradingResult,
// //   groupingFunctionName: string
// // };

// export const DEFAULT_EXTRACT_CODE = (raw_submission: string) => {
//   assert(typeof raw_submission === "string");
//   return raw_submission;
// };

// export class ManualCodeGraderApp {

//   public readonly client: ExammaRayGraderClient;
//   public readonly groupGrader: GroupGraderOutlet;

//   public readonly exam_id: string;
//   public readonly question: Question;
//   public readonly rubric: ManualGradingRubricItem[];
//   public readonly grading_records: ManualGradingQuestionRecords;

//   private local_changes: ManualGradingOperation[] = [];
//   private pendingPing: boolean = false;

//   // public readonly currentGroup?: ManualGradingGroupRecord;


//   // private extract_code: (raw_submission: string, skin: ExamComponentSkin) => string;
//   private skin_override?: ExamComponentSkin;
//   // private preprocess?: (submission: string) => string;
//   // private testHarness: string;
//   // private groupingFunctionName: string;

//   private groupMemberThumbnailsElem: JQuery;

//   private thumbnailElems: {[index: string]: JQuery} = {};
  
//   private submissionsFilterCriterion : SubmissionsFilterCriterion = "all";
//   private submissionsSortCriteria : SubmissionsSortCriterion = "name";
//   private submissionsSortOrdering : SubmissionsSortOrdering = "asc";
//   // private submissions

//   private SUBMISSION_SORTS : {
//     [k in SubmissionsSortCriterion]: (a: ManualGradingGroupRecord, b: ManualGradingGroupRecord) => number
//   } = {
//     "name": (a: ManualGradingGroupRecord, b: ManualGradingGroupRecord) => a.group_uuid.localeCompare(b.group_uuid, undefined, {numeric: true}),
//     "size": (a: ManualGradingGroupRecord, b: ManualGradingGroupRecord) => a.submissions.length - b.submissions.length,
//     "score": (a: ManualGradingGroupRecord, b: ManualGradingGroupRecord) => this.pointsEarned(a.grading_result) - this.pointsEarned(b.grading_result),
    
//   }
//   public readonly config?: ManualCodeGraderConfiguration;
  
//   private constructor(client: ExammaRayGraderClient, exam_id: string, question: Question, rubric: ManualGradingRubricItem[], records: ManualGradingQuestionRecords) {
//     this.client = client;
//     this.exam_id = exam_id;
//     this.question = question;
//     this.rubric = rubric;
//     this.grading_records = records;

//     this.groupGrader = new GroupGraderOutlet(this, rubric);

//     // this.testHarness = spec.testHarness;
//     // this.extract_code = spec.extract_code ?? DEFAULT_EXTRACT_CODE;
//     // this.skin_override = spec.skin_override;
//     // this.preprocess = spec.preprocess;
//     // this.groupingFunctionName = spec.groupingFunctionName;

//     $(".examma-ray-grading-title").html(this.question.question_id);
//     this.groupMemberThumbnailsElem = $(".examma-ray-group-member-thumbnails");

//     this.initComponents();

//     this.setRubric(rubric);
//     this.setGradingRecords(records);

//     setInterval(() => this.sendPing(), 1000);
//   }

//   private initComponents() {

//     $("#create-rubric-item-open-modal").on("click", async () => {
//       $("#edit-rubric-item-input-uuid").val(uuidv4());
//       $("#edit-rubric-item-input-title").val("");
//       $("#edit-rubric-item-input-description").val("");
//       $("#edit-rubric-item-input-points").val("");
//       $("#edit-rubric-item-modal").data("edit-rubric-item-mode", "create");
//       $("#edit-rubric-item-modal").modal("show");
//     });
      
//     $("#edit-rubric-item-submit-button").on("click", async () => {
//       let i = this.rubric?.length ?? 0;
      
//       if ($("#edit-rubric-item-modal").data("edit-rubric-item-mode") === "create") {
//         this.performLocalOperation({
//           kind: "create_rubric_item",
//           rubric_item: {
//             rubric_item_uuid: ""+$("#edit-rubric-item-input-uuid").val(),
//             title: ""+$("#edit-rubric-item-input-title").val(),
//             description: ""+$("#edit-rubric-item-input-description").val(),
//             points: parseInt(""+$("#edit-rubric-item-input-points").val()),
//             active: true
//           }
//         });
//       }
//       else {
//         this.performLocalOperation({
//           kind: "edit_rubric_item",
//           rubric_item_uuid: ""+$("#edit-rubric-item-input-uuid").val(),
//           edits: {
//             title: ""+$("#edit-rubric-item-input-title").val(),
//             description: ""+$("#edit-rubric-item-input-description").val(),
//             points: parseInt(""+$("#edit-rubric-item-input-points").val()),
//             active: true
//           }
//         });
//       }

//       $("#edit-rubric-item-modal").modal("hide");
//     });
//   }

//   public static async create(exam_id: string, question_id: string) {

//     try {
//       const client = await ExammaRayGraderClient.create();

//       const question_response = await axios({
//         url: `api/exams/${exam_id}/questions/${question_id}`,
//         method: "GET",
//         data: {},
//         headers: {
//             'Authorization': 'bearer ' + client.getBearerToken()
//         }
//       });
      
//       const question = Question.create(<QuestionSpecification>question_response.data);
//       const rubric = await loadRubric(client, exam_id, question_id);
//       const records = await loadGradingRecords(client, exam_id, question_id);

//       return new ManualCodeGraderApp(client, exam_id, question, rubric, records);
//     }
//     catch(e: unknown) {
//       alert("Error loading grading records :(");
//       throw e;
//     }

//   }

//   private async sendPing() {

//     // only one ping at a time
//     if (this.pendingPing) {
//       return;
//     }

//     if (!this.question || !this.grading_records) {
//       return;
//     }
    
//     this.pendingPing = true;

//     let pingRequest: ManualGradingPingRequest = {
//       client_uuid: this.client.client_uuid,
//       exam_id: this.exam_id,
//       question_id: this.question.question_id,
//       group_uuid: this.groupGrader.currentGroup?.group_uuid,
//       my_grading_epoch: this.grading_records.grading_epoch,
//       my_operations: this.local_changes.slice() // copy
//     };

//     // All local changes will be sent with the request and
//     // reflected in the response to come up to the latest grading
//     // epoch, so they'll be reapplied and we don't need to keep them.
//     this.local_changes.length = 0; // clear the array

//     const ping_response = await axios({
//       url: `api/manual_grading/${this.exam_id}/questions/${this.question.question_id}/ping`,
//       method: "POST",
//       data: pingRequest,
//       headers: {
//           'Authorization': 'bearer ' + this.client.getBearerToken()
//       }
//     });

//     // Note that after this promise resolves, there may be new local changes
//     // that will be reapplied after processing the remote ones via the call
//     // here
    
//     this.onPingResponse(<ManualGradingPingResponse>ping_response.data);
    
//     this.pendingPing = false;
//   }

//   private async onPingResponse(pingResponse: ManualGradingPingResponse) {

//     this.updateGraderAvatars(pingResponse);

//     if (pingResponse.epoch_transitions === "invalid") {
//       alert("Uh oh, something went wrong synchronizing your work to the server. This should never happen. Try reloading the page, I guess? :(");
//     }
//     else if (pingResponse.epoch_transitions === "reload") {
//       await this.reloadGradingRecords();
//     }
//     else {
//       this.applyRemoteEpochTransitions(pingResponse.epoch_transitions, pingResponse.grading_epoch);
//     }
//   }

//   private applyRemoteEpochTransitions(transitions: readonly ManualGradingEpochTransition[], to_epoch: number) {
    
//     assert(this.grading_records);

//     // Apply remote transitions
//     transitions.forEach(t => t.ops.forEach(op => this.applyOperation(op, t.client_uuid !== this.client.client_uuid ? t.grader_email : undefined)))

//     // Reapply our current set of local operations
//     this.local_changes.forEach(op => this.applyOperation(op));

//     this.grading_records.grading_epoch = to_epoch;
//   }

//   private updateGraderAvatars(pingResponse: ManualGradingPingResponse) {
//     let graders = pingResponse.active_graders[this.question.question_id].graders;
//     $(".examma-ray-active-graders").empty().html(
//       Object.values(graders).map(grader => grader.email).sort().map(
//         email => `<div style="display: inline-block;" data-toggle="tooltip" data-placement="bottom" title="${email}">
//           ${avatar(email, { size: ACTIVE_GRADER_AVATAR_SIZE })}
//         </div>`
//       ).join("")
//     );
//     $(".examma-ray-active-graders div").tooltip();
//   }

//   private setUpEventHandlers() {


//     // let fileInput = $("#load-grading-assignment-input");
//     // let loadButton = $("#load-grading-assignment-button");
//     // let autogradeButton = $("#examma-ray-grading-autograde-button");
  
//     // loadButton.on("click", () => GRADING_APP.loadGradingAssignmentFile());
  
//     // autogradeButton.on("click", () => GRADING_APP.autograde());
//     const self = this;
//     $(".examma-ray-submissions-filter-button").on("click", function() {
//         $(".examma-ray-submissions-filter-button").removeClass("btn-primary").addClass("btn-default");
//         $(this).removeClass("btn-default").addClass("btn-primary");
//         self.setSubmissionsFilterCriterion($(this).data("filter-criterion"))
//     });
  
//     $(".examma-ray-submissions-sort-button").on("click", function() {
//         $(".examma-ray-submissions-sort-button").removeClass("btn-primary").addClass("btn-default");
//         $(this).removeClass("btn-default").addClass("btn-primary");
//         self.setSubmissionsSortCriterion($(this).data("sort-criterion"))
//     });
  
//     $(".examma-ray-submissions-sort-ordering-button").on("click", function() {
//         $(".examma-ray-submissions-sort-ordering-button").removeClass("btn-primary").addClass("btn-default");
//         $(this).removeClass("btn-default").addClass("btn-primary");
//         self.setSubmissionsSortOrdering($(this).data("sort-ordering"));
//     });
  
//     $(".examma-ray-auto-group-button").on("click", async function() {
//         self.autoGroup();
//     });
  
//     $(".examma-ray-grading-finished-button").on("click", async function() {
//         self.toggleGradingFinished();
//     });
  
//   }

//   private setGradingRecords(records: ManualGradingQuestionRecords) {
//     this.closeGroup();

//     asMutable(this).grading_records = records;

//     this.updateGroupThumbnails();
//   }

//   public performLocalOperation(op: ManualGradingOperation) {
//     this.applyOperation(op);
//     this.local_changes.push(op);
//   }

//   private applyOperation(op: ManualGradingOperation, remote_grader_email?: string) {
//     if (!this.grading_records || !this.rubric) {
//       return;
//     }

//     if (op.kind === "set_rubric_item_status") {
//       this.grading_records.groups[op.group_uuid].grading_result[op.rubric_item_uuid] = op.status;
//       if (op.group_uuid === this.groupGrader.currentGroup?.group_uuid) {
//         this.groupGrader.onRubricItemStatusSet(op.rubric_item_uuid, op.status, remote_grader_email);
//       }
//     }
//     else if (op.kind === "set_group_finished") {
//       this.grading_records.groups[op.group_uuid].finished = op.finished;
//     }
//     else if (op.kind === "edit_rubric_item") {
//       let existingRi = this.rubric.find(ri => ri.rubric_item_uuid === op.rubric_item_uuid);
//       if (existingRi) {
//         Object.assign(existingRi, op.edits);
//         this.groupGrader.onRubricItemEdit(op.rubric_item_uuid, remote_grader_email);
//       }
//       else {
//         // tehcnically should never get here - rubric items can't be deleted, only hidden
//         return assertFalse();
//       }
//     }
//     else if (op.kind === "create_rubric_item") {
//       let existingRi = this.rubric.find(ri => ri.rubric_item_uuid === op.rubric_item.rubric_item_uuid);
//       if (existingRi) {
//         Object.assign(existingRi, op.rubric_item);
//         this.groupGrader.onRubricItemEdit(op.rubric_item.rubric_item_uuid, remote_grader_email);
//       }
//       else {
//         asMutable(this.rubric).push(op.rubric_item);
//         this.groupGrader.onRubricItemCreated(op.rubric_item);
//       }
      
//     }
//     else {
//       return assertNever(op);
//     }
//   }

//   private updateGroupThumbnails() {

//     $(".examma-ray-submissions-column").empty();
//     this.thumbnailElems = {};

//     if (!this.grading_records) { return; }
//     let groups = Object.values(this.grading_records.groups)
//       .filter(SUBMISSION_FILTERS[this.submissionsFilterCriterion])
//       .sort(this.SUBMISSION_SORTS[this.submissionsSortCriteria]);

//     if (this.submissionsSortOrdering === "dsc") {
//       groups = groups.reverse();
//     }

//     groups.forEach(group => $(".examma-ray-submissions-column").append(this.createGroupThumbnail(group)));
//   }

//   private refreshGroups() {
//     this.updateGroupThumbnails();
//     // if (this.currentGroup) {
//     //   $(".examma-ray-grading-group-name").html(this.currentGroup.group_uuid);
//     //   $(".examma-ray-grading-group-num-members").html(""+this.currentGroup.submissions.length);
//     // }
//   }

//   private createGroupThumbnail(group: ManualGradingGroupRecord) {
//     assert(this.question);
//     assert(group.submissions.length > 0);
//     let firstSub = group.submissions[0];
//     let response = firstSub.submission;
//     let originalSkin = createRecordedSkin(firstSub);
//     let skin = this.skin_override ?? originalSkin;
//     let jq = $(`
//       <div class="panel panel-default examma-ray-grading-group-thumbnail">
//         <div class="panel-heading">
//           <span class="badge">${group.submissions.length}</span> ${group.group_uuid} 
//           ${group.grading_result ? renderScoreBadge(this.pointsEarned(group.grading_result), this.question.pointsPossible, group.grading_result.verified ? VERIFIED_ICON : "") : renderUngradedBadge(this.question.pointsPossible)}
//         </div>
//         <div class="panel-body">
//           <pre><code>${highlightCode(response, CODE_LANGUAGE)}</code></pre>
//         </div>
//       </div>
//     `);
//     jq.on("click", () => {
//       this.openGroup(group)
//     });
//     this.thumbnailElems[group.group_uuid] = jq;
//     return jq;
//   }

//   public setSubmissionsFilterCriterion(criterion: SubmissionsFilterCriterion) {
//     this.submissionsFilterCriterion = criterion;
//     this.updateGroupThumbnails();
//   }

//   public setSubmissionsSortCriterion(criterion: SubmissionsSortCriterion) {
//     this.submissionsSortCriteria = criterion;
//     this.updateGroupThumbnails();
//   }

//   public setSubmissionsSortOrdering(ordering: SubmissionsSortOrdering) {
//     this.submissionsSortOrdering = ordering;
//     this.updateGroupThumbnails();
//   }

//   private async reloadGradingRecords() {
  
//     try {

//       const rubric_response = await axios({
//         url: `api/manual_grading/${this.exam_id}/questions/${this.question.question_id}/rubric`,
//         method: "GET",
//         data: {},
//         headers: {
//             'Authorization': 'bearer ' + this.client.getBearerToken()
//         }
//       });
//       const rubric = <ManualGradingRubricItem[]>rubric_response.data;
  
//       const records_response = await axios({
//         url: `api/manual_grading/${this.exam_id}/questions/${this.question.question_id}/records`,
//         method: "GET",
//         data: {},
//         headers: {
//             'Authorization': 'bearer ' + this.client.getBearerToken()
//         }
//       });
//       const records = <ManualGradingQuestionRecords>records_response.data;

//       this.setRubric(rubric);
//       this.setGradingRecords(records);

//       // Reapply our current set of local operations
//       this.local_changes.forEach(op => this.applyOperation(op));
//     }
//     catch(e: unknown) {
//       alert("Error loading grading records :(");
//     }
//   }

//   // private setRubric(rubric: readonly ManualGradingRubricItem[]) {
//   //   asMutable(this).rubric = rubric;
//   //   this.createRubricBar();
//   // }

//   public openGroup(group: ManualGradingGroupRecord) {
//     asMutable(this).currentGroup = group;
//     $(".examma-ray-grading-group-name").html(group.group_uuid);
//     $(".examma-ray-grading-group-num-members").html(""+group.submissions.length);

//     this.groupMemberThumbnailsElem.empty();
//     group.submissions.forEach(sub => {
//       this.groupMemberThumbnailsElem.append(this.createMemberThumbnail(sub));
//     });

//     let rep = group.submissions[0];

//     let code = this.applyHarness(rep);
//     this.lobster.project.setFileContents(new SourceFile("file.cpp", code));

//     $(".examma-ray-submissions-column").find(".panel-primary").removeClass("panel-primary");
//     this.thumbnailElems[group.group_uuid].addClass("panel-primary");

//     let gr = this.currentGroup?.grading_result;
//     this.rubric?.forEach((ri, i) => this.rubricItemOutlets[ri.rubric_item_uuid]?.updateStatus(gr && gr[ri.rubric_item_uuid]).clearHighlights());
//   }

//   private applyHarness(rep: ManualGradingSubmission) {
//     if (!this.config) {
//       return rep.submission;
//     }

//     let response = rep.submission;
//     let originalSkin = createRecordedSkin(rep);
//     let skin = this.skin_override ?? originalSkin;
//     let submittedCode = response;

//     // if (this.preprocess) {
//     //   submittedCode = this.preprocess(submittedCode);
//     // }

//     let code = this.config.test_harness.replace("{{submission}}", indentString(submittedCode, 4));
//     code = applySkin(code, skin);
//     return code;
//   }

//   private closeGroup() {
//     delete asMutable(this).currentGroup;
//     $(".examma-ray-grading-group-name").html("[No group selected]");
//     this.groupMemberThumbnailsElem.empty();
//     this.lobster.project.setFileContents(new SourceFile("file.cpp", "No submissions opened"));
//   }

//   private createMemberThumbnail(sub: ManualGradingSubmission) {
//     let response = sub.submission;
//     let originalSkin = createRecordedSkin(sub);
//     let skin = this.skin_override ?? originalSkin;
//     let jq = $(`
//       <div class="panel panel-default examma-ray-group-member-thumbnail">
//         <div class="panel-heading">
//           <button type="button" class="btn btn-sm btn-danger examma-ray-group-member-remove-button" aria-label="Remove"><span aria-hidden="true">Remove</span></button>
//           ${sub.uniqname}
//         </div>
//         <div class="panel-body">
//           <pre><code>${highlightCode(response, CODE_LANGUAGE)}</code></pre>
//         </div>
//       </div>
//     `);
//     let closeButton = jq.find(".examma-ray-group-member-remove-button");
//     closeButton.on("click", () => {
//       if (this.currentGroup && this.currentGroup.submissions.length > 1) {
//         this.removeFromCurrentGroup(sub);
//         jq.fadeOut(() => jq.remove());
//       }
//     })
//     return jq;
//   }

//   public async autoGroup() {
//     if (!this.config) {
//       return;
//     }

//     assert(this.question);

//     if (!this.grading_records) {
//       return;
//     }

//     $("#examma-ray-grouping-progress-modal").modal("show");

//     let equivalenceGroups : (ManualGradingGroupRecord & { repProgram?: Program })[] = [];

//     let allSubs = Object.values(this.grading_records.groups).flatMap(g => g.submissions.map(sub => ({
//       submission: sub,
//       grading_result: copyGradingResult(g.grading_result)
//     })));
//     for(let i = 0; i < allSubs.length; ++i) {
//       let sub = allSubs[i];
//       let percent = 100*i/allSubs.length;
//       if (Math.floor(percent/5) % 2 === 0) {
//         $(".examma-ray-grouping-progress .progress-bar").html("♪┏(・o･)┛♪┗( ･o･)┓♪")
//       }
//       else {
//         $(".examma-ray-grouping-progress .progress-bar").html("♪┗( ･o･)┓♪┏(・o･)┛♪")
//       }
//       $(".examma-ray-grouping-progress .progress-bar").css("width", percent + "%");
//       console.log(i);
//       await this.autoGroupHelper(equivalenceGroups, sub);
//     }

//     // Remove program property
//     equivalenceGroups.forEach(g => delete (<any>g).repProgram);

//     let newGroups : {[index: string]: (ManualGradingGroupRecord & { repProgram?: Program })}= {};
//     equivalenceGroups.forEach(g => newGroups[g.group_uuid] = g);

//     let newAssn : ManualGradingQuestionRecords = {
//       question_id: this.grading_records!.question_id,
//       groups: newGroups,
//       grading_epoch: this.grading_records!.grading_epoch
//     };

//     // TODO
//     // this.setGradingAssignment(this.question, this.rubric, newAssn);

//     $("#examma-ray-grouping-progress-modal").modal("hide");
//   }

//   private getGroupingFunctionName(sub: ManualGradingSubmission) {
//     assert(this.config);
//     let skin = this.skin_override ?? createRecordedSkin(sub);
//     return applySkin(this.config?.grouping_function, skin);
//   }

//   private autoGroupHelper(
//     equivalenceGroups: (ManualGradingGroupRecord & { repProgram?: Program })[],
//     sub_gr: {
//       submission: ManualGradingSubmission,
//       grading_result: ManualGradingResult
//     }) {

//     let sub = sub_gr.submission;
//     let gr = sub_gr.grading_result;

//     return new Promise<void>((resolve, reject) => {

//       window.setTimeout(() => {
//         let code = this.applyHarness(sub);

//         try {
    
//           let p = new SimpleProgram(code);
    
//           let fn = getFunc(p, this.getGroupingFunctionName(sub));
//           if (!fn) {
//             // Didn't parse or can't find function, make a new group
//             equivalenceGroups.push({
//               group_uuid: uuidv4(),
//               repProgram: p,
//               submissions: [sub],
//               grading_result: copyGradingResult(gr)
//             });
//             resolve();
//             return;
//           }
    
//           let matchingGroup = equivalenceGroups.find(group => {

//             if (!areEquivalentGradingResults(group.grading_result, gr)) {
//               return false;
//             }

//             // Only group blank submissions with other blank submissions
//             if ( (group.submissions[0].submission === "" )
//               !== (sub.submission === "")) {
//               return false;
//             }
            
//             let rep = group.repProgram;
//             if (!rep) { return false; }
//             let repFunc = getFunc(rep, this.getGroupingFunctionName(group.submissions[0]));
//             return repFunc && getFunc(p, this.getGroupingFunctionName(sub))!.isSemanticallyEquivalent(repFunc, {});
//           });
    
//           if (matchingGroup) {
//             matchingGroup.submissions.push(sub);
//           }
//           else {
//             equivalenceGroups.push({
//               group_uuid: uuidv4(),
//               repProgram: p,
//               submissions: [sub],
//               grading_result: copyGradingResult(gr)
//             });
//           }
//         }
//         catch(e) {
//           // Lobster might randomly crash on an obscure case. Just add to
//           // a new group with no representative program.
//           equivalenceGroups.push({
//             group_uuid: uuidv4(),
//             submissions: [sub],
//             grading_result: copyGradingResult(gr)
//           })
//         }
        
//         resolve();
//       }, 0);
//    });
//   }

//   private removeFromCurrentGroup(subToRemove: ManualGradingSubmission) {
//     if (!this.grading_records || !this.currentGroup || this.currentGroup.submissions.length <= 1) {
//       return;
//     }

//     let i = this.currentGroup.submissions.findIndex(sub => sub.submission_uuid === subToRemove.submission_uuid);
//     i !== -1 && this.currentGroup.submissions.splice(i, 1);

//     let new_uuid = uuidv4();
//     this.grading_records.groups[new_uuid] = {
//       group_uuid: new_uuid,
//       submissions: [subToRemove],
//       grading_result: copyGradingResult(this.currentGroup.grading_result)
//     };

//     this.refreshGroups();
//   }

//   // public setRubricItemStatus(rubric_item_uuid: string, status: ManualGradingRubricItemStatus) {
//   //   assert(this.rubric);
//   //   if (!this.currentGroup?.grading_result) {
//   //     return;
//   //   }
//   //   let gr = this.currentGroup.grading_result;

//   //   if (status === "off") {
//   //     delete gr[rubric_item_uuid];
//   //   }
//   //   else {
//   //     gr[rubric_item_uuid] = status;
//   //   }

//   // }


//   // private updatedGradingResult() {
//   //   if (!this.currentGroup || !this.question) {
//   //     return;
//   //   }

//   //   let thumbElem = this.thumbnailElems[this.currentGroup.group_uuid];
//   //   thumbElem.find(".examma-ray-score-badge").replaceWith(
//   //     this.currentGroup.grading_result
//   //       ? renderScoreBadge(this.pointsEarned(this.currentGroup.grading_result), this.question.pointsPossible, this.currentGroup.grading_result.verified ? VERIFIED_ICON : "")
//   //       : renderUngradedBadge(this.question.pointsPossible)
//   //   );
    
//   //   this.onGroupChanged(this.currentGroup.grading_result);
//   // }

//   private pointsEarned(gr?: ManualGradingResult) {
//     assert(this.rubric);

//     if (!gr || !this.question) {
//       return 0;
//     }
//     return Math.max(0, Math.min(this.question.pointsPossible,
//       this.rubric.reduce((p, ri) => p + (gr[ri.rubric_item_uuid] === "on" ? ri.points : 0), 0)
//     ));
//   }

//   // public autograde() {
//   //   if (!this.currentGroup) {
//   //     return;
//   //   }

//   //   if (this.autograder) {
//   //     this.currentGroup.grading_result = this.autograder(this.lobster.project.exercise);
//   //   }

//   //   this.updatedGradingResult();
//   // }

// };




// function getFunc(program: Program, name: string | string[]) {
//   if (typeof name === "string") {
//     name = [name];
//   }
//   for(let i = 0; i < name.length; ++i) {
//     if (name[0].indexOf("::[[constructor]]") !== -1) {
//       let className = name[0].slice(0, name[0].indexOf("::[[constructor]]"));
//       let ctor = program.linkedClassDefinitions[className]?.constructors[0].definition;
//       if (ctor) {
//         return ctor;
//       }
//       continue;
//     }

//     let def = program.linkedFunctionDefinitions[name[i]]?.definitions[0];
//     if (def) {
//       return def;
//     }
//   }
//   return undefined;
// }

// function areEquivalentGradingResults(gr1: ManualGradingResult | undefined, gr2: ManualGradingResult | undefined) {
//   return deepEqual(gr1, gr2);
// }

// function copyGradingResult(gr: ManualGradingResult) {
//   return $.extend(true, {}, gr);
// }

// function createRecordedSkin(sub: ManualGradingSubmission) {
//   // use a v4 uuid as the skin ID to avoid caching issues
//   // return {skin_id: `[recorded-${uuidv4()}]`, replacements: sub.skin_replacements}; // TODO skins
//   return {skin_id: `[recorded-${uuidv4()}]`, replacements: {}};
// }

// const VERIFIED_ICON = `<i class="bi bi-check2-circle" style="vertical-align: text-top;"></i> `;

// class GroupGraderOutlet {

//   public readonly app: ManualCodeGraderApp;
//   public readonly rubric: readonly ManualGradingRubricItem[];

//   public readonly currentGroup?: ManualGradingGroupRecord;

//   private lobster: SimpleExerciseLobsterOutlet;

//   private rubricItemOutlets: {
//     [index: string]: RubricItemOutlet | undefined
//   } = { };

//   private rubricBarElem: JQuery;

//   public constructor(app: ManualCodeGraderApp, rubric: readonly ManualGradingRubricItem[]) {
//     this.app = app;
//     this.rubric = rubric;

//     this.rubricBarElem = $(".examma-ray-grading-rubric-buttons")
//       .addClass("list-group");

//     this.lobster = this.createLobster();
//     this.createRubricBar();
//   }

//   public toggleRubricItem(rubric_item_uuid: string) {
//     assert(this.rubric);

//     if(!this.currentGroup) {
//       return;
//     }

//     this.currentGroup.grading_result ??= { };

//     let currentStatus = this.currentGroup.grading_result[rubric_item_uuid] ?? "off";
//     if (currentStatus === "off") {
//       currentStatus = "on";
//     }
//     else if (currentStatus === "on") {
//       currentStatus = "unknown";
//     }
//     else if (currentStatus === "unknown") {
//       currentStatus = "off";
//     }
    
//     this.app.performLocalOperation({
//       kind: "set_rubric_item_status",
//       group_uuid: this.currentGroup.group_uuid,
//       rubric_item_uuid: rubric_item_uuid,
//       status: currentStatus
//     });
//   }

//   private updateGradingFinishedButton(gr: ManualGradingResult | undefined) {
//     let elem = $(".examma-ray-grading-finished-button");
//     elem.removeClass("btn-default").removeClass("btn-success");
//     if (gr?.verified) {
//       elem.html(`<i class="bi bi-check2-circle"></i> Finished`);
//       elem.addClass("btn-success");
//     }
//     else {
//       elem.html("Mark as Finished");
//       elem.addClass("btn-default");
//     }
//   }

//   public toggleGradingFinished() {
//     if(!this.currentGroup) {
//       return;
//     }

//     this.currentGroup.grading_result ??= { };

//     this.currentGroup.finished = !this.currentGroup.finished;

//     // this.updatedGradingResult();
//   }


//   private createRubricBar() {
//     this.rubric.forEach((ri, i) => this.createRubricItemOutlet(ri));
//   }

//   private createRubricItemOutlet(ri: ManualGradingRubricItem) {
//     let rubricItemElem = $(`<button type="button" class="list-group-item"></button>`).appendTo(this.rubricBarElem);
//     let sub = this.currentGroup?.submissions[0];
//     let skin = this.skin_override ?? (sub && createRecordedSkin(sub));
//     let outlet = new RubricItemOutlet(rubricItemElem, ri, undefined, skin);
//     this.rubricItemOutlets[ri.rubric_item_uuid] = outlet;
//     rubricItemElem.on("click", () => {
//       this.toggleRubricItem(ri.rubric_item_uuid);
//     });
//   }

//   private createLobster() {
//     let lobsterElem = $("#lobster-exercise");
  
//     lobsterElem.append(createRunestoneExerciseOutlet("1"));
  
//     let ex = new Exercise({
//       checkpoints: [],
//       completionCriteria: COMPLETION_ALL_CHECKPOINTS,
//       starterCode: "",
//       completionMessage: "Code passes all checkpoints."
//     });
  
//     let project = new Project("test", undefined, [{ name: "file.cpp", isTranslationUnit: true, code: "" }], ex).turnOnAutoCompile(500);
//     // new ProjectEditor($("#lobster-project-editor"), project);
//     return new SimpleExerciseLobsterOutlet(lobsterElem, project);
  
//   }

//   public onRubricItemStatusSet(rubric_item_uuid: string, status: ManualGradingRubricItemStatus, remote_grader_email?: string) {
//       this.rubricItemOutlets[rubric_item_uuid]?.updateStatus(status).highlight(remote_grader_email);
//   }

//   public onRubricItemEdit(rubric_item_uuid: string, remote_grader_email?: string) {
//     this.rubricItemOutlets[rubric_item_uuid]?.update().highlight(remote_grader_email);
//   }

//   public onRubricItemCreated(ri: ManualGradingRubricItem) {
//     this.createRubricItemOutlet(ri);
//   }
// }

// class RubricItemOutlet {

//   private rubricItem: ManualGradingRubricItem;
//   private status?: ManualGradingRubricItemStatus;
//   private skin?: ExamComponentSkin;

//   private readonly elem: JQuery;
//   private readonly contentElem: JQuery;

//   public constructor(elem: JQuery, ri: ManualGradingRubricItem, status?: ManualGradingRubricItemStatus, skin?: ExamComponentSkin) {
//     this.elem = elem;
//     this.rubricItem = ri;
//     this.status = status;
//     this.skin = skin;

//     this.contentElem = $("<div></div>").appendTo(elem);

//     $('<div class="examma-ray-rubric-item-avatar-bar" style="position: absolute; bottom: 0; right: 5px; text-align: right;"></div>').appendTo(elem);

//     let buttonBar = $('<div class="examma-ray-rubric-item-button-bar"></div>').appendTo(elem);
//     $(`<button class="btn btn-primary btn-xs">Edit</button>`)
//       .appendTo(buttonBar)
//       .on("click", async () => this.openEditModal());

//     this.refreshContent();
//   }

//   public update() {
//     // assert(rubric_item.rubric_item_uuid === this.rubricItem.rubric_item_uuid);
//     // this.rubricItem = rubric_item;
//     this.refreshContent();
//     return this;
//   }

//   public updateStatus(status: ManualGradingRubricItemStatus | undefined) {
//     this.status = status;
//     this.refreshContent();
//     return this;
//   }

//   public updateSkin(skin: ExamComponentSkin) {
//     this.skin = skin;
//     this.refreshContent();
//     return this;
//   }

//   public refreshContent() {
//     let skinnedTitle = applySkin(this.rubricItem.title, this.skin);
//     let skinnedDesc = applySkin(this.rubricItem.description, this.skin);
//     this.contentElem.html(`
//       ${renderShortPointsWorthBadge(this.rubricItem.points)}
//       <div class="examma-ray-rubric-item-title"><b>${mk2html(skinnedTitle)}</b></div>
//       ${mk2html(skinnedDesc)}
//     `);
    
//     this.elem.removeClass("list-group-item-success").removeClass("list-group-item-danger").removeClass("list-group-item-warning");
//     this.elem.find(".examma-ray-unknown-rubric-item-icon").remove();
//     if (this.status === "on") {
//       if (this.rubricItem.points >= 0) {
//         this.elem.addClass("list-group-item-success");
//       }
//       else {
//         this.elem.addClass("list-group-item-danger");
//       }
//     }
//     else if (this.status === "unknown") {
//       this.elem.addClass("list-group-item-warning");
//       this.elem.append($(`<span class="examma-ray-unknown-rubric-item-icon"><i class="bi bi-question-diamond-fill"></i><span>`));
//     }
//   }

//   private openEditModal() {
//     $("#edit-rubric-item-input-uuid").val(this.rubricItem.rubric_item_uuid);
//     $("#edit-rubric-item-input-title").val(this.rubricItem.title);
//     $("#edit-rubric-item-input-description").val(this.rubricItem.description);
//     $("#edit-rubric-item-input-points").val(this.rubricItem.points);
//     $("#edit-rubric-item-modal").data("edit-rubric-item-mode", "edit");
//     $("#edit-rubric-item-modal").modal("show");
//   }

//   public toggle() {

//   }

//   public highlight(grader_email: string | undefined) {
//     if (!grader_email) { return; }
//     let avatarElem = $(`<div style="display: inline-block" data-toggle="tooltip" data-placement="bottom" title="${grader_email}">
//       ${avatar(grader_email, { size: ACTIVE_GRADER_AVATAR_SIZE })}
//     </div>`);
//     this.elem.find(".examma-ray-rubric-item-avatar-bar").append(avatarElem);
//     setTimeout(() => avatarElem.fadeOut(3000, () => avatarElem.remove()), 5000);
//     return this;
//   }

//   public clearHighlights() {
//     this.elem.find(".examma-ray-rubric-item-avatar-bar").empty();
//   }
// }


// async function loadRubric(client: ExammaRayGraderClient, exam_id: string, question_id: string, ) {
//   const rubric_response = await axios({
//     url: `api/manual_grading/${exam_id}/questions/${question_id}/rubric`,
//     method: "GET",
//     data: {},
//     headers: {
//         'Authorization': 'bearer ' + client.getBearerToken()
//     }
//   });
//   return <ManualGradingRubricItem[]>rubric_response.data;
// }

// async function loadGradingRecords(client: ExammaRayGraderClient, exam_id: string, question_id: string, ) {
//   const records_response = await axios({
//     url: `api/manual_grading/${exam_id}/questions/${question_id}/records`,
//     method: "GET",
//     data: {},
//     headers: {
//         'Authorization': 'bearer ' + client.getBearerToken()
//     }
//   });
//   return <ManualGradingQuestionRecords>records_response.data;
// }