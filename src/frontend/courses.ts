import axios from "axios";
import { DB_Exams } from "knex/types/tables";
import { ExammaRayClient } from "./Application";
import { CourseInfo, ExamInfo } from "../rest_types";

export class CoursesExammaRayApplication {

  public readonly client: ExammaRayClient;

  private constructor(client: ExammaRayClient) {
    this.client = client;
    this.initComponents();
  }

  private initComponents() {
    
    const course_pk = 1; // TODO: update to selected course (hardcoded to EECS 280 pk for now)

    $("#upload-sections-modal-submit-button").on("click", async () => {
      
      let files = (<HTMLInputElement>$("#upload-sections-file-input")[0]).files;
      if (!files || !files[0]) {
        return;
      }
      const formData = new FormData();
      formData.append("sections", files[0]);
      
      try {
        await axios({
          url: `/api/courses/${course_pk}/sections`,
          method: "put",
          data: formData,
          headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken(),
          },
        });
        
        $("#upload-sections-modal").modal("hide");
      }
      catch (e: unknown) {
        alert("Error uploading sections: " + JSON.stringify(e));
      }
    });

    
    $("#upload-student-roster-modal-submit-button").on("click", async () => {
      
      let files = (<HTMLInputElement>$("#upload-student-roster-file-input")[0]).files;
      if (!files || !files[0]) {
        return;
      }
      const formData = new FormData();
      formData.append("student_roster", files[0]);
      
      try {
        await axios({
          url: `/api/courses/${course_pk}/student_roster`,
          method: "put",
          data: formData,
          headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken(),
          },
        });
        
        $("#upload-student-roster-modal").modal("hide");
      }
      catch (e: unknown) {
        alert("Error uploading roster: " + JSON.stringify(e));
      }
    });

    
    $("#upload-staff-roster-modal-submit-button").on("click", async () => {
      
      let files = (<HTMLInputElement>$("#upload-staff-roster-file-input")[0]).files;
      if (!files || !files[0]) {
        return;
      }
      const formData = new FormData();
      formData.append("staff_roster", files[0]);
      
      try {
        await axios({
          url: `/api/courses/${course_pk}/staff_roster`,
          method: "put",
          data: formData,
          headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken(),
          },
        });
        
        $("#upload-staff-roster-modal").modal("hide");
      }
      catch (e: unknown) {
        alert("Error uploading roster: " + JSON.stringify(e));
      }
    });
  }

  public static async create() {
    let app = new CoursesExammaRayApplication(await ExammaRayClient.create());
    await app.reloadCourses();
    setInterval(() => app.reloadCourses(), 30000)
    return app;
  }

  public async reloadCourses() {
    const app = this;
    if (this.client.currentUser) {
      try {
  
        let courses_info : CourseInfo[] = (await axios({
          url: `/api/courses`,
          method: "GET",
          data: {},
          headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken()
          }
        })).data;
  
        $("#courses-list").empty();
        courses_info.forEach(ex => {
          $("#courses-list").append(`
            <li>
              ${ex.subject_code} ${ex.course_number} ${ex.term} ${ex.year}: ${ex.title}
            </li>
          `);
        });

        // get roster for first course (for now)
        let roster = (await axios({
          url: `/api/courses/${courses_info[0].course_pk}/users`,
          method: "GET",
          data: {},
          headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken()
          }
        })).data.roster as { email: string; role: string; }[];

        $("#course-users-list").empty();
        roster.forEach(u => {
          $("#course-users-list").append(`
            <li>
              ${u.email} (${u.role})
            </li>
          `);
        });

      }
      catch (e: unknown) {
        // no courses listed
        alert("Error loading courses: " + JSON.stringify(e));
      }
    }
    else {
      $("#courses-list").empty();
    }
  }
}

async function main() {

  const app = await CoursesExammaRayApplication.create();
  $("#create-exam-form").on("submit", async (e) => {
    e.preventDefault();
    let files = (<HTMLInputElement>$("#exam-spec-file-input")[0]).files;
    if (!files || !files[0]) {
      return;
    }
    const formData = new FormData();
    formData.append("exam_spec", files[0]);
    await axios({
      url: `/api/exams`,
      method: "POST",
      data: formData,
      headers: {
        'Authorization': 'bearer ' + app.client.getBearerToken(),
      },
    });

    app.reloadCourses();
  });

}

if (typeof $ === "function") {
  $(main);
}
else {
  alert("It appears some required 3rd party libraries did not load. Please try refreshing the page (might take a few tries). If the problem persists, contact your course staff or instructors.")
}