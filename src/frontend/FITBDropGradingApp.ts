import { OriginalExamRenderer } from "examma-ray";
import { fitbDropEvaluate, SPECIAL_MATCHER_DROPPABLES, MatchingDropEvaluatorSpecification, extractFromDropLocation } from "examma-ray/dist/graders/StandardFITBDropGrader";
import { activateFITBDropBank, getFirstLevelFITBDropElements, renderFITBDropBank } from "examma-ray/dist/response/fitb-drop";
import { activate_response } from "examma-ray/dist/response/handlers";
import { applyFITBDropGradingOperation, FITBDropGraderState, FITBDropGradingOperation } from "../collaborative_grading/FITBDropGradingCommon";
import { CollaborativeGradingAppBase, CollaborativeGradingAppBaseCtorArgs } from "./CollaborativeGradingAppBase";



export class FITBDropGradingApp extends CollaborativeGradingAppBase<"standard_fitb_drop"> {
    
  public constructor(
    base_args: CollaborativeGradingAppBaseCtorArgs<"standard_fitb_drop">
  ) {
    super(base_args);

    this.showSubmissions();

    this.showQuestion();

    $("#check-matcher-button").on("click", () => {
      const grader_response_elem = $("#grader-question-response");
      const matcher : MatchingDropEvaluatorSpecification = {
        kind: "matching_drop_evaluator",
        children: getFirstLevelFITBDropElements(grader_response_elem).map(elem => extractFromDropLocation($(elem))),
        evaluation: {
          explanation: "Matches prototype rubric item",
          pointsEarned: 1.0,
        }
      };
      console.log(matcher)

      this.assigned_questions.forEach(aq => {
        const sub = aq.submission;
        if (sub.validity === "blank") {
          return;
        }
        const evaluation = fitbDropEvaluate(matcher, sub.encoding);
        const submission_card = $(`#submission-card-${aq.uuid}`);
        if (evaluation) {
          submission_card.addClass("bg-primary");
        }
        else {
          submission_card.removeClass("bg-primary");
        }

      });

    });
  }

  public static async create(exam_id: string, grading_server_pk: number) {
    return new FITBDropGradingApp(
      await CollaborativeGradingAppBase.createBaseArgs<"standard_fitb_drop">(exam_id, grading_server_pk),
    );
  }

  private showQuestion() {
    const renderer = new OriginalExamRenderer();
    
    const aq = this.assigned_questions[0];

    const grader_panel_elem = $("#grader-panel");

    const question_response_html = renderer.renderQuestion(aq);
    const grader_response_elem = $("#grader-question-response");
    grader_response_elem.html(question_response_html);

    const drop_bank_html = renderFITBDropBank(
      [...aq.question.response.droppables, ...SPECIAL_MATCHER_DROPPABLES],
      this.question.response.group_id ?? this.question.question_id,
      aq.skin
    );
    const grader_drop_bank_container = $("#grader-fitb-drop-bank");
    grader_drop_bank_container.html(drop_bank_html);

    const grader_drop_bank_elem = grader_drop_bank_container.find(".examma-ray-fitb-drop-bank");
    const group_id = grader_drop_bank_elem.data("examma-ray-fitb-drop-group-id");
    activate_response("fitb_drop", false, grader_response_elem.find(".examma-ray-question-response"));
    activateFITBDropBank(grader_drop_bank_elem, group_id);

    // Note: due to "pre" formatting on the .examma-ray-fitb-drop-location elements, we make sure
    // there is no surrounding whitespace when we append the matching config elements below.
    
    // grader_panel_elem.find(".examma-ray-fitb-drop-location").append(`<div class='examma-ray-fitb-drop-location-matching-config'>
    //   <input type='checkbox' name='fitb-drop-location-ignore-nesting' />
    //   <label for='fitb-drop-location-ignore-nesting'><i class="bi bi-diagram-3"></i></label>
    //   <input type='checkbox' name='fitb-drop-location-ignore-ordering' />
    //   <label for='fitb-drop-location-ignore-ordering'><i class="bi bi-shuffle"></i></label>
    // </div>`);

    // grader_drop_bank_elem.find(".examma-ray-fitb-droppable").prepend(`<div class='examma-ray-fitb-drop-item-matching-config'>
    //   <input type='checkbox' name='fitb-drop-item-ignore-nesting' />
    //   <label for='fitb-drop-item-ignore-nesting'><i class="bi bi-diagram-3"></i></label>
    // </div>`)


  }

  private showSubmissions() {


    $("#submission-cards")
      .empty()
      .html(this.assigned_questions.map(aq => {
        return `
          <div class="col mb-4">
            <div id="submission-card-${aq.uuid}" class="card">
              <div class="card-header">
                ${aq.student.uniqname}
              </div>
              <div class="card-body">
                <div style="font-size: 7pt;">${aq.submission.validity === "blank" ? "Blank Submission" : aq.question.renderResponseSolution(aq.uuid, aq.submission, aq.skin)}</div>
              </div>
            </div>
          </div>
        `;
      }).join("\n"));
  }

  public currentState() : FITBDropGraderState {
    return { client_uuid: this.client.client_uuid };
  }
  
  public applyOperation(operation: FITBDropGradingOperation) : void {
    applyFITBDropGradingOperation(this.grading_records, operation);
  }

  public onOperationApplied(op: FITBDropGradingOperation, client_uuid: string) : void {
    throw new Error("Method not implemented.");
  }

}

