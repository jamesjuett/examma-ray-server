import { applySkin, highlightCode } from "examma-ray/dist/core/render";
import { fill_response, parse_submission } from "examma-ray/dist/response/responses";
import indentString from "indent-string";
import { EndOfMainStateCheckpoint } from "lobster-vis/dist/js/analysis/checkpoints";
import { Program, SimpleProgram, SourceFile } from "lobster-vis/dist/js/core/Program";
import { COMPLETION_ALL_CHECKPOINTS, Exercise, Project } from "lobster-vis/dist/js/core/Project";
import { Simulation } from "lobster-vis/dist/js/core/Simulation";
import { createRunestoneExerciseOutlet } from "lobster-vis/dist/js/view/embeddedExerciseOutlet";
import { SimpleExerciseLobsterOutlet } from "lobster-vis/dist/js/view/SimpleExerciseLobsterOutlet";
import { v4 as uuidv4 } from "uuid";
import { ManualGradingGroupRecord, ManualGradingSubmission } from "../manual_grading";
import { ManualGraderApp, ManualGradingSubmissionComponent } from "./ManualGrader";

import "examma-ray/dist/frontend/frontend.css"

// Because this grader is based on Lobster, it only works for C++ code
// Perhaps in the future it will be generalized to other languages and
// have the option to just use a regular codemirror instance rather than
// lobster.
const CODE_LANGUAGE = "cpp";

export class QuestionSubmissionComponent implements ManualGradingSubmissionComponent {

  private readonly app: ManualGraderApp;

  private readonly responseElem;
  
  public constructor(app: ManualGraderApp) {
    this.app = app;
    
    this.responseElem = $("#examma-ray-current-submission");
  }

  public onConfigUpdate() {
    this.updateDisplayedSubmission();
  }

  public updateDisplayedSubmission() {

    if (!this.app.currentGroup) {
      this.responseElem.html("No submissions opened");
      return;
    }

    if (this.app.currentGroup.submissions.length === 0) {
      this.responseElem.html("[[EMPTY GROUP]]");
      return;
    }

    let sub = this.app.currentGroup.submissions[0];

    this.responseElem.html(this.app.question.renderResponse(uuidv4(), this.app.skins[sub.skin_id]));
    fill_response(
      this.responseElem,
      this.app.question.response.kind,
      parse_submission(this.app.question.response.kind, sub.submission)
    );

    this.responseElem.append(this.app.question.renderDescription(this.app.skins[sub.skin_id]));
  }
  

  public renderSubmissionThumbnail(sub: ManualGradingSubmission) {

    return `Submission Encoding:<br /><pre><code>${sub.submission}</code></pre>`;

    // rendering the question element each time is too slow
    // let thumbElem = $(`<div></div>`);
    // thumbElem.html(this.app.question.renderResponse(uuidv4(), this.app.skins[sub.skin_id]));
    // fill_response(
    //   thumbElem,
    //   this.app.question.response.kind,
    //   parse_submission(this.app.question.response.kind, sub.submission)
    // );
    // return thumbElem.html();
  }


  
  
  
  public groupOneSubmission(equivalenceGroups: (ManualGradingGroupRecord & { repProgram?: Program })[], sub: ManualGradingSubmission) {

    return new Promise<void>((resolve, reject) => {

      window.setTimeout(() => {
  
        let matchingGroup = equivalenceGroups.find(group => group.submissions[0].submission === sub.submission);
  
        if (matchingGroup) {
          matchingGroup.submissions.push(sub);
        }
        else {
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

  public async autogradeGroup(group: ManualGradingGroupRecord) {
    return undefined;
  }

}



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