import axios from "axios";
import { AssignedExam, Exam } from "examma-ray";
import { SubmittedExamRenderer } from "examma-ray/dist/core/exam_renderer";
import { ExamSubmission, fillManifest, OpaqueExamSubmission, TransparentExamManifest, TrustedExamSubmission } from "examma-ray/dist/core/submissions";
import { asMutable } from "../util/util";
import { ExammaRayClient } from "./Application";
import { ExamAssignmentInfo } from "../rest_types";
import { ExamDashboardApplication } from "./dashboard";

const UP_TO_DATE_HTML = `<i class="bi bi-cloud-check"></i>`;
const UPDATED_HTML = `
  <i class="bi bi-cloud-check"></i><span class="edit-student-submit-button-updated-text" style="display: inline-block; transition: width 0.3s linear; overflow: clip; white-space: nowrap;">&nbsp;Updated</span>
`;
const SAVE_CHANGES_HTML = `<i class="bi bi-cloud-arrow-up"></i> Save Changes`;

// TODO: name disappears on edit
export class StudentEditor {
  
  public readonly dashboard: ExamDashboardApplication;
  
  private readonly html_elem: JQuery;

  private editingStudent?: ExamAssignmentInfo;

  private studentUpdatedTimeout?: number;
  
  public constructor(dashboard: ExamDashboardApplication, html_elem: JQuery) {
    this.dashboard = dashboard;
    this.html_elem = html_elem;
    
    $("#upload-roster-modal-button").on("click", async () => {
      
      let files = (<HTMLInputElement>$("#upload-roster-file-input")[0]).files;
      if (!files || !files[0]) {
        return;
      }
      const formData = new FormData();
      formData.append("roster", files[0]);
      await axios({
        url: `/api/exams/${dashboard.exam_info.exam_id}/instances/${dashboard.exam_instance_info.exam_instance_uuid}/roster`,
        method: "put",
        data: formData,
        headers: {
          'Authorization': 'bearer ' + dashboard.client.getBearerToken(),
        },
      });

      $("#upload-roster-modal").modal("hide");
    });

    $("#student-settings-modal").on("show.bs.modal", () => {
      $("#student-settings-submit-button").prop("disabled", true);
    });
  
    $("#student-settings-modal form").on("input", ":input", () => {
      $("#student-settings-submit-button").prop(
        "disabled",
        !($("#student-settings-duration-multiplier-input")[0] as HTMLInputElement).checkValidity()
      );
    });

    $("#edit-student-uniqname-input").on("input", () => {
      const student = this.dashboard.assigned_exams_by_uniqname.get(""+$("#edit-student-uniqname-input").val());
      this.setEditingStudent(student);
    });



    $("#edit-student-form").on("input", "#edit-student-name-input, #edit-student-window-select, #edit-student-duration-multiplier-input", (e) => {
      if (this.editingStudent) {
        this.updateEditStudentButtonSaveChanges();
      }
    });


    $("#edit-student-submit-button").on("click", async (e) => {

      if (!this.editingStudent) {
        return;
      }
      
      if (!($("#edit-student-form")[0] as HTMLFormElement).checkValidity()) {
        e.preventDefault();
        e.stopPropagation();
        $("#edit-student-form").addClass("was-validated");
        return;
      }

      await axios({
        url: `/api/assigned_exams/${this.editingStudent.exam_uuid}`,
        method: "PUT",
        data: {
          exam_id: dashboard.exam_info.exam_id,
          exam_instance_uuid: dashboard.exam_instance_info.exam_instance_uuid,
          name: $("#edit-student-name-input").val(),
          exam_window: $("#edit-student-window-select").val(),
          duration_multiplier: parseFloat(""+$("#edit-student-duration-multiplier-input").val()),
        },
        headers: {
          'Authorization': 'bearer ' + dashboard.client.getBearerToken(),
        },
      });

      // Keep same student selected, but disable submit button.
      this.updateEditStudentButtonUpdated();
      $("#edit-student-form").removeClass("was-validated");

    });

    $("#edit-student-cancel-button").on("click", async (e) => {
      this.setEditingStudent(this.editingStudent);
    });

    $("#edit-student-reset-time-modal").on("show.bs.modal", () => {
      if (!this.editingStudent) {
        return;
      }
      $("#edit-student-reset-time-modal-name-label").text(this.editingStudent.name ? `${this.editingStudent.name} (${this.editingStudent.uniqname})` : this.editingStudent.uniqname);
      $("#edit-student-reset-time-modal-exam-label").text(`${dashboard.exam_instance_info.name}`);
    });

    $("#edit-student-reset-time-button").on("click", async (e) => {

      if (!this.editingStudent) {
        return;
      }
      
      await axios({
        url: `/api/assigned_exams/${this.editingStudent.exam_uuid}/reset_time`,
        method: "PUT",
        data: {
          exam_id: dashboard.exam_info.exam_id,
          exam_instance_uuid: dashboard.exam_instance_info.exam_instance_uuid,
        },
        headers: {
          'Authorization': 'bearer ' + dashboard.client.getBearerToken(),
        },
      });
    });

    this.setEditingStudent(undefined);
  }

  public async onEpochUpdate() {
    const dashboard = this.dashboard;
    $("#examma-ray-exam-windows-list").html(`
      ${dashboard.exam_windows.map(w => `
        <li>
          <strong>${w.name}</strong>: ${new Date(w.open_time).toLocaleString()} - ${new Date(w.close_time).toLocaleString()}
        </li>
      `).join("\n")}
    `);
    $("#edit-student-window-select").html(dashboard.exam_windows.map(w => `
      <option value="${w.window_uuid}"}>${w.name}</option>
    `).join("\n") + '<option value="">(none)</option>');
    
    
    $("#edit-student-uniqname-list").html(
      Array.from(dashboard.assigned_exams_by_uuid.values()).map(assn => `<option value="${assn.uniqname}">`).join("\n")
    );

    
      
    // $(".examma-ray-students-list").on("click", ".student-settings-modal-open", async function() {

    //   $("#student-settings-modal").data("exam-uuid", $(this).data("exam-uuid"));
    //   const assn = self.assigned_exams_by_uuid.get($("#student-settings-modal").data("exam-uuid"));
    //   assert(assn);
    //   $("#student-settings-uniqname-input").val(assn.uniqname);
    //   $("#student-settings-email-input").val(assn.student_email);
    //   $("#student-settings-duration-multiplier").val(assn.duration_multiplier);
    //   self.exam_windows.forEach(w => {
    //     $("#student-settings-window-input").append(`
    //       <option value="${w.window_uuid}" ${assn.window_uuid === w.window_uuid ? "selected" : ""}>${w.name}</option>
    //     `);
    //   });
    //   $("#student-settings-modal").modal("show");

    // });
  }

  public setEditingStudent(student: ExamAssignmentInfo | undefined) {
    this.editingStudent = student;
    if (student) {
      $("#edit-student-name-input").val(student.name ?? "").prop("disabled", false);
      $("#edit-student-window-select").val(student.window_uuid ?? "").prop("disabled", false);
      $("#edit-student-duration-multiplier-input").val(student.duration_multiplier).prop("disabled", false);
      // submit button enabled only when student info changes
      // $("#edit-student-delete-submission-button").prop("disabled", false); // leave this out for now
      $("#edit-student-reset-time-open-modal").prop("disabled", false);
      this.updateEditStudentButtonUpToDate();
    }
    else {
      $("#edit-student-name-input").val("").prop("disabled", true);
      $("#edit-student-window-select").val("").prop("disabled", true);
      $("#edit-student-duration-multiplier-input").val("").prop("disabled", true);
      $("#edit-student-delete-submission-button").prop("disabled", true);
      $("#edit-student-reset-time-open-modal").prop("disabled", true);
      this.updateEditStudentButtonNoStudent();
    }
  }

  private updateEditStudentButtonNoStudent() {
    $("#edit-student-submit-button").css("visibility", "hidden").addClass("btn-primary").removeClass("btn-warning");
    $("#edit-student-cancel-button").css("visibility", "hidden");
    if (this.studentUpdatedTimeout) {
      window.clearTimeout(this.studentUpdatedTimeout);
      this.studentUpdatedTimeout = undefined;
    }
  }

  private updateEditStudentButtonUpToDate() {
    $("#edit-student-submit-button").css("visibility", "visible").addClass("btn-primary").removeClass("btn-warning");
    $("#edit-student-cancel-button").css("visibility", "hidden");
    $("#edit-student-submit-button").html(UP_TO_DATE_HTML);
    $("#edit-student-submit-button").prop("disabled", true);
    if (this.studentUpdatedTimeout) {
      window.clearTimeout(this.studentUpdatedTimeout);
      this.studentUpdatedTimeout = undefined;
    }
  }

  private updateEditStudentButtonUpdated() {
    $("#edit-student-submit-button").css("visibility", "visible").addClass("btn-primary").removeClass("btn-warning");
    $("#edit-student-cancel-button").css("visibility", "hidden");
    $("#edit-student-submit-button").html(UPDATED_HTML);
    if (this.studentUpdatedTimeout) {
      window.clearTimeout(this.studentUpdatedTimeout);
    }
    
    $("#edit-student-submit-button > .edit-student-submit-button-updated-text")
      .css("width", $("#edit-student-submit-button > .edit-student-submit-button-updated-text").width()+"px");
    this.studentUpdatedTimeout = window.setTimeout(() => {
      $("#edit-student-submit-button > .edit-student-submit-button-updated-text")
        .css("width", "0");
    }, 2000);
    $("#edit-student-submit-button").prop("disabled", true);
  }

  private updateEditStudentButtonSaveChanges() {
    $("#edit-student-submit-button").html(SAVE_CHANGES_HTML);
    $("#edit-student-submit-button").css("visibility", "visible").addClass("btn-warning").removeClass("btn-primary");
    $("#edit-student-cancel-button").css("visibility", "visible");
    $("#edit-student-submit-button").prop("disabled", false);
    if (this.studentUpdatedTimeout) {
      window.clearTimeout(this.studentUpdatedTimeout);
      this.studentUpdatedTimeout = undefined;
    }
  }

};