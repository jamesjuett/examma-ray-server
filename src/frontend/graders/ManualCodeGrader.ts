import indentString from "indent-string";
import { Program, SimpleProgram, SourceFile } from "lobster-vis/dist/js/core/Program"
import { SimpleExerciseLobsterOutlet } from "lobster-vis/dist/js/view/SimpleExerciseLobsterOutlet"
import { createRunestoneExerciseOutlet } from "lobster-vis/dist/js/view/embeddedExerciseOutlet"

import { applySkin, highlightCode, mk2html } from "examma-ray/dist/core/render";
import "highlight.js/styles/github.css";

import "./code-grader.css";
import { COMPLETION_ALL_CHECKPOINTS, Exercise, Project } from "lobster-vis/dist/js/core/Project";
import "lobster-vis/dist/css/buttons.css"
import "lobster-vis/dist/css/main.css"
import "lobster-vis/dist/css/code.css"
import "lobster-vis/dist/css/exercises.css"
import "lobster-vis/dist/css/frontend.css"
import { Checkpoint } from "lobster-vis/dist/js/analysis/checkpoints";
import "lobster-vis/dist/js/lib/standard";
import { renderScoreBadge, renderShortPointsWorthBadge, renderUngradedBadge } from "examma-ray/dist/core/ui_components";
import { QuestionSpecification, ExamComponentSkin, Question } from "examma-ray";
import deepEqual from "deep-equal";
import { v4 as uuidv4 } from "uuid";

import queryString from "query-string";
import { ManualGradingGroupRecord, ManualGradingQuestionRecord, ManualGradingResult, ManualGradingRubricItem, ManualGradingRubricItemStatus, ManualGradingSubmission } from "../../manual_grading";
import { asMutable, assert } from "../../util/util";
import axios from "axios";
import { ExammaRayApplication } from "../Application";

// Because this grader is based on Lobster, it only works for C++ code
// Perhaps in the future it will be generalized to other languages and
// have the option to just use a regular codemirror instance rather than
// lobster.
const CODE_LANGUAGE = "cpp";


// let response = await axios({
//   url: `api/manual_grading/records/cstring_remove_corrupted_function`,
//   method: "GET",
//   data: {},
//   headers: {
//       'Authorization': 'bearer ' + this.getBearerToken()
//   }
// });
// console.log(JSON.stringify(response.data));


type SubmissionsFilterCriterion = "all" | "graded" | "ungraded";
type SubmissionsSortCriterion = "name" | "size" | "score";
type SubmissionsSortOrdering = "asc" | "dsc";


function isFullyGraded(sub: ManualGradingGroupRecord) {
  return !!sub.grading_result?.verified;
}

const SUBMISSION_FILTERS : {
  [k in SubmissionsFilterCriterion]: (sub: ManualGradingGroupRecord) => boolean
} = {
  "all": (sub: ManualGradingGroupRecord) => true,
  "graded": (sub: ManualGradingGroupRecord) => isFullyGraded(sub),
  "ungraded": (sub: ManualGradingGroupRecord) => !isFullyGraded(sub),
}

export type CodeWritingManualGraderAppSpecification = {
  testHarness: string,
  extract_code?: (raw_submission: string, skin: ExamComponentSkin) => string,
  skin_override?: ExamComponentSkin,
  preprocess?: (submission: string) => string,
  checkpoints: Checkpoint[],
  // autograder: (ex: Exercise) => ManualGradingResult,
  groupingFunctionName: string
};

export const DEFAULT_EXTRACT_CODE = (raw_submission: string) => {
  assert(typeof raw_submission === "string");
  return raw_submission;
};

export class ManualCodeGraderApp extends ExammaRayApplication {

  public readonly question?: Question;
  public readonly rubric?: readonly ManualGradingRubricItem[];
  
  public readonly assn?: ManualGradingQuestionRecord;
  public readonly currentGroup?: ManualGradingGroupRecord;

  public lobster: SimpleExerciseLobsterOutlet;

  private extract_code: (raw_submission: string, skin: ExamComponentSkin) => string;
  private skin_override?: ExamComponentSkin;
  private preprocess?: (submission: string) => string;
  private testHarness: string;
  private groupingFunctionName: string;

  private groupMemberThumbnailsElem: JQuery;

  private thumbnailElems: {[index: string]: JQuery} = {};
  private rubricButtonElems: JQuery[] = [];
  
  private submissionsFilterCriterion : SubmissionsFilterCriterion = "all";
  private submissionsSortCriteria : SubmissionsSortCriterion = "name";
  private submissionsSortOrdering : SubmissionsSortOrdering = "asc";
  // private submissions

  

  private SUBMISSION_SORTS : {
    [k in SubmissionsSortCriterion]: (a: ManualGradingGroupRecord, b: ManualGradingGroupRecord) => number
  } = {
    "name": (a: ManualGradingGroupRecord, b: ManualGradingGroupRecord) => a.group_uuid.localeCompare(b.group_uuid, undefined, {numeric: true}),
    "size": (a: ManualGradingGroupRecord, b: ManualGradingGroupRecord) => a.submissions.length - b.submissions.length,
    "score": (a: ManualGradingGroupRecord, b: ManualGradingGroupRecord) => this.pointsEarned(a.grading_result) - this.pointsEarned(b.grading_result),
  }

  public constructor(spec: CodeWritingManualGraderAppSpecification) {
    super();
    this.testHarness = spec.testHarness;
    this.extract_code = spec.extract_code ?? DEFAULT_EXTRACT_CODE;
    this.skin_override = spec.skin_override;
    this.preprocess = spec.preprocess;
    this.groupingFunctionName = spec.groupingFunctionName;

    this.groupMemberThumbnailsElem = $(".examma-ray-group-member-thumbnails");

    this.lobster = this.createLobster(spec);

    this.updateControls();

    setInterval(() => this.saveGradingAssignment(), 10000);
  }

  private setUpEventHandlers() {


    // let fileInput = $("#load-grading-assignment-input");
    // let loadButton = $("#load-grading-assignment-button");
    // let autogradeButton = $("#examma-ray-grading-autograde-button");
  
    // loadButton.on("click", () => GRADING_APP.loadGradingAssignmentFile());
  
    // autogradeButton.on("click", () => GRADING_APP.autograde());
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
  
    $(".examma-ray-auto-group-button").on("click", async function() {
        self.autoGroup();
    });
  
    $(".examma-ray-grading-finished-button").on("click", async function() {
        self.toggleGradingFinished();
    });
  
  }

  private updateControls() {
    $(".examma-ray-grading-title").html(this.assn ? this.assn.question_id : "[No question selected]");
  }

  private createRubricBar(sub?: ManualGradingSubmission) {
    assert(this.rubric);
    let buttons = $(".examma-ray-grading-rubric-buttons");
    buttons.addClass("list-group");
    this.rubricButtonElems.length = 0;


    buttons.empty();
    
    let skin = this.skin_override ?? (sub && createRecordedSkin(sub));
    this.rubric.forEach((ri, i) => {
      let skinnedTitle = sub ? applySkin(ri.title, skin) : ri.title;
      let skinnedDesc = sub ? applySkin(ri.description, skin) : ri.description;
      let button = $(
        `<button type="button" class="list-group-item">
          ${renderShortPointsWorthBadge(ri.points)}
          <div class="examma-ray-rubric-item-title"><b>${mk2html(skinnedTitle)}</b></div>
          ${mk2html(skinnedDesc)}
        </button>`
      ).on("click", () => {
        this.toggleRubricItem(i);
      });
      
      buttons.append(button);
      this.rubricButtonElems.push(button);
    });
  }

  private createLobster(spec: CodeWritingManualGraderAppSpecification) {
    let lobsterElem = $("#lobster-exercise");
  
    lobsterElem.append(createRunestoneExerciseOutlet("1"));
  
    let ex = new Exercise({
      checkpoints: spec.checkpoints,
      completionCriteria: COMPLETION_ALL_CHECKPOINTS,
      starterCode: "",
      completionMessage: "Code passes all checkpoints."
    });
  
    let project = new Project("test", undefined, [{ name: "file.cpp", isTranslationUnit: true, code: "" }], ex).turnOnAutoCompile(500);
    // new ProjectEditor($("#lobster-project-editor"), project);
    return new SimpleExerciseLobsterOutlet(lobsterElem, project);
  
  }

  private closeGradingAssignment() {
    
    delete asMutable(this).assn;
    this.clearGroupThumbnails();
    this.closeGroup();

  }

  private setGradingAssignment(question: Question, rubric: readonly ManualGradingRubricItem[], assn: ManualGradingQuestionRecord) {
    this.closeGradingAssignment();

    asMutable(this).question = question;
    asMutable(this).rubric = rubric;
    asMutable(this).assn = assn;

    this.updateControls();
    this.createRubricBar();

    this.createGroupThumbnails();
  }

  private clearGroupThumbnails() {
    $(".examma-ray-submissions-column").empty();
    this.thumbnailElems = {};
  }

  private createGroupThumbnails() {
    if (!this.assn) { return; }
    let groups = this.assn.groups
      .filter(SUBMISSION_FILTERS[this.submissionsFilterCriterion])
      .sort(this.SUBMISSION_SORTS[this.submissionsSortCriteria]);

    if (this.submissionsSortOrdering === "dsc") {
      groups = groups.reverse();
    }

    groups.forEach(group => $(".examma-ray-submissions-column").append(this.createGroupThumbnail(group)));
  }

  private refreshGroups() {
    this.clearGroupThumbnails();
    this.createGroupThumbnails();
    if (this.currentGroup) {
      $(".examma-ray-grading-group-name").html(this.currentGroup.group_uuid);
      $(".examma-ray-grading-group-num-members").html(""+this.currentGroup.submissions.length);
    }
  }

  private createGroupThumbnail(group: ManualGradingGroupRecord) {
    assert(this.question);
    assert(group.submissions.length > 0);
    let firstSub = group.submissions[0];
    let response = firstSub.submission;
    let originalSkin = createRecordedSkin(firstSub);
    let skin = this.skin_override ?? originalSkin;
    let jq = $(`
      <div class="panel panel-default examma-ray-grading-group-thumbnail">
        <div class="panel-heading">
          <span class="badge">${group.submissions.length}</span> ${group.group_uuid} 
          ${group.grading_result ? renderScoreBadge(this.pointsEarned(group.grading_result), this.question.pointsPossible, group.grading_result.verified ? VERIFIED_ICON : "") : renderUngradedBadge(this.question.pointsPossible)}
        </div>
        <div class="panel-body">
          <pre><code>${highlightCode(this.extract_code(response, originalSkin), CODE_LANGUAGE)}</code></pre>
        </div>
      </div>
    `);
    jq.on("click", () => {
      this.openGroup(group)
    });
    this.thumbnailElems[group.group_uuid] = jq;
    return jq;
  }

  public setSubmissionsFilterCriterion(criterion: SubmissionsFilterCriterion) {
    this.submissionsFilterCriterion = criterion;
    this.clearGroupThumbnails();
    this.createGroupThumbnails();
  }

  public setSubmissionsSortCriterion(criterion: SubmissionsSortCriterion) {
    this.submissionsSortCriteria = criterion;
    this.clearGroupThumbnails();
    this.createGroupThumbnails();
  }

  public setSubmissionsSortOrdering(ordering: SubmissionsSortOrdering) {
    this.submissionsSortOrdering = ordering;
    this.clearGroupThumbnails();
    this.createGroupThumbnails();
  }

  public async loadGradingAssignment(question_id: string) {

    try {

      const rubric_response = await axios({
        url: `api/manual_grading/rubric/${question_id}`,
        method: "GET",
        data: {},
        headers: {
            'Authorization': 'bearer ' + this.getBearerToken()
        }
      });
      const rubric = <ManualGradingRubricItem[]>rubric_response.data;

      const question_response = await axios({
        url: `api/questions/${question_id}`,
        method: "GET",
        data: {},
        headers: {
            'Authorization': 'bearer ' + this.getBearerToken()
        }
      });
      const question = Question.create(<QuestionSpecification>question_response.data);
  
      let records_response = await axios({
        url: `api/manual_grading/records/${question_id}`,
        method: "GET",
        data: {},
        headers: {
            'Authorization': 'bearer ' + this.getBearerToken()
        }
      });
      const records = <ManualGradingQuestionRecord>records_response.data;

      this.setGradingAssignment(question, rubric, records);
    }
    catch(e: unknown) {
      alert("Error loading question :(");
    }
  }

  public async saveGradingAssignment() {
    if (!this.assn) {
      return;
    }

    // TODO

    // // Check if file is still there
    // try {
    //   await this.fileHandle.getFile();
    // }
    // catch (e) {
    //   delete this.fileHandle;
    //   alert("Oops! The grading assignment file appears to have disappeared! Please reload the page.");
    //   return;
    // }

    // const writable = await this.fileHandle.createWritable();
    // // Write the contents of the file to the stream.
    // await writable.write(JSON.stringify(this.assn, null, 2));
    // // Close the file and write the contents to disk.
    // await writable.close();
  }

  public openGroup(group: ManualGradingGroupRecord) {
    asMutable(this).currentGroup = group;
    $(".examma-ray-grading-group-name").html(group.group_uuid);
    $(".examma-ray-grading-group-num-members").html(""+group.submissions.length);

    this.groupMemberThumbnailsElem.empty();
    group.submissions.forEach(sub => {
      this.groupMemberThumbnailsElem.append(this.createMemberThumbnail(sub));
    })

    let rep = group.submissions[0];

    // Update rubric buttons
    this.createRubricBar(rep);

    let code = this.applyHarness(rep);
    this.lobster.project.setFileContents(new SourceFile("file.cpp", code));

    $(".examma-ray-submissions-column").find(".panel-primary").removeClass("panel-primary");
    this.thumbnailElems[group.group_uuid].addClass("panel-primary");

    this.updatedGradingResult();
  }

  private applyHarness(rep: ManualGradingSubmission) {
    let response = rep.submission;
    let originalSkin = createRecordedSkin(rep);
    let skin = this.skin_override ?? originalSkin;
    let submittedCode = this.extract_code(response, originalSkin);

    if (this.preprocess) {
      submittedCode = this.preprocess(submittedCode);
    }

    let code = this.testHarness.replace("{{submission}}", indentString(submittedCode, 4));
    code = applySkin(code, skin);
    return code;
  }

  private closeGroup() {
    delete asMutable(this).currentGroup;
    $(".examma-ray-grading-group-name").html("[No group selected]");
    this.groupMemberThumbnailsElem.empty();
    this.lobster.project.setFileContents(new SourceFile("file.cpp", "No submissions opened"));
  }

  private createMemberThumbnail(sub: ManualGradingSubmission) {
    let response = sub.submission;
    let originalSkin = createRecordedSkin(sub);
    let skin = this.skin_override ?? originalSkin;
    let jq = $(`
      <div class="panel panel-default examma-ray-group-member-thumbnail">
        <div class="panel-heading">
          <button type="button" class="btn btn-sm btn-danger examma-ray-group-member-remove-button" aria-label="Remove"><span aria-hidden="true">Remove</span></button>
          ${sub.uniqname}
        </div>
        <div class="panel-body">
          <pre><code>${highlightCode(this.extract_code(response, originalSkin), CODE_LANGUAGE)}</code></pre>
        </div>
      </div>
    `);
    let closeButton = jq.find(".examma-ray-group-member-remove-button");
    closeButton.on("click", () => {
      if (this.currentGroup && this.currentGroup.submissions.length > 1) {
        this.removeFromCurrentGroup(sub);
        jq.fadeOut(() => jq.remove());
      }
    })
    return jq;
  }

  public async autoGroup() {
    assert(this.question);
    assert(this.rubric);
    if (!this.assn) {
      return;
    }

    $("#examma-ray-grouping-progress-modal").modal("show");

    let equivalenceGroups : (ManualGradingGroupRecord & { repProgram?: Program })[] = [];

    let allSubs = this.assn!.groups.flatMap(g => g.submissions.map(sub => ({
      submission: sub,
      grading_result: copyGradingResult(g.grading_result)
    })));
    for(let i = 0; i < allSubs.length; ++i) {
      let sub = allSubs[i];
      let percent = 100*i/allSubs.length;
      if (Math.floor(percent/5) % 2 === 0) {
        $(".examma-ray-grouping-progress .progress-bar").html("♪┏(・o･)┛♪┗( ･o･)┓♪")
      }
      else {
        $(".examma-ray-grouping-progress .progress-bar").html("♪┗( ･o･)┓♪┏(・o･)┛♪")
      }
      $(".examma-ray-grouping-progress .progress-bar").css("width", percent + "%");
      console.log(i);
      await this.autoGroupHelper(equivalenceGroups, sub);
    }

    // Remove program property
    equivalenceGroups.forEach(g => delete (<any>g).repProgram);

    let newAssn : ManualGradingQuestionRecord = {
      question_id: this.assn!.question_id,
      groups: equivalenceGroups
    };

    this.setGradingAssignment(this.question, this.rubric, newAssn);

    $("#examma-ray-grouping-progress-modal").modal("hide");
  }

  private getGroupingFunctionName(sub: ManualGradingSubmission) {
    let skin = this.skin_override ?? createRecordedSkin(sub);
    return applySkin(this.groupingFunctionName, skin);
  }

  private autoGroupHelper(
    equivalenceGroups: (ManualGradingGroupRecord & { repProgram?: Program })[],
    sub_gr: {
      submission: ManualGradingSubmission,
      grading_result: ManualGradingResult
    }) {

    let sub = sub_gr.submission;
    let gr = sub_gr.grading_result;

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
              repProgram: p,
              submissions: [sub],
              grading_result: copyGradingResult(gr)
            });
            resolve();
            return;
          }
    
          let matchingGroup = equivalenceGroups.find(group => {

            if (!areEquivalentGradingResults(group.grading_result, gr)) {
              return false;
            }

            // Only group blank submissions with other blank submissions
            if ( (group.submissions[0].submission === "" )
              !== (sub.submission === "")) {
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
              repProgram: p,
              submissions: [sub],
              grading_result: copyGradingResult(gr)
            });
          }
        }
        catch(e) {
          // Lobster might randomly crash on an obscure case. Just add to
          // a new group with no representative program.
          equivalenceGroups.push({
            group_uuid: uuidv4(),
            submissions: [sub],
            grading_result: copyGradingResult(gr)
          })
        }
        
        resolve();
      }, 0);
   });
  }

  private removeFromCurrentGroup(subToRemove: ManualGradingSubmission) {
    if (!this.assn || !this.currentGroup || this.currentGroup.submissions.length <= 1) {
      return;
    }

    let i = this.currentGroup.submissions.findIndex(sub => sub.submission_uuid === subToRemove.submission_uuid);
    i !== -1 && this.currentGroup.submissions.splice(i, 1);

    this.assn.groups.push({
      group_uuid: uuidv4(),
      submissions: [subToRemove],
      grading_result: copyGradingResult(this.currentGroup.grading_result)
    });

    this.refreshGroups();
  }

  public setRubricItemStatus(i: number, status: ManualGradingRubricItemStatus) {
    assert(this.rubric);
    if (!this.currentGroup?.grading_result) {
      return;
    }
    let gr = this.currentGroup.grading_result;

    if (status === "off") {
      delete gr[this.rubric[i].rubric_item_id];
    }
    else {
      gr[this.rubric[i].rubric_item_id] = status;
    }

    this.updatedGradingResult();
  }

  public toggleRubricItem(i: number) {
    assert(this.rubric);

    if(!this.currentGroup) {
      return;
    }

    this.currentGroup.grading_result ??= { };

    let currentStatus = this.currentGroup.grading_result[this.rubric[i].rubric_item_id] ?? "off";
    if (currentStatus === "off") {
      currentStatus = "on";
    }
    else if (currentStatus === "on") {
      currentStatus = "unknown";
    }
    else if (currentStatus === "unknown") {
      currentStatus = "off";
    }
    this.setRubricItemStatus(i, currentStatus);
  }

  private updateRubricItemButtons(gr: ManualGradingResult | undefined) {
    assert(this.rubric);
    this.rubric.forEach((ri, i) => {
      this.updateRubricItemButton(i, (gr && gr[ri.rubric_item_id]) ?? "off");
    });

    this.updateGradingFinishedButton(gr);
  }

  private updateRubricItemButton(i: number, status: ManualGradingRubricItemStatus) {
    assert(this.rubric);
    let elem = this.rubricButtonElems[i];
    elem.removeClass("list-group-item-success").removeClass("list-group-item-danger").removeClass("list-group-item-warning");
    elem.find(".examma-ray-unknown-rubric-item-icon").remove();
    if (status === "on") {
      if (this.rubric[i].points >= 0) {
        elem.addClass("list-group-item-success");
      }
      else {
        elem.addClass("list-group-item-danger");
      }
    }
    else if (status === "unknown") {
      elem.addClass("list-group-item-warning");
      elem.append($(`<span class="examma-ray-unknown-rubric-item-icon"><i class="bi bi-question-diamond-fill"></i><span>`));
    }
  }

  private updateGradingFinishedButton(gr: ManualGradingResult | undefined) {
    let elem = $(".examma-ray-grading-finished-button");
    elem.removeClass("btn-default").removeClass("btn-success");
    if (gr?.verified) {
      elem.html(`<i class="bi bi-check2-circle"></i> Finished`);
      elem.addClass("btn-success");
    }
    else {
      elem.html("Mark as Finished");
      elem.addClass("btn-default");
    }
  }

  public toggleGradingFinished() {
    if(!this.currentGroup) {
      return;
    }

    this.currentGroup.grading_result ??= { };

    this.currentGroup.finished = !this.currentGroup.finished;

    this.updatedGradingResult();
  }

  private updatedGradingResult() {
    if (!this.currentGroup || !this.question) {
      return;
    }

    let thumbElem = this.thumbnailElems[this.currentGroup.group_uuid];
    thumbElem.find(".examma-ray-score-badge").replaceWith(
      this.currentGroup.grading_result
        ? renderScoreBadge(this.pointsEarned(this.currentGroup.grading_result), this.question.pointsPossible, this.currentGroup.grading_result.verified ? VERIFIED_ICON : "")
        : renderUngradedBadge(this.question.pointsPossible)
    );
    
    this.updateRubricItemButtons(this.currentGroup.grading_result);
  }

  private pointsEarned(gr?: ManualGradingResult) {
    assert(this.rubric);

    if (!gr || !this.question) {
      return 0;
    }
    return Math.max(0, Math.min(this.question.pointsPossible,
      this.rubric.reduce((p, ri) => p + (gr[ri.rubric_item_id] === "on" ? ri.points : 0), 0)
    ));
  }

  // public autograde() {
  //   if (!this.currentGroup) {
  //     return;
  //   }

  //   if (this.autograder) {
  //     this.currentGroup.grading_result = this.autograder(this.lobster.project.exercise);
  //   }

  //   this.updatedGradingResult();
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
  return $.extend(true, {}, gr);
}

function createRecordedSkin(sub: ManualGradingSubmission) {
  // use a v4 uuid as the skin ID to avoid caching issues
  // return {skin_id: `[recorded-${uuidv4()}]`, replacements: sub.skin_replacements}; // TODO skins
  return {skin_id: `[recorded-${uuidv4()}]`, replacements: {}};
}

const VERIFIED_ICON = `<i class="bi bi-check2-circle" style="vertical-align: text-top;"></i> `;