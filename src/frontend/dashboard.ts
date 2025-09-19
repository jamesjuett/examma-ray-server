import avatar from "animal-avatar-generator";
import axios from "axios";
import { Exam, parseExamSpecification } from "examma-ray";
import { ExamDiff } from "examma-ray/dist/ExamDiff";
import queryString from "query-string";
import { ExamPingResponse, RunGradingRequest } from "../dashboard";
import { ExamTaskStatus } from "../ExamServer";
import { ExamAssignmentInfo, ExamInfo, ExamInstanceInfo, SubmissionInfo, WindowInfo } from "../rest_types";
import { assert } from "../util/util";
import { ExammaRayClient } from "./Application";
import { LiveSubmissionViewer } from "./LiveSubmissionViewer";
import randomColor from "randomcolor";

async function getExamInfo(client: ExammaRayClient, exam_id: string): Promise<ExamInfo> {
  return (await axios({
    url: `/api/exams/${exam_id}`,
    method: "GET",
    data: {},
    headers: {
      'Authorization': 'bearer ' + client.getBearerToken()
    }
  })).data as ExamInfo;
}

async function getExamInstanceInfo(client: ExammaRayClient, exam_id: string, exam_instance_uuid: string): Promise<ExamInstanceInfo> {
  return (await axios({
    url: `/api/exams/${exam_id}/instances/${exam_instance_uuid}`,
    method: "GET",
    data: {},
    headers: {
      'Authorization': 'bearer ' + client.getBearerToken()
    }
  })).data as ExamInstanceInfo;
}

async function getExamSpec(client: ExammaRayClient, exam_id: string): Promise<Exam> {
  const exam_spec_response = await axios({
    url: `/api/exams/${exam_id}/spec`,
    method: "GET",
    data: {},
    headers: {
      'Authorization': 'bearer ' + client.getBearerToken()
    },
    responseType: "text",
    transformResponse: [v => v] // Avoid default transformation that attempts JSON parsing (so we can parse our special way below)
  });
  return Exam.create(parseExamSpecification(exam_spec_response.data as string));
}

export class DashboardExammaRayGraderApplication {

  public readonly client: ExammaRayClient;

  public readonly exam_info: ExamInfo;
  public readonly exam_instance_info: ExamInstanceInfo;
  public readonly exam: Exam;

  private exam_windows: WindowInfo[] = [];
  private exam_widows_by_uuid: Map<string, WindowInfo> = new Map();

  private assigned_exams_by_uuid: Map<string, ExamAssignmentInfo> = new Map();

  private live_submission_viewer: LiveSubmissionViewer;

  private constructor(client: ExammaRayClient, exam_info: ExamInfo, exam_instance_info: ExamInstanceInfo, exam: Exam) {
    this.client = client;
    this.exam_instance_info = exam_instance_info;
    this.exam_info = exam_info;
    this.exam = exam;
    this.live_submission_viewer = new LiveSubmissionViewer(this.client, this.exam, $("#live-submission-viewer-elem"));

    this.initComponents();

    this.reloadExam();
    this.sendPing();
    setInterval(() => this.sendPing(), 5000);
    setInterval(() => this.checkTaskStatus(), 2000);
  }

  public static async create(exam_id: string, exam_instance_uuid: string) {
    
    const client = await ExammaRayClient.create();
    
    return new DashboardExammaRayGraderApplication(
      client,
      await getExamInfo(client, exam_id),
      await getExamInstanceInfo(client, exam_id, exam_instance_uuid),
      await getExamSpec(client, exam_id)
    );
  }

  private initComponents() {
    $("#examma-ray-exam-instance-name").html(this.exam_instance_info.name);
    this.exam_info.exam_instances.forEach(ei => {
      $("#examma-ray-exam-instances-dropdown").append(`
        <a class="dropdown-item" href="dashboard.html?exam-id=${this.exam_info.exam_id}&exam-instance-uuid=${ei.exam_instance_uuid}">${ei.name}</a>
      `);
    });
    $("#examma-ray-exam-instances-dropdown").append("<div class='dropdown-divider'></div>");
    const create_link = $('<a class="dropdown-item"><i class="bi bi-plus"></i> Create New Instance</a>').appendTo($("#examma-ray-exam-instances-dropdown"));

    $("#examma-ray-grading-overview-link").attr("href", `out/${this.exam_info.exam_id}/${this.exam_instance_info.exam_instance_uuid}/graded/overview.html`);

    $("#change_uuidv5_namespace-modal").on("show.bs.modal", () => {
      $("#change_uuidv5_namespace-input").val(this.exam_instance_info.uuidv5_namespace);
      $("#change_uuidv5_namespace-submit-button").prop("disabled", true);
    });
  
    $("#change_uuidv5_namespace-input").on("input", () => {
      $("#change_uuidv5_namespace-submit-button").prop(
        "disabled",
        $("#change_uuidv5_namespace-input").val() === this.exam_instance_info.uuidv5_namespace
        || !($("#change_uuidv5_namespace-input")[0] as HTMLInputElement).checkValidity()
      );
    });

    $("#change_uuidv5_namespace-submit-button").on("click", async () => {
      await axios({
        url: `/api/exams/${this.exam_info.exam_id}/instances/${this.exam_instance_info}/uuidv5_namespace`,
        method: "PUT",
        data: {
          uuidv5_namespace: $("#change_uuidv5_namespace-input").val()
        },
        headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken(),
        },
      });
      
      $("#change_uuidv5_namespace-modal").modal("hide");
    });

    $("#upload-roster-modal-button").on("click", async () => {
      
      let files = (<HTMLInputElement>$("#upload-roster-file-input")[0]).files;
      if (!files || !files[0]) {
        return;
      }
      const formData = new FormData();
      formData.append("roster", files[0]);
      await axios({
        url: `/api/exams/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}/roster`,
        method: "put",
        data: formData,
        headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken(),
        },
      });

      $("#upload-roster-modal").modal("hide");
    });

    

    $("#upload-windows-modal-button").on("click", async () => {
      
      let files = (<HTMLInputElement>$("#upload-windows-file-input")[0]).files;
      if (!files || !files[0]) {
        return;
      }
      const formData = new FormData();
      formData.append("windows", files[0]);
      await axios({
        url: `/api/exams/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}/windows`,
        method: "put",
        data: formData,
        headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken(),
        },
      });

      $("#upload-windows-modal").modal("hide");
    });

    
    $("#submissions-file-input-form").on("submit", async (e) => {
      e.preventDefault();
      let files = (<HTMLInputElement>$("#submissions-file-input")[0]).files;
      if (files) {
        this.addSubmissions(files);
      }
    });

    $("#run-generate-submit-button").on("click", async () => {
      let response = await axios({
        url: `run/generate/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}`,
        method: "POST",
        headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      });

      if (response.status !== 200) {
        alert(response.data);
      }
      
      $("#run-generate-modal").modal("hide");
    });
    

    $("#run-process-submissions-button").on("click", async () => {
      let response = await axios({
        url: `run/process_db_submissions/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}`,
        method: "POST",
        headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      });

      if (response.status !== 200) {
        alert(response.data);
      }
    });
    
    $("#run-grading-submit-button").on("click", async () => {
      const request: RunGradingRequest = {
        reports: $("#run-grading-input-reports").is(":checked"),
        curve: $("#run-grading-input-curve").is(":checked"),
        target_mean: parseFloat(""+$("#run-grading-input-curve-target-mean").val()),
        target_stddev: parseFloat(""+$("#run-grading-input-curve-target-stddev").val()),
      };

      let response = await axios({
        url: `run/grade/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}`,
        method: "POST",
        data: request,
        headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      });

      $("#run-grading-modal").modal("hide");
    });

    $("#delete-exam-id-confirmation").on("input", () => {
      $("#delete-exam-button").prop("disabled", $("#delete-exam-id-confirmation").val() !== this.exam_instance_info.name);
    });

    $("#delete-exam-button").on("click", async () => {
      
      let response = await axios({
        url: `/api/exams/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}`,
        method: "DELETE",
        headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      });

      $("#delete-exam-modal").modal("hide");
      $("#exam-deleted-modal").modal({show: true, backdrop: "static"});
    });

    $("#specification-exam-spec-file-input").on("change", () => {
      
      let files = (<HTMLInputElement>$("#specification-exam-spec-file-input")[0]).files;
      if (files && files.length > 0) {
        this.considerSpecFile(files[0]);
      }
      else {
        $("#specification-exam-spec-button").prop("disabled", true).removeClass("btn-warning").addClass("btn-success").html('<i class="bi bi-file-check"></i> Uploaded');
      }
    });

    $("#specification-exam-spec-button").on("click", async () => {
      const formData = new FormData();
      let files = (<HTMLInputElement>$("#specification-exam-spec-file-input")[0]).files;
      if (!files || !files[0]) {
        return;
      }
      formData.append("exam_spec", files[0]);
      await axios({
        url: `/api/exams`,
        method: "POST",
        data: formData,
        headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken(),
        },
      });
      
      $("#specification-exam-spec-file-input").val("");
      $("#specification-exam-spec-button").prop("disabled", true).removeClass("btn-warning").addClass("btn-success").html('<i class="bi bi-file-check"></i> Uploaded');
    });


    $("#student-settings-modal").on("show.bs.modal", () => {
      $("#student-settings-submit-button").prop("disabled", true);
    });
  
    $("#student-settings-modal input").on("input", () => {
      $("#student-settings-submit-button").prop(
        "disabled",
        !($("#student-settings-duration-multiplier-input")[0] as HTMLInputElement).checkValidity()
      );
    });

    $("#student-settings-submit-button").on("click", async () => {
      await axios({
        url: `/api/assigned_exams/${$("#student-settings-modal").data("exam-uuid")}`,
        method: "PUT",
        data: {
          exam_id: this.exam_info.exam_id,
          exam_instance_uuid: this.exam_instance_info.exam_instance_uuid,
          exam_window: $("#student-settings-window-input").val(),
          duration_multiplier: parseFloat(""+$("#student-settings-duration-multiplier-input").val()),
        },
        headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken(),
        },
      });
      
      $("#student-settings-modal").modal("hide");
    });



    $("#live-submission-viewer-view-button").on("click", async () => {
      
      try {
        const uniqname = $("#live-submission-viewer-uniqname-input").val();
        const assn = (await axios({
          url: `/api/exams/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}/assigned_exams_by_uniqname/${uniqname}`,
          method: "GET",
          headers: {
              'Authorization': 'bearer ' + this.client.getBearerToken()
          }
        })).data as ExamAssignmentInfo;

        this.live_submission_viewer.setStudent(assn);
      }
      catch(e: unknown) {
        alert("Error loading student submission :(");
      }
    });


    if (window.location.hash) {
      $('ul.nav a[href="' + window.location.hash + '"]').tab('show');
    }
    else {
      $('ul.nav a').first().tab('show');
    }
  
    $('#dashboard-navigation a').on("click", function() {
      window.location.hash = (<HTMLAnchorElement>this).hash.substring(1);
    });

  }

  private considerSpecFile(file: File) {
    const reader = new FileReader();
    reader.readAsText(file);
    reader.onload = () => {
      
      const original_exam = this.exam;
      const new_exam = Exam.create(parseExamSpecification(<string>reader.result));
      if (original_exam) {
        const exam_diff = ExamDiff.shallowDiff(original_exam.spec, new_exam.spec);
        console.log("Exam diff:");
        console.log(exam_diff);

        console.log("Section Diffs:");
        new_exam.allSections.forEach(new_section => {
          const original_section = original_exam.getSectionById(new_section.section_id);
          if (!original_section) { return; }
          const section_diff = ExamDiff.shallowDiff(original_section.spec, new_section.spec);
          if(section_diff) {
            console.log("Section Diff: " + new_section.section_id);
            console.log(section_diff);
          }
        });

        new_exam.allQuestions.forEach(new_question => {
          const original_question = original_exam.getQuestionById(new_question.question_id);
          if (!original_question) { return; }
          const question_diff = ExamDiff.shallowDiff(original_question.spec, new_question.spec);
          if (question_diff) {
            console.log("Question Diff: " + new_question.question_id);
            console.log(question_diff);
            console.log(original_question.response);
            console.log(new_question.response);
          }
        })
      }

      $("#specification-exam-spec-button").prop("disabled", false).removeClass("btn-success").addClass("btn-warning").html('<i class="bi bi-file-arrow-up"></i> Upload');
    };
    reader.onerror = () => {
      alert(reader.error);
    }
  }

  private async checkTaskStatus() {

    const task_status = (await axios({
      url: `/api/exams/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}/tasks`,
      method: "GET",
      headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken()
      }
    })).data as ExamTaskStatus;

    $("#examma-ray-task-status").html(`
      <table>
        ${Object.entries(task_status).map(([task, status]) => `
          <tr>
            <td><span class="badge badge-primary">${task}</span></td>
            <td>${status}</td>
          </tr>
        `).join("")
        }
      </table>
    `);
    
  }

  private async sendPing() {

    const exam_ping_response = <ExamPingResponse>(await axios({
      url: `/api/exams/${this.exam_info.exam_id}/ping`,
      method: "GET",
      headers: {
        'Authorization': 'bearer ' + this.client.getBearerToken()
      }
    })).data;

    const instance_epoch = (await axios({
      url: `/api/exams/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}/epoch`,
      method: "GET",
      headers: {
        'Authorization': 'bearer ' + this.client.getBearerToken()
      }
    })).data as string;
    assert(typeof instance_epoch === "string");

    // if (this.exam_epoch !== current_epoch) {
    //   this.exam_epoch = current_epoch;
    //   await this.reloadExam();
    // }
    
    $(".question-grader-avatars").empty();
    Object.keys(exam_ping_response.active_graders).forEach(question_id => {
      let questionElem = $(`#question-grader-avatars-${question_id}`);
      Object.values(exam_ping_response.active_graders[question_id].graders).forEach(grader => {
        $(`<div style="display: inline-block;" data-toggle="tooltip" data-placement="bottom" title="${grader.email}">
          ${avatar(grader.email, { size: 30 })}
        </div>`).appendTo(questionElem);
      });
    });
  }


  public async reloadExam() {

    try {
      
      // const exam_info : DB_Exams = (await axios({
      //   url: `/api/exams/${this.exam_id}`,
      //   method: "GET",
      //   data: {},
      //   headers: {
      //       'Authorization': 'bearer ' + this.client.getBearerToken()
      //   }
      // })).data;

      // console.log(exam_info);
      // asMutable(this).exam_info = exam_info;
      
      // $("#exam-uuidv5_namespace").val(this.exam_instance_info.uuidv5_namespace);

      // const exam_spec_response = await axios({
      //   url: `/api/exams/${this.exam_id}/spec`,
      //   method: "GET",
      //   data: {},
      //   headers: {
      //       'Authorization': 'bearer ' + this.client.getBearerToken()
      //   },
      //   responseType: "text",
      //   transformResponse: [v => v] // Avoid default transformation that attempts JSON parsing (so we can parse our special way below)
      // });
      // const exam_spec = parseExamSpecification(exam_spec_response.data);

      // asMutable(this).exam = Exam.create(exam_spec);
      // assert(this.exam);

      // const exam_instance_response = await axios({
      //   url: `/api/exams/${this.exam_id}/instances`,
      //   method: "GET",
      //   headers: {
      //       'Authorization': 'bearer ' + this.client.getBearerToken()
      //   },
      // });
      // const exam_instances = <DB_Live_Exam_Instances[]>exam_instance_response.data;
      // if (exam_instances.length > 0) {
      //   asMutable(this).exam_instance_uuid = exam_instances[0].exam_instance_uuid;
      // }

      this.exam_windows = (await axios({
        url: `/api/exams/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}/windows`,
        method: "GET",
        headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      })).data as WindowInfo[];
      this.exam_widows_by_uuid = new Map(this.exam_windows.map(w => [w.window_uuid, w]));

      $("#examma-ray-exam-windows-list").html(`
        ${this.exam_windows.map(w => `
          <li>
            <strong>${w.name}</strong>: ${new Date(w.open_time).toLocaleString()} - ${new Date(w.close_time).toLocaleString()}
          </li>
        `).join("\n")}
      `);

      const assigned_exams = (await axios({
        url: `/api/exams/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}/assigned_exams`,
        method: "GET",
        headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      })).data as ExamAssignmentInfo[];

      this.assigned_exams_by_uuid = new Map(assigned_exams.map(a => [a.exam_uuid, a]));

      const submissions = (await axios({
        url: `/api/exams/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}/submissions`,
        method: "GET",
        headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      })).data as SubmissionInfo[];

      const submissions_by_uuid: {[index: string]: SubmissionInfo} = {};
      submissions.forEach(s => submissions_by_uuid[s.exam_uuid] = s);

      // const roster_response = await axios({
      //   url: `/api/exams/${this.exam_id}/roster`,
      //   method: "GET",
      //   headers: {
      //       'Authorization': 'bearer ' + this.client.getBearerToken()
      //   }
      // });
      // const roster = <StudentInfo[]>roster_response.data;

      // ${submissions_by_uuid[assn.exam_uuid]
      //   ? `
      //     <a class="btn btn-sm btn-primary" href="out/${this.exam.exam_id}/submitted/${assn.uniqname}-${this.exam.exam_id}.html">Submission</a>
      //     <a class="btn btn-sm btn-danger examma-ray-delete-submission-button" data-submission-uuid="${submissions_by_uuid[assn.exam_uuid]}">Delete</a>
      //     <span class="text-muted">(${new Date(submissions_by_uuid[assn.exam_uuid].updated_at).toLocaleString()})</span>
      //   `
      //   : "[no submission]"
      // }
      const assn_and_windows = Object.values(assigned_exams)
        .map(assn => Object.assign({}, assn, assn.window_uuid ? this.exam_widows_by_uuid.get(assn.window_uuid) : undefined))
        .sort((a,b) => {
          if (a?.open_time && b?.open_time) {
            return new Date(a.open_time).getTime() - new Date(b.open_time).getTime();
          }
          else if (a?.open_time) {
            return -1;
          }
          else if (b?.open_time) {
            return 1;
          }
          else {
            return a.uniqname.localeCompare(b.uniqname);
          }
        });
        
        $(".examma-ray-students-list").html(assn_and_windows.map(assn => {
          const assn_window = assn.window_uuid && this.exam_widows_by_uuid.get(assn.window_uuid);
          return `<li>
            ${assn.uniqname}
            <button type="button" class="btn btn-sm btn-warning student-settings-modal-open" data-exam-uuid="${assn.exam_uuid}"><i class="bi bi-pencil"></i> Edit Student</button>
            ${submissions_by_uuid[assn.exam_uuid]
              ? `<span class="text-muted">Submitted ${new Date(submissions_by_uuid[assn.exam_uuid].updated_at).toLocaleString()}</span>`
              : '<span class="text-muted">[no submission]</span>'
            }
            ${assn_window ? `<span class="badge" style="background-color: ${randomColor({luminosity: "light", seed: assn_window.name ?? assn_window.window_uuid})}">${assn_window.name ?? assn.window_uuid}</span>` : ""}
          </li>`
        }).join(""));

      const self = this;
      $(".examma-ray-students-list .examma-ray-delete-submission-button").on("click", async function() {

        await axios({
          url: `/api/exams/${self.exam.exam_id}/submissions/${$(this).data("submission-uuid")}`,
          method: "DELETE",
          headers: {
            'Authorization': 'bearer ' + self.client.getBearerToken(),
          },
        });

        self.sendPing();
      });
      
      $(".examma-ray-students-list .student-settings-modal-open").on("click", async function() {

        $("#student-settings-modal").data("exam-uuid", $(this).data("exam-uuid"));
        const assn = self.assigned_exams_by_uuid.get($("#student-settings-modal").data("exam-uuid"));
        assert(assn);
        $("#student-settings-uniqname-input").val(assn.uniqname);
        $("#student-settings-email-input").val(assn.student_email);
        $("#student-settings-duration-multiplier").val(assn.duration_multiplier);
        self.exam_windows.forEach(w => {
          $("#student-settings-window-input").append(`
            <option value="${w.window_uuid}" ${assn.window_uuid === w.window_uuid ? "selected" : ""}>${w.name}</option>
          `);
        });
        $("#student-settings-modal").modal("show");

      });

      $("#examma-ray-question-grading-list").html(
        this.exam.allQuestions
          .filter(q => q.response.default_grader?.grader_kind === "manual_code_writing")
          .map(q => `<li><a href="manual-code-grader.html?exam_id=${this.exam.exam_id}&question_id=${q.question_id}">${q.question_id}</a><span id="question-grader-avatars-${q.question_id}" class="question-grader-avatars"></span></li>`).join("\n")
        + 
        this.exam.allQuestions
        .filter(q => q.response.default_grader?.grader_kind === "manual_generic")
        .map(q => `<li><a href="manual-generic-grader.html?exam_id=${this.exam.exam_id}&question_id=${q.question_id}">${q.question_id}</a><span id="question-grader-avatars-${q.question_id}" class="question-grader-avatars"></span></li>`).join("\n")
        + 
        this.exam.allQuestions
        .filter(q => q.response.default_grader === undefined)
        .map(q => `<li><span style="color: red;">No grader defined for: ${q.question_id}</span></li>`).join("\n")
      );
        
    }
    catch(e: unknown) {
      alert("Error loading question :(");
    }
  }

  public async addSubmissions(files: FileList) {
    if (!this.exam) {
      return;
    }
    
    const formData = new FormData();
    if (files) {
      for(let i = 0; i < files.length; ++i) {
        formData.append("submissions", files[i]);
      }
    }

    await axios({
      url: `/api/exams/${this.exam.exam_id}/submissions`,
      method: "POST",
      data: formData,
      headers: {
        'Authorization': 'bearer ' + this.client.getBearerToken(),
      },
    });
  }
}

async function main() {
  
  const qs = queryString.parse(location.search);
  const exam_id = qs["exam-id"];
  const exam_instance_uuid = qs["exam-instance-uuid"];
  assert(typeof exam_id === "string");
  assert(typeof exam_instance_uuid === "string");


  await DashboardExammaRayGraderApplication.create(exam_id, exam_instance_uuid);
}

if (typeof $ === "function") {
  $(main);
}
else {
  alert("It appears some required 3rd party libraries did not load. Please try refreshing the page (might take a few tries). If the problem persists, contact your course staff or instructors.")
}