import { fill_response, parse_submission, validate_submission } from "examma-ray/dist/response/handlers";
import { Program } from "lobster-vis/dist/js/core/compilation/Program";
import { v4 as uuidv4 } from "uuid";
import { ManualGradingGroupRecord, ManualGradingSubmission } from "../manual_grading";
import { ManualGraderApp, ManualGradingSubmissionComponent } from "./ManualGrader";

import "examma-ray/dist/frontend/frontend-solution";
import { BLANK_SUBMISSION } from "examma-ray/dist/response/responses";
import { SubmittedExamRenderer } from "examma-ray/dist/core/exam_renderer";
import { AssignedQuestion } from "examma-ray";

// Because this grader is based on Lobster, it only works for C++ code
// Perhaps in the future it will be generalized to other languages and
// have the option to just use a regular codemirror instance rather than
// lobster.
const CODE_LANGUAGE = "cpp";

export class QuestionSubmissionComponent implements ManualGradingSubmissionComponent {

  private readonly app: ManualGraderApp;
  private readonly renderer = new SubmittedExamRenderer();
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

    const sub = this.app.currentGroup.submissions[0];
    const sampleSolution = this.app.question.sampleSolution;
    const skin = this.app.skins[sub.skin_id];

    // this.responseElem.html(`<table>
    //   <tr><th>Student Submission</th><th>${sampleSolution ? "Sample Solution" : "Sample Solution (None Provided)"}</th></tr>
    //   <tr><td></td><td></td></tr>
    // </table>`);
    // const studentSubmissionElem = this.responseElem.find("td").first();
    // const sampleSolutionElem = this.responseElem.find("td").last();

    const parsed = parse_submission(this.app.question.response.kind, sub.submission);
    if (parsed.validity === "malformed") {
      this.responseElem.html("<span class='text-danger'>[[MALFORMED SUBMISSION]]</span>");
      return;
    }
    const validated = validate_submission(this.app.question.response, parsed);
    // if (validated.validity === "viable") {
    //   this.responseElem.html(this.app.question.renderResponseSolution(uuidv4(), validated, skin));
    // }
    // fill_response(
    //   studentSubmissionElem,
    //   this.app.question.response.kind,
    //   validated.validity === "viable" ? validated : BLANK_SUBMISSION()
    // );

    // if (sampleSolution) {
    //   sampleSolutionElem.html(this.app.question.renderResponseSolution("NONE", sampleSolution, skin));
    // }
    const uuid = uuidv4();
    this.responseElem.html(`
      <div id="question-${uuid}" data-question-uuid="${uuid}" data-question-display-index="1" class="examma-ray-question card-group">
        <div id="question-anchor-${uuid}" class="examma-ray-question-anchor"></div>
        <div class="card">
          <div class="card-header">
            ${this.app.question.title}
          </div>
          <div class="card-body">
            <div class="examma-ray-question-description">
              ${this.app.question.renderDescription(this.app.skins[sub.skin_id])}
            </div>
            ${this.app.question.renderResponseSolution(uuid, validated.validity === "viable" ? validated : BLANK_SUBMISSION(), skin)}
          </div>
        </div>
      </div>
    `);
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


