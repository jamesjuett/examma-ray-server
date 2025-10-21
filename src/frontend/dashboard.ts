import avatar from "animal-avatar-generator";
import axios from "axios";
import { Exam, parseExamSpecification, Question } from "examma-ray";
import { ExamDiff } from "examma-ray/dist/ExamDiff";
import queryString from "query-string";
import { ExamPingResponse, RunGradingRequest } from "../dashboard";
import { ExamTaskStatus } from "../ExamServer";
import { ExamAssignmentInfo, ExamInfo, ExamInstanceInfo, ExamSubmissionInfo, WindowInfo } from "../rest_types";
import { asMutable, assert } from "../util/util";
import { ExammaRayClient } from "./Application";
import randomColor from "randomcolor";
import { event } from "jquery";
import { format } from "path";
import { StudentEditor } from "./StudentEditor";
import { CollaborativeGraderKind, CollaborativeGradingServerConfig } from "../collaborative_grading/CollaborativeGradingTypes";
import { GradedResponseKind, GraderFor, GraderSpecification } from "examma-ray/dist/graders/QuestionGrader";

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

async function getExam(client: ExammaRayClient, exam_id: string): Promise<Exam> {
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

async function getCollaborativeGradingServers(client: ExammaRayClient, exam_id: string, exam_instance_uuid: string) {
  return (await axios({
    url: `/api/exams/${exam_id}/instances/${exam_instance_uuid}/collaborative_grading_servers`,
    method: "GET",
    data: {},
    headers: {
      'Authorization': 'bearer ' + client.getBearerToken()
    }
  })).data as readonly CollaborativeGradingServerConfig[];
}


export class ExamDashboardApplication {

  public readonly client: ExammaRayClient;

  public readonly exam_info: ExamInfo;
  public readonly exam_instance_info: ExamInstanceInfo;
  public readonly exam: Exam;
  public readonly collaborative_grading_servers_by_question_id: ReadonlyMap<string, CollaborativeGradingServerConfig>;

  public readonly exam_windows: readonly WindowInfo[] = [];
  private exam_windows_by_uuid: Map<string, WindowInfo> = new Map();

  public assigned_exams_by_uuid: Map<string, ExamAssignmentInfo> = new Map();
  public assigned_exams_by_uniqname: Map<string, ExamAssignmentInfo> = new Map();

  
  private instance_epoch: string = "";
  
  public studentEditor: StudentEditor;

  private constructor(client: ExammaRayClient, exam_info: ExamInfo, exam_instance_info: ExamInstanceInfo, exam: Exam, collaborative_grading_servers: readonly CollaborativeGradingServerConfig[]) {
    this.client = client;
    this.exam_instance_info = exam_instance_info;
    this.exam_info = exam_info;
    this.exam = exam;
    this.collaborative_grading_servers_by_question_id = new Map(collaborative_grading_servers.map(cgs => [cgs.question_id, cgs]));
    this.studentEditor = new StudentEditor(this, $("#student-editor-elem"));

    this.initComponents();

    this.reloadExam();
    this.sendPing();
    setInterval(() => this.sendPing(), 5000);
    setInterval(() => this.checkTaskStatus(), 2000);

  }

  public static async create(exam_id: string, exam_instance_uuid: string) {
    
    const client = await ExammaRayClient.create();
    
    return new ExamDashboardApplication(
      client,
      await getExamInfo(client, exam_id),
      await getExamInstanceInfo(client, exam_id, exam_instance_uuid),
      await getExam(client, exam_id),
      await getCollaborativeGradingServers(client, exam_id, exam_instance_uuid),
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

    $("#examma-ray-grading-overview-link").attr("href", `/out/${this.exam_info.exam_id}/graded/overview.html`);


    

    

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
        url: `/run/generate/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}`,
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
        url: `/run/process_db_submissions/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}`,
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
        url: `/run/grade/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}`,
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

    $("#exam-content-exam-spec-file-input").on("change", () => {
      
      let files = (<HTMLInputElement>$("#exam-content-exam-spec-file-input")[0]).files;
      if (files && files.length > 0) {
        this.considerSpecFile(files[0]);
      }
      else {
        $("#exam-content-exam-spec-button").prop("disabled", true).removeClass("btn-warning btn-danger").addClass("btn-success").html('<i class="bi bi-file-check"></i> Uploaded');
      }
    });

    $("#exam-content-exam-spec-button").on("click", async () => {
      let files = (<HTMLInputElement>$("#exam-content-exam-spec-file-input")[0]).files;
      if (!files || !files[0]) {
        return;
      }
      const formData = new FormData();
      formData.append("exam_spec", files[0]);
      await axios({
        url: `/api/exams/${this.exam_info.exam_id}/spec`,
        method: "PUT",
        data: formData,
        headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken(),
        },
      });
      
      $("#exam-content-exam-spec-file-input").val("");
      $("#exam-content-exam-spec-button").prop("disabled", true).removeClass("btn-warning btn-danger").addClass("btn-success").html('<i class="bi bi-file-check"></i> Uploaded');
    });

    $("#exam-content-assets-bundle-file-input").on("change", () => {
      let files = (<HTMLInputElement>$("#exam-content-assets-bundle-file-input")[0]).files;
      if (files && files.length > 0) {
        this.considerAssetsBundleFile(files[0]);
      }
      else {
        $("#exam-content-assets-bundle-button").prop("disabled", true).removeClass("btn-warning btn-danger").addClass("btn-success").html('<i class="bi bi-file-check"></i> Uploaded');
      }
    });

    $("#exam-content-assets-bundle-button").on("click", async () => {
      let files = (<HTMLInputElement>$("#exam-content-assets-bundle-file-input")[0]).files;
      if (!files || !files[0]) {
        return;
      }
      const formData = new FormData();
      formData.append("assets_bundle", files[0]);
      await axios({
        url: `/api/exams/${this.exam_info.exam_id}/assets`,
        method: "PUT",
        data: formData,
        headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken(),
        },
      });

      $("#exam-content-assets-bundle-file-input").val("");
      $("#exam-content-assets-bundle-button").prop("disabled", true).removeClass("btn-warning btn-danger").addClass("btn-success").html('<i class="bi bi-file-check"></i> Uploaded');
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

    $("#live-submission-viewer-link").attr("href", `/staff/live_submission.html?exam-id=${this.exam_info.exam_id}&exam-instance-uuid=${this.exam_instance_info.exam_instance_uuid}`)

  }

  private considerSpecFile(file: File) {
    const reader = new FileReader();
    reader.readAsText(file);
    reader.onload = () => {
      
      $("#exam-content-exam-spec-button").prop("disabled", true).removeClass("btn-success btn-warning").addClass("btn-danger").html('<i class="bi bi-file-x"></i> Invalid File');
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

      $("#exam-content-exam-spec-button").prop("disabled", false).removeClass("btn-success btn-danger").addClass("btn-warning").html('<i class="bi bi-file-arrow-up"></i> Upload');
    };
    reader.onerror = () => {
      alert(reader.error);
    }
  }

  private considerAssetsBundleFile(file: File) {
    if (file.name.endsWith(".zip")) {
      $("#exam-content-assets-bundle-button").prop("disabled", false).removeClass("btn-danger btn-success").addClass("btn-warning").html('<i class="bi bi-file-arrow-up"></i> Upload');
    }
    else {
      $("#exam-content-assets-bundle-button").prop("disabled", true).removeClass("btn-success btn-warning").addClass("btn-danger").html('<i class="bi bi-file-x"></i> Invalid File');
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

    if (this.instance_epoch !== instance_epoch) {
      this.instance_epoch = instance_epoch;
      await this.reloadExam();
    }
    
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
      // const exam_instances = <DB_Exam_Instances[]>exam_instance_response.data;
      // if (exam_instances.length > 0) {
      //   asMutable(this).exam_instance_uuid = exam_instances[0].exam_instance_uuid;
      // }

      asMutable(this).exam_windows = (await axios({
        url: `/api/exams/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}/windows`,
        method: "GET",
        headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      })).data as WindowInfo[];
      this.exam_windows_by_uuid = new Map(this.exam_windows.map(w => [w.window_uuid, w]));

      const assigned_exams = (await axios({
        url: `/api/exams/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}/assigned_exams`,
        method: "GET",
        headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      })).data as ExamAssignmentInfo[];

      this.assigned_exams_by_uuid = new Map(assigned_exams.map(a => [a.exam_uuid, a]));
      this.assigned_exams_by_uniqname = new Map(assigned_exams.map(a => [a.uniqname, a]));

      const submissions = (await axios({
        url: `/api/exams/${this.exam_info.exam_id}/instances/${this.exam_instance_info.exam_instance_uuid}/submissions`,
        method: "GET",
        headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      })).data as ExamSubmissionInfo[];

      const submissions_by_uuid: {[index: string]: ExamSubmissionInfo} = {};
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
        .map(assn => Object.assign({}, assn, assn.window_uuid ? this.exam_windows_by_uuid.get(assn.window_uuid) : undefined))
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
          const assn_window = assn.window_uuid && this.exam_windows_by_uuid.get(assn.window_uuid);
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

      const createAutograderOrCollaborativeGradingServerLink = (question_id: string, default_grader: GraderSpecification<CollaborativeGraderKind>) => {
        const cgs = this.collaborative_grading_servers_by_question_id.get(question_id);
        if (cgs) {
          return `<li>${question_id}: <a href="${cgs.grader_kind}.html?exam_id=${this.exam.exam_id}&grading_server_pk=${cgs.grading_server_pk}">Collaborative Rubric (<code>${cgs.grader_kind}</code>)</a></li>`;
        }
        else {
          const self = this;
          return $(`<li>${question_id}: <button type="button" class="btn btn-sm btn-primary">Create Collaborative Rubric</button></li>`).on("click", async function () {
            const cgs = (await axios({
              url: `/api/exams/${self.exam.exam_id}/instances/${self.exam_instance_info.exam_instance_uuid}/collaborative_grading_servers/${question_id}`,
              method: "PUT",
              data: {
                grader_kind: "standard_fitb_drop",
              },
              headers: {
                'Authorization': 'bearer ' + self.client.getBearerToken(),
              },
            })).data as CollaborativeGradingServerConfig;
            $(this).replaceWith(`<li>${question_id}: <a href="${cgs.grader_kind}.html?exam_id=${self.exam.exam_id}&grading_server_pk=${cgs.grading_server_pk}">Collaborative Rubric (<code>${cgs.grader_kind}</code>)</a></li>`);
          });
        }
      }

      const question_elems = this.exam.allQuestions.map(q =>
        !q.response.default_grader ? `<li>${q.question_id}: <span style="color: red;">No grader defined.</span></li>` :
        q.response.default_grader.grader_kind === "manual_code_writing" ? `<li>${q.question_id}: <a href="manual-code-grader.html?exam_id=${this.exam.exam_id}&question_id=${q.question_id}">Manual Grading</a><span id="question-grader-avatars-${q.question_id}" class="question-grader-avatars"></span></li>` :
        q.response.default_grader.grader_kind === "manual_generic" ? `<li>${q.question_id}: <a href="manual-generic-grader.html?exam_id=${this.exam.exam_id}&question_id=${q.question_id}">Manual Grading</a><span id="question-grader-avatars-${q.question_id}" class="question-grader-avatars"></span></li>` :
        q.response.default_grader.grader_kind === "freebie" ? `<li>${q.question_id}: Autograded (<code>freebie</code>)</li>` :
        q.response.default_grader.grader_kind === "standard_iframe" ? `<li>${q.question_id}:: Autograded (<code>standard_iframe</code>)</li>` :
        createAutograderOrCollaborativeGradingServerLink(q.question_id, q.response.default_grader)
      );

      question_elems.forEach(qe => {$("#examma-ray-question-grading-list").append(qe);});


        
      this.studentEditor.onEpochUpdate();
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


  await ExamDashboardApplication.create(exam_id, exam_instance_uuid);
}

if (typeof $ === "function") {
  $(main);
}
else {
  alert("It appears some required 3rd party libraries did not load. Please try refreshing the page (might take a few tries). If the problem persists, contact your course staff or instructors.")
}