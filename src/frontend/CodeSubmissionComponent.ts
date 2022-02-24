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
import { ActiveExamGraders, ActiveQuestionGraders, GradingGroupReassignment, isMeaningfulManualGradingResult, isMeaningfulRubricItemGradingResult, ManualCodeGraderConfiguration, ManualGradingGroupRecord, ManualGradingPingRequest, ManualGradingPingResponse, ManualGradingQuestionRecords, ManualGradingResult, ManualGradingRubricItem, ManualGradingRubricItemStatus, ManualGradingSkins, ManualGradingSubmission, NextUngradedRequest, NextUngradedResponse, reassignGradingGroups, RubricItemGradingResult } from "../manual_grading";
import { asMutable, assert, assertFalse, assertNever } from "../util/util";
import axios from "axios";
import { ExammaRayGraderClient } from "./Application";
import avatar from "animal-avatar-generator";
import { EditRubricItemOperation, ManualGradingEpochTransition, ManualGradingOperation, SetRubricItemStatusOperation } from "../manual_grading";
import { Simulation } from "lobster-vis/dist/js/core/Simulation";

import hotkeys from "hotkeys-js";
import { ManualGradingSubmissionComponent, ManualGraderApp } from "./ManualGrader";



// Because this grader is based on Lobster, it only works for C++ code
// Perhaps in the future it will be generalized to other languages and
// have the option to just use a regular codemirror instance rather than
// lobster.
const CODE_LANGUAGE = "cpp";

export class CodeSubmissionComponent implements ManualGradingSubmissionComponent {

  private readonly app: ManualGraderApp;
  private readonly lobster: SimpleExerciseLobsterOutlet;
  
  public constructor(app: ManualGraderApp) {
    this.app = app;
    this.lobster = this.createLobster();
  }

  private createLobster() {
  
    let elem = $("#examma-ray-current-submission");

    elem.append(createRunestoneExerciseOutlet("1"));
  
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
    return new SimpleExerciseLobsterOutlet(elem, project);
  }

  public onConfigUpdate() {
    this.updateDisplayedSubmission();
  }

  public updateDisplayedSubmission() {
    if (!this.app.currentGroup) {    
      this.lobster.project.setFileContents(new SourceFile("file.cpp", "No submissions opened"));
      return;
    }

    if (this.app.currentGroup.submissions.length === 0) {
      this.lobster.project.setFileContents(new SourceFile("file.cpp", "[EMPTY GROUP]"));
      return;
    }

    let sub = this.app.currentGroup.submissions[0];
    let code = this.applyHarness(sub);
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

      this.lobster.projectEditor.codeMirror.scrollIntoView({from: {line: line, ch: 0}, to: {line: line + n - 1, ch: 0}});

      for(let i = line; i < line + n; ++i) {
        this.lobster.projectEditor.codeMirror.addLineClass(i, "background", "examma-ray-codemirror-submission");
      }
      this.lobster.projectEditor.codeMirror.addLineClass(line, "background", "examma-ray-codemirror-submission-first");
      this.lobster.projectEditor.codeMirror.addLineClass(line + n - 1, "background", "examma-ray-codemirror-submission-last");
    }
  }
  

  public renderSubmissionThumbnail(sub: ManualGradingSubmission) {
    return `<pre><code>${highlightCode(sub.submission, CODE_LANGUAGE)}</code></pre>`;
  }


  public applyHarness(sub: ManualGradingSubmission) {

    let code = this.app.config.test_harness.replace("{{submission}}", indentString(sub.submission, 4));

    code = code.replace(/vector\s*\<\s*Topping\s*\>/gi, "VectorOfTopping");
    code = code.replace(/vector\s*\<\s*Sundae\s*\>/gi, "VectorOfSundae");
    code = code.replace(/vector\s*\<\s*Ingredient\s*\>/gi, "VectorOfIngredient");
    code = code.replace(/vector\s*\<\s*Sandwich\s*\>/gi, "VectorOfSandwich");
    code = applySkin(code, this.app.skins[sub.skin_id]);
    return code;
  }
  
  
  
  public groupOneSubmission(equivalenceGroups: (ManualGradingGroupRecord & { repProgram?: Program })[], sub: ManualGradingSubmission) {

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

  private getGroupingFunctionName(sub: ManualGradingSubmission) {
    return applySkin(this.app.config.grouping_function, this.app.skins[sub.skin_id]);
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