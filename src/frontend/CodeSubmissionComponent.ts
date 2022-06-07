import indentString from "indent-string";
import { Program, SimpleProgram, SourceFile } from "lobster-vis/dist/js/core/Program"
import { SimpleExerciseLobsterOutlet } from "lobster-vis/dist/js/view/SimpleExerciseLobsterOutlet"
import { createRunestoneExerciseOutlet } from "lobster-vis/dist/js/view/embeddedExerciseOutlet"

import { applySkin, highlightCode } from "examma-ray/dist/core/render";
import "highlight.js/styles/github.css";

import "./code-grader.css";
import { COMPLETION_ALL_CHECKPOINTS, Exercise, Project } from "lobster-vis/dist/js/core/Project";
import "lobster-vis/dist/css/buttons.css"
import "lobster-vis/dist/css/main.css"
import "lobster-vis/dist/css/code.css"
import "lobster-vis/dist/css/exercises.css"
import "lobster-vis/dist/css/frontend.css"
import { EndOfMainStateCheckpoint } from "lobster-vis/dist/js/analysis/checkpoints";
import "lobster-vis/dist/js/lib/standard";
import { v4 as uuidv4 } from "uuid";

import queryString from "query-string";
import { isMeaningfulRubricItemGradingResult, ManualGradingGroupRecord, ManualGradingSubmission, RubricItemGradingResult } from "../manual_grading";
import { asMutable, assert, assertFalse, assertNever } from "../util/util";
import axios from "axios";
import { Simulation } from "lobster-vis/dist/js/core/Simulation";
import { AsynchronousSimulationRunner } from "lobster-vis/dist/js/core/simulationRunners";

import hotkeys from "hotkeys-js";
import { ManualGradingSubmissionComponent, ManualGraderApp } from "./ManualGrader";
import { parse_submission } from "examma-ray/dist/response/responses";
import { BLANK_SUBMISSION } from "examma-ray/dist/response/common";
import { AutoObject } from "lobster-vis/dist/js/core/objects";
import { CompleteObjectType } from "lobster-vis/dist/js/core/types";







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

    let code = this.app.config.test_harness;
    if (this.app.question.kind === "fill_in_the_blank") {
      let parsed = parse_submission("fill_in_the_blank", sub.submission);
      if (parsed === BLANK_SUBMISSION) {
        parsed = [];
      }
      parsed.forEach((blankSub, i) => {
        code = code.replace(`{{submission[${i}]}}`, blankSub);
      });
      // replace any remaining
      code = code.replace(/\{\{submission\[.*\]\}\}/gi, "");

    }
    else {
      code = code.replace("{{submission}}", indentString(sub.submission, 4));
    }

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
  
  public async autogradeGroup(group: ManualGradingGroupRecord) {
    
    // skip empty groups
    if (group.submissions.length === 0) {
      return undefined;
    }

    // A group that is finished, skip it
    if (group.finished) {
      return undefined;
    }

    let code = this.applyHarness(group.submissions[0]);

    let program = new SimpleProgram(code);
    let sim: Simulation;
    let regexes: RegExp[] = [];
    
    if (program.isRunnable()) {
      regexes.push(/AG-ON-COMPILE-SUCCESS\(([a-zA-Z]+)\)/i);

      sim = new Simulation(program);
      let runner = new AsynchronousSimulationRunner(sim);
      await runner.stepToEndOfMain(0, 5000);

      if (!sim.hasAnyEventOccurred) {
        regexes.push(/AG-ON-TESTS-PASS\(([a-zA-Z]+)\)/i);
      }
      else {
        regexes.push(/AG-ON-TESTS-FAIL\(([a-zA-Z]+)\)/i);
      }
    }
    else {
      // program not runnable
      regexes.push(/AG-ON-COMPILE-FAIL\(([a-zA-Z]+)\)/i);
    }

    let results : (RubricItemGradingResult | undefined)[] = this.app.rubric.map(ri => {
      let m: RegExpMatchArray | null = null;
      for(let i = 0; i < regexes.length; ++i) {
        if (m = ri.description.match(regexes[i])) {
          const s = m[1];
          if (s === "off" || s === "on" || s === "unknown") {
            return {status: s};
          }
          else {
            return undefined; // malformed status
          }
        }
      }

      const localValRegex = /AG-MAIN-LOCAL\(([a-zA-Z_]+[a-zA-Z0-9_]*), *([a-zA-Z]+)\)/i;
      let localValMatch = ri.description.match(localValRegex);
      if(localValMatch) {
        const localName = localValMatch[1];
        const status = localValMatch[2];
        let val = sim.memory.stack.topFrame()?.localObjectsByName[localName]?.rawValue();
        if (val) {
          if (status === "off" || status === "on" || status === "unknown") {
            return {status: status};
          }
        }
        
        return undefined; // variable was false or malformed status
      }

      return undefined; // no regexes matched, do nothing for this rubric item
    });

    return results;
    
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