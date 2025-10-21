import avatar from "animal-avatar-generator";
import { ExamComponentSkin, OriginalExamRenderer } from "examma-ray";
import { applySkin, mk2html_unwrapped } from "examma-ray/dist/core/render";
import { renderNumBadge, renderPercentChosenProgressBar, renderPointsProgressBar, renderScoreBadge, renderShortPointsWorthBadge } from "examma-ray/dist/core/ui_components";
import { evaluateRubricItem, extractFromDropLocation, fillDropLocation, fitbDropEvaluate, MatchingDropEvaluatorSpecification, SPECIAL_MATCHER_DROPPABLES, StandardFITBDropGrader } from "examma-ray/dist/graders/StandardFITBDropGrader";
import { activateFITBDropBank, getFirstLevelFITBDropElements, renderFITBDropBank } from "examma-ray/dist/response/fitb-drop";
import { activate_response } from "examma-ray/dist/response/handlers";
import { v4 as uuidv4 } from "uuid";
import { applyFITBDropGradingOperation, CollaborativeGradingFITBDropRubricItem, CollaborativeGradingFITBDropEvaluator, FITBDropGraderState, FITBDropGradingOperation } from "../collaborative_grading/FITBDropGradingCommon";
import { asMutable, assert, assertExists, assertNever } from "../util/util";
import { CollaborativeGradingAppBase, CollaborativeGradingAppBaseCtorArgs } from "./CollaborativeGradingAppBase";
import deepEqual from "deep-equal";

const ACTIVE_GRADER_AVATAR_SIZE = 30;

// TODO: ensure some rubric item is always selected, or gracefully fail adding an evaluator if not
// TODO: ensure bad skin replacements in explanation, etc. do not cause issues
// TODO: don't read matchers into other evaluator when edit clicked.
// TODO: ensure some evaluator is always selected, or gracefully fail click on save button if not

interface SubmissionOutlet {
  elem: JQuery;
  applied_evaluator: number; // which match was actually applied according to current rubric policy
  matched_evaluators: number[]; // list of most recently computed matches
};

export class FITBDropGradingApp extends CollaborativeGradingAppBase<"standard_fitb_drop"> {
  
  public currentSkin: ExamComponentSkin;

  public rubricOutlet: FITBDropRubricOutlet;
  public evaluatorsOutlet: FITBDropEvaluatorsOutlet;

  public submission_outlets : SubmissionOutlet[] = [];

  public constructor(
    base_args: CollaborativeGradingAppBaseCtorArgs<"standard_fitb_drop">
  ) {
    super(base_args);
    this.currentSkin = assertExists(this.skins.values().next().value);

    this.initSubmissions();

    this.showQuestion();

    this.rubricOutlet = new FITBDropRubricOutlet(this);
    this.evaluatorsOutlet = new FITBDropEvaluatorsOutlet(this);


    this.initFITBDropAppComponents();
  }
  
  private initFITBDropAppComponents() {

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
      this.currentSkin
    );
    const grader_drop_bank_container = $("#grader-fitb-drop-bank");
    grader_drop_bank_container.html(drop_bank_html);

    const grader_drop_bank_elem = grader_drop_bank_container.find(".examma-ray-fitb-drop-bank");
    const group_id = grader_drop_bank_elem.data("examma-ray-fitb-drop-group-id");
    activate_response("fitb_drop", false, grader_response_elem.find(".examma-ray-question-response"));
    activateFITBDropBank(grader_drop_bank_elem, group_id);


  }

  private initSubmissions() {

    $("#submission-cards")
      .empty();

    for (const aq of this.assigned_questions) {
      this.submission_outlets.push({
        elem: $(`
          <div id="submission-outlet-${aq.uuid}" class="col mb-4">
            <div id="submission-card-${aq.uuid}" class="card">
              <div class="card-header">
                ${aq.student.uniqname} <div class="matched-evaluators" style="float: right;"></div>
              </div>
              <div class="card-body">
                <div style="font-size: 7pt;">${aq.submission.validity === "blank" ? "Blank Submission" : aq.question.renderResponseSolution(aq.uuid, aq.submission, this.currentSkin)}</div>
              </div>
            </div>
          </div>
        `).appendTo("#submission-cards"),
        applied_evaluator: -1,
        matched_evaluators: [],
      });
    }
  }

  public currentState() : FITBDropGraderState {
    return { client_uuid: this.client.client_uuid };
  }
  
  public applyOperation(operation: FITBDropGradingOperation) : void {
    applyFITBDropGradingOperation(this.grading_records, operation);
  }

  public onOperationApplied(op: FITBDropGradingOperation, client_uuid: string) : void {
    if (op.kind === "edit_rubric_item") {
      this.rubricOutlet.onRubricItemEdit(op.rubric_item, client_uuid);
      this.evaluatorsOutlet.onRubricItemEdit(op.rubric_item, client_uuid);
    }
    else if (op.kind === "edit_rubric_item_evaluator") {
      this.rubricOutlet.onEvaluatorEdit(op.evaluator, client_uuid);
      this.evaluatorsOutlet.onEvaluatorEdit(op.evaluator, client_uuid);
    }
    else {
      assertNever(op);
    }

    const grader = new StandardFITBDropGrader({
      grader_kind: "standard_fitb_drop",
      rubric: this.grading_records.rubric_items.map(ri => ({
        ...ri,
        evaluators: this.grading_records.evaluators.filter(ev => ev.rubric_item_uuid === ri.rubric_item_uuid).map(ev => ev.spec),
      })),
    });

  }

}







interface RubricItemOutlet {
  item_data: CollaborativeGradingFITBDropRubricItem;
  elem: JQuery;
  content_elem: JQuery;
  scores: number[];
}

class FITBDropRubricOutlet {

  public readonly app: FITBDropGradingApp;

  
  private rubricPanelElem: JQuery;
  private evaluatorPanelElem: JQuery;
  
  private rubricItemOutlets = new Map<string, RubricItemOutlet>(); // key is rubric_item_uuid
  private current_rubric_item?: RubricItemOutlet;

  public constructor(app: FITBDropGradingApp) {
    this.app = app;

    this.rubricPanelElem = $("#rubric-items")
      .addClass("list-group list-group-horizontal");

    this.evaluatorPanelElem = $("#evaluator-items")
      .addClass("list-group");

      
    this.app.grading_records.rubric_items
      .sort((ri_a, ri_b) => (ri_a.sort_index ?? "").localeCompare(ri_b.sort_index ?? ""))
      .forEach((ri, i) => this.createRubricItemOutlet(ri));

    this.initComponents();
  }

  private initComponents() {

    
    $("#create-rubric-item-open-modal").on("click", async () => {
      $("#edit-rubric-item-submit-button").html("Create");
      $("#edit-rubric-item-input-uuid").val(uuidv4());
      $("#edit-rubric-item-input-title").val("");
      $("#edit-rubric-item-input-description").val("");
      $("#edit-rubric-item-input-sort-index").val("");
      $("#edit-rubric-item-input-points").val("");
      $("#edit-rubric-item-input-policy").val("");
      $("#edit-rubric-item-modal .modal-title").html("Add Rubric Item");
      $("#edit-rubric-item-modal").modal("show");
    });

    $("#edit-rubric-item-submit-button").on("click", async (evt) => {

      if (!($("#edit-rubric-item-form")[0] as HTMLFormElement).checkValidity()) {
        evt.preventDefault();
        evt.stopPropagation();
        $("#edit-rubric-item-form").addClass("was-validated");
        return;
      }

      const rubric_item_uuid = ""+$("#edit-rubric-item-input-uuid").val();
      this.app.cg_client.performLocalOperation({
        kind: "edit_rubric_item",
        rubric_item: {
          rubric_item_uuid: rubric_item_uuid,
          grading_server_pk: this.app.cg_client.grading_server_pk,
          title: ""+$("#edit-rubric-item-input-title").val(),
          description: ""+$("#edit-rubric-item-input-description").val(),
          sort_index: ""+$("#edit-rubric-item-input-sort-index").val(),
          points: parseFloat(""+$("#edit-rubric-item-input-points").val()),
          policy: "" + $("#edit-rubric-item-input-policy").val() as "first_match" | "best_score",
          active: true
        }
      });

      this.setCurrentRubricItem(assertExists(this.rubricItemOutlets.get(rubric_item_uuid)));

      $("#edit-rubric-item-modal").modal("hide");
    });

  }

  public onRubricItemEdit(ri: CollaborativeGradingFITBDropRubricItem, client_uuid: string) {
    if (!this.rubricItemOutlets.has(ri.rubric_item_uuid)) {
      this.createRubricItemOutlet(ri);
    }
    else {
      const ri_outlet = assertExists(this.rubricItemOutlets.get(ri.rubric_item_uuid));
      Object.assign(ri_outlet.item_data, ri);
      ri_outlet.scores = this.gradeRubricItem(ri);
      this.updateRubricItem(ri_outlet, client_uuid);
    }
    this.resortRubricBar();
  }

  public onEvaluatorEdit(evaluator: CollaborativeGradingFITBDropEvaluator, client_uuid: string) {
    const ri_outlet = assertExists(this.rubricItemOutlets.get(evaluator.rubric_item_uuid));
    ri_outlet.scores = this.gradeRubricItem(ri_outlet.item_data);
    this.updateRubricItem(ri_outlet, client_uuid);
  }

  private resortRubricBar() {
    // detach all rubric item elements (don't use .empty() on the parent, we want to keep the event handlers)
    this.rubricItemOutlets.values().forEach(ri_outlet => ri_outlet!.elem.detach());

    // Add back sorted elements
    this.rubricItemOutlets.values().toArray()
      .sort((ri_out_a, ri_out_b) => (ri_out_a.item_data.sort_index ?? "").localeCompare(ri_out_b.item_data.sort_index ?? ""))
      .forEach((ri_out, i) => {
        ri_out!.elem.appendTo(this.rubricPanelElem)
      });
  }

  private createRubricItemOutlet(ri: CollaborativeGradingFITBDropRubricItem) {

    const ri_elem = $(`<div class="list-group-item examma-ray-fitb-drop-rubric-item-button">
      <div class="examma-ray-rubric-item-button-content"></div>
      <div class="examma-ray-rubric-item-avatar-bar" style="position: absolute; bottom: 0; left: 5px; text-align: left;"></div>
      <div class="examma-ray-rubric-item-button-bar">
        <span class="examma-ray-rubric-item-average"></span>
        <button class="edit-rubric-item-button btn btn-primary btn-sm">Edit</button>
      </div>
    </div>`)
    .appendTo(this.rubricPanelElem);

    const ri_outlet: RubricItemOutlet = {
      item_data: ri,
      elem: ri_elem,
      content_elem: ri_elem.find(".examma-ray-rubric-item-button-content"),
      scores: this.gradeRubricItem(ri),
    }
    this.rubricItemOutlets.set(ri.rubric_item_uuid, ri_outlet);

    this.updateRubricItem(ri_outlet, this.app.client.client_uuid);

    ri_elem.on("click", () => {
      this.setCurrentRubricItem(ri_outlet);
    });

    ri_elem.find(".edit-rubric-item-button").on("click", async (e) => {
      e.stopPropagation();
      this.openEditRubricItemModal(ri_outlet);
    })
  }

  private updateRubricItem(ri_outlet: RubricItemOutlet, client_uuid: string) {
    let skinnedTitle = mk2html_unwrapped(ri_outlet.item_data.title, this.app.currentSkin);
    ri_outlet.content_elem.html(`
      ${renderShortPointsWorthBadge(ri_outlet.item_data.points)}
      <div class="examma-ray-rubric-item-title"><b>${mk2html_unwrapped(skinnedTitle)}</b></div>
    `);
    ri_outlet.elem.find(".examma-ray-rubric-item-average").html(renderPointsProgressBar(
      ri_outlet.scores.reduce((a, b) => a + b, 0) / ri_outlet.scores.length,
      ri_outlet.item_data.points
    ));
    this.highlightRubricItem(ri_outlet, client_uuid);
  }

  private gradeRubricItem(rubric_item: CollaborativeGradingFITBDropRubricItem) {
    return this.app.assigned_questions.map(aq => 
      aq.submission.validity === "blank" ? 0 : evaluateRubricItem({
        ...rubric_item,
        evaluators: this.app.grading_records.evaluators
          .filter(ev => ev.rubric_item_uuid === rubric_item.rubric_item_uuid)
          .sort((a, b) => a.sort_index.localeCompare(b.sort_index))
          .map(ev => ev.spec),
      }, aq.submission.encoding).pointsEarned
    );
  }

  private highlightRubricItem(ri_outlet: RubricItemOutlet, client_uuid: string) {

    const client_email = this.app.cg_client.active_graders_by_client_uuid.get(client_uuid)?.email;
    if (!client_email) { return; }

    let avatarElem = $(`<div style="display: inline-block" data-toggle="tooltip" data-placement="bottom" title="${client_email}">
      ${avatar(client_email, { size: ACTIVE_GRADER_AVATAR_SIZE })}
    </div>`);
    ri_outlet.elem.find(".examma-ray-rubric-item-avatar-bar").append(avatarElem);
    setTimeout(() => avatarElem.fadeOut(3000, () => avatarElem.remove()), 5000);
  }

  public setCurrentRubricItem(ri_outlet: RubricItemOutlet) {
    this.current_rubric_item = ri_outlet;

    // Highlight selected rubric item
    $(".examma-ray-fitb-drop-rubric-item-button").removeClass("list-group-item-primary");
    ri_outlet.elem.addClass("list-group-item-primary");

    // Show evaluators for selected rubric item
    this.app.evaluatorsOutlet.setCurrentRubricItem(ri_outlet);
  }

  private openEditRubricItemModal(ri_outlet: RubricItemOutlet) {
    $("#edit-rubric-item-submit-button").html("Edit");
    $("#edit-rubric-item-input-uuid").val(ri_outlet.item_data.rubric_item_uuid);
    $("#edit-rubric-item-input-title").val(ri_outlet.item_data.title);
    $("#edit-rubric-item-input-description").val(ri_outlet.item_data.description);
    $("#edit-rubric-item-input-sort-index").val(ri_outlet.item_data.sort_index ?? "");
    $("#edit-rubric-item-input-points").val(ri_outlet.item_data.points);
    $("#edit-rubric-item-input-policy").val(ri_outlet.item_data.policy);
    $("#edit-rubric-item-modal .modal-title").html("Edit Rubric Item");
    $("#edit-rubric-item-modal").modal("show");
  }



  

}






































interface EvaluatorOutlet {
  evaluator_data: CollaborativeGradingFITBDropEvaluator;
  elem: JQuery;
  content_elem: JQuery;
  display_index: number;
  submissions_matched: number[];
  applied_to: number[];
};


class FITBDropEvaluatorsOutlet {

  public readonly app: FITBDropGradingApp;

  private panel_elem: JQuery;
  
  private evaluatorOutlets = new Map<string, EvaluatorOutlet>(); // key is evaluator_uuid

  private current_rubric_item?: RubricItemOutlet;
  private current_evaluator?: EvaluatorOutlet;

  private evaluator_edit_mode: "create" | "edit" = "create";

  public constructor(app: FITBDropGradingApp) {
    this.app = app;

    this.panel_elem = $("#evaluator-items")
      .addClass("list-group");

    this.app.grading_records.evaluators
      .forEach(ev => this.createEvaluatorOutlet(ev));

    this.initComponents();
  }

  private initComponents() {

    $("#create-evaluator-open-modal").on("click", async () => {
      this.evaluator_edit_mode = "create";
      $("#edit-evaluator-submit-button").html("Create");
      $("#edit-evaluator-input-uuid").val(uuidv4());
      $("#edit-evaluator-input-name").val("");
      $("#edit-evaluator-input-explanation").val("");
      $("#edit-evaluator-input-sort-index").val("");
      $("#edit-evaluator-input-points").val("");
      $("#edit-evaluator-modal .modal-title").html("Add Evaluator");
      $("#edit-evaluator-modal").modal("show");
    });
    
    $("#edit-evaluator-submit-button").on("click", async (evt) => {

      if (!($("#edit-evaluator-form")[0] as HTMLFormElement).checkValidity()) {
        evt.preventDefault();
        evt.stopPropagation();
        $("#edit-evaluator-form").addClass("was-validated");
        return;
      }

      const rubric_item_uuid = assertExists(this.current_rubric_item).item_data.rubric_item_uuid;
      const evaluator_uuid = ""+$("#edit-evaluator-input-uuid").val();
      const children = this.evaluator_edit_mode === "create"
        ? getFirstLevelFITBDropElements($("#grader-question-response")).map(_ => ({dropped_items: []}))
        : getFirstLevelFITBDropElements($("#grader-question-response")).map(elem => extractFromDropLocation($(elem)));
      alert(this.evaluator_edit_mode + " " + JSON.stringify(children));
      this.app.cg_client.performLocalOperation({
        kind: "edit_rubric_item_evaluator",
        evaluator: {
          evaluator_uuid: evaluator_uuid,
          rubric_item_uuid: rubric_item_uuid,
          name: ""+$("#edit-evaluator-input-name").val(),
          // title: ""+$("#edit-evaluator-input-title").val(),
          spec: {
            kind: "matching_drop_evaluator",
            children: children,
            evaluation: {
              explanation: ""+$("#edit-evaluator-input-explanation").val(),
              pointsEarned: parseFloat(""+$("#edit-evaluator-input-points").val()),
            }
          },
          sort_index: ""+$("#edit-evaluator-input-sort-index").val(),
        }
      });
      $("#edit-evaluator-modal").modal("hide");
      
      this.setCurrentEvaluator(assertExists(this.evaluatorOutlets.get(evaluator_uuid)));
    });



    $("#save-matcher-button").on("click", () => {
      this.syncEvaluatorSpecChanges();
    });
  }

  public onRubricItemEdit(ri: CollaborativeGradingFITBDropRubricItem, client_uuid: string) {
    if (this.current_rubric_item?.item_data.rubric_item_uuid === ri.rubric_item_uuid) {
      this.refreshEvaluators();
    }
  }

  public onEvaluatorEdit(evaluator: CollaborativeGradingFITBDropEvaluator, client_uuid: string) {
    
    if (!this.evaluatorOutlets.has(evaluator.evaluator_uuid)) {
      this.createEvaluatorOutlet(evaluator);
    }
    else {
      const ev_outlet = assertExists(this.evaluatorOutlets.get(evaluator.evaluator_uuid));
      Object.assign(ev_outlet.evaluator_data, evaluator);
      ev_outlet.submissions_matched = this.gradeEvaluatorItem(ev_outlet.evaluator_data);
      if (this.current_rubric_item?.item_data.rubric_item_uuid === ev_outlet.evaluator_data.rubric_item_uuid) {
        this.refreshEvaluators();
        this.highlight(ev_outlet, client_uuid);
      }
    }
  }

  private createEvaluatorOutlet(evaluator: CollaborativeGradingFITBDropEvaluator) {
    
    const evaluator_elem = $(`<div class="list-group-item examma-ray-fitb-drop-evaluator-button">
      <div class="examma-ray-evaluator-button-content"></div>
      <div class="examma-ray-evaluator-avatar-bar" style="position: absolute; bottom: 0; left: 5px; text-align: left;"></div>
      <div>
        <span class="examma-ray-evaluator-percent-matched"></span>
        <span class="examma-ray-evaluator-percent-applied-to"></span>
      </div>
      <div class="examma-ray-evaluator-button-bar">
        <button class="edit-evaluator-button btn btn-primary btn-sm">Edit</button>
      </div>
    </div>`);

    const ev_outlet: EvaluatorOutlet = {
      evaluator_data: evaluator,
      elem: evaluator_elem,
      content_elem: evaluator_elem.find(".examma-ray-evaluator-button-content"),
      display_index: this.evaluatorOutlets.size + 1,
      submissions_matched: this.gradeEvaluatorItem(evaluator),
      applied_to: [],
    }
    this.evaluatorOutlets.set(evaluator.evaluator_uuid, ev_outlet);

    this.refreshEvaluators();
    this.highlight(ev_outlet, this.app.client.client_uuid);

    evaluator_elem.on("click", () => {
      this.setCurrentEvaluator(ev_outlet);
    });

    evaluator_elem.find(".edit-evaluator-button").on("click", async (e) => {
      e.stopPropagation();
      this.openEditEvaluatorModal(ev_outlet);
    })

    return ev_outlet;
  }

  public setCurrentRubricItem(ri_outlet: RubricItemOutlet) {
    if(ri_outlet === this.current_rubric_item) {
      return;
    }
    this.current_rubric_item = ri_outlet;
    this.refreshEvaluators();
  
    this.setCurrentEvaluator(this.evaluatorOutlets.values().find(ev_outlet => ev_outlet.display_index === 0) );
  }

  private refreshEvaluators() {
    
    // detach all evaluator elements (don't use .empty() on the parent, we want to keep the event handlers)
    this.evaluatorOutlets.forEach(ev_outlet => ev_outlet!.elem.detach());
    
    if (!this.current_rubric_item) {
      return;
    }

    // Add back sorted elements
    const ordered_evaluators = this.evaluatorOutlets.values()
      .filter(ev_outlet => ev_outlet.evaluator_data.rubric_item_uuid === this.current_rubric_item!.item_data.rubric_item_uuid)
      .toArray()
      .sort((ev_out_a, ev_out_b) => (ev_out_a.evaluator_data.sort_index).localeCompare(ev_out_b.evaluator_data.sort_index));

    ordered_evaluators.forEach((ev_out, i) => {
      ev_out.display_index = i + 1;
    });

    this.computePreciseMatches(ordered_evaluators);

    // Set up evaluator match elements on each submission
    const submission_cards_elem = $("#submission-cards").detach();
    submission_cards_elem.find(".matched-evaluators").get().forEach((elem,i) => {
      const sub_out = this.app.submission_outlets[i];
      $(elem).html(sub_out.matched_evaluators.map(
        ev_display_index => ev_display_index === sub_out.applied_evaluator
          ? `<kbd class="applied-evaluator-marker">${ev_display_index}</kbd> `
          : `<kbd class="non-applied-evaluator-marker">${ev_display_index}</kbd> `
      ).join("\n"))
    });
    $("#submission-cards-container").append(submission_cards_elem);

    let prev_applied = 0;
    ordered_evaluators.forEach((ev_out, i) => {
      ev_out.elem.appendTo(this.panel_elem)
      prev_applied = this.refreshEvaluatorItem(ev_out, prev_applied);
    });
  }

  private computePreciseMatches(ordered_evaluators: EvaluatorOutlet[]) {
    assert(this.current_rubric_item, "No current rubric item set in FITBDropEvaluatorsOutlet.computePreciseMatches");
    
    this.app.submission_outlets.forEach(sub_out => {
      sub_out.applied_evaluator = -1;
      sub_out.matched_evaluators = [];
    });

    if (this.current_rubric_item.item_data.policy === "first_match") {
      // In reverse order of evaluator, mark matching submissions with evaluator display index.
      // This ensures that the first matching evaluator has the last say and is recorded.
      ordered_evaluators.slice().reverse().forEach((ev_out, i) => {
        ev_out.submissions_matched.forEach(sub_i => {
          this.app.submission_outlets[sub_i].applied_evaluator = ev_out.display_index;
          this.app.submission_outlets[sub_i].matched_evaluators.push(ev_out.display_index);
        });
      });
    }
    else {
      // sort a copy by scores ascending, break ties by original ordering.
      // Since sort() is stable, this only requires one pass on the original ordering.
      const asc_score_evaluators = ordered_evaluators.slice().sort((ev_out_a, ev_out_b) => {
        return (ev_out_a.evaluator_data.spec as MatchingDropEvaluatorSpecification).evaluation.pointsEarned
              - (ev_out_b.evaluator_data.spec as MatchingDropEvaluatorSpecification).evaluation.pointsEarned;
      });

      // In ascending order of evaluator score, mark matching submissions with evaluator display index.
      // This ensures that the best scoring evaluator has the last say and is recorded.
      asc_score_evaluators.forEach((ev_out, i) => {
        ev_out.submissions_matched.forEach(sub_i => {
          this.app.submission_outlets[sub_i].applied_evaluator = ev_out.display_index;
          this.app.submission_outlets[sub_i].matched_evaluators.push(ev_out.display_index);
        });
      });
    }

    ordered_evaluators.forEach(
      ev_out => ev_out.applied_to = this.app.submission_outlets.map(
        (sub_out, i) => sub_out.applied_evaluator === ev_out.display_index ? i : undefined
      ).filter(n => n !== undefined)
    )
  }

  // Only call from refreshEvaluators
  private refreshEvaluatorItem(ev_outlet: EvaluatorOutlet, previous_applied: number) {
    
    if (ev_outlet.evaluator_data.spec.kind !== "matching_drop_evaluator") {
      ev_outlet.content_elem.html(`<div>Unsupported evaluator type: ${ev_outlet.evaluator_data.spec.kind}</div>`);
      return previous_applied;
    }
    ev_outlet.content_elem.html(`
      <div class="examma-ray-evaluator-name"><b>${this.renderDisplayIndexLabel(ev_outlet.display_index)} ${mk2html_unwrapped(ev_outlet.evaluator_data.name, this.app.currentSkin)}</b></div>
      ${renderScoreBadge(ev_outlet.evaluator_data.spec.evaluation.pointsEarned, this.current_rubric_item?.item_data.points ?? 0)}
      <div class="examma-ray-evaluator-explanation">${mk2html_unwrapped(ev_outlet.evaluator_data.spec.evaluation.explanation, this.app.currentSkin)}</div>
    `);
    const applied_so_far = previous_applied + ev_outlet.applied_to.length;
    ev_outlet.elem.find(".examma-ray-evaluator-percent-matched").html(renderNumBadge(ev_outlet.submissions_matched.length));
    ev_outlet.elem.find(".examma-ray-evaluator-percent-applied-to").html(renderPercentChosenProgressBar(applied_so_far, this.app.assigned_questions.length));

    if (ev_outlet === this.current_evaluator) {
      this.setCurrentEvaluator(ev_outlet);
    }
    return applied_so_far;
  }

  private gradeEvaluatorItem(evaluator: CollaborativeGradingFITBDropEvaluator) {
    return this.app.assigned_questions.map((aq,i) => {
      return aq.submission.validity === "viable" && !!fitbDropEvaluate(evaluator.spec, aq.submission.encoding) ? i : -1;
    }).filter(i => i != -1);
  }

  private highlight(ev_outlet: EvaluatorOutlet, client_uuid: string) {
    const client_email = this.app.cg_client.active_graders_by_client_uuid.get(client_uuid)?.email;
    if (!client_email) { return; }
    let avatarElem = $(`<div style="display: inline-block" data-toggle="tooltip" data-placement="bottom" title="${client_email}">
      ${avatar(client_email, { size: ACTIVE_GRADER_AVATAR_SIZE })}
    </div>`);
    ev_outlet.elem.find(".examma-ray-evaluator-avatar-bar").append(avatarElem);
    setTimeout(() => avatarElem.fadeOut(3000, () => avatarElem.remove()), 5000);
    return this;
  }

  private setCurrentEvaluator(ev_outlet: EvaluatorOutlet | undefined) {
    this.current_evaluator = ev_outlet;

    $(".examma-ray-fitb-drop-evaluator-button").removeClass("list-group-item-primary");
    
    if (this.current_evaluator) {
      this.current_evaluator.elem.addClass("list-group-item-primary");
      const spec = this.current_evaluator.evaluator_data.spec;
      assert(spec.kind === "matching_drop_evaluator");

      getFirstLevelFITBDropElements($("#grader-question-response")).forEach((elem,i) => fillDropLocation($(elem), spec.children[i], $("#grader-fitb-drop-bank")));
    }
    else {
      // Clear drop locations
      getFirstLevelFITBDropElements($("#grader-question-response")).forEach(elem => fillDropLocation($(elem), {dropped_items: []}, $("#grader-fitb-drop-bank")));
    }

  }
  

  private openEditEvaluatorModal(ev_outlet: EvaluatorOutlet) {
    const spec = ev_outlet.evaluator_data.spec;
    if (spec.kind !== "matching_drop_evaluator") {
      return;
    }
    this.evaluator_edit_mode = "edit";
    $("#edit-evaluator-submit-button").html("Edit");
    $("#edit-evaluator-input-uuid").val(ev_outlet.evaluator_data.evaluator_uuid);
    $("#edit-evaluator-input-name").val(ev_outlet.evaluator_data.name);
    $("#edit-evaluator-input-explanation").val(spec.evaluation.explanation);
    $("#edit-evaluator-input-sort-index").val(ev_outlet.evaluator_data.sort_index ?? "");
    $("#edit-evaluator-input-points").val(spec.evaluation.pointsEarned);
    $("#edit-evaluator-modal .modal-title").html("Edit Evaluator");
    $("#edit-evaluator-modal").modal("show");
  }

  private syncEvaluatorSpecChanges() {
    if (!this.current_evaluator) { return; }
    const current_spec = this.current_evaluator.evaluator_data.spec;
    if (current_spec.kind !== "matching_drop_evaluator") {
      return;
    }

    const new_children = getFirstLevelFITBDropElements($("#grader-question-response")).map(elem => extractFromDropLocation($(elem)));
   
    if (deepEqual(new_children, current_spec.children)) {
      return;
    }
    alert(JSON.stringify(new_children));
    this.app.cg_client.performLocalOperation({
      kind: "edit_rubric_item_evaluator",
      evaluator: {
        ...this.current_evaluator.evaluator_data,
        spec: {
          ...current_spec,
          children: new_children,
        },
      }
    });
  }

  private renderDisplayIndexLabel(display_index: number) {
    return `<kbd>${display_index}</kbd>`;
  }
}
















