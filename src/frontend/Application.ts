import Cookies from "js-cookie";
import { Mutable } from "../util/util";

export type UserInfo = {
  id: number;
  email: string;
  name: string;
};

export class ExammaRayApplication {

  public readonly currentUser?: UserInfo;

  private async checkLogin() {
    if (Cookies.get("bearer")) {
      const response = await fetch("api/users/me", {
        method: 'GET',
        headers: {
          'Authorization': 'bearer ' + Cookies.get('bearer')
        }
      });

      if (response.status === 200) {
        let newUser = await response.json() as UserInfo;
        if (!this.currentUser || newUser.id !== this.currentUser.id) {
          (<Mutable<this>>this).currentUser = newUser;
          this.onLogin();
        }
      }
      else {
        this.logout();
      }
    }
    else {
      this.logout();
    }
    return this.currentUser;
  }

  private onLogin() {
    $(".examma-ray-log-in-button").html(`<i class="bi bi-person-check-fill"> ${this.currentUser?.email}`);
  }

  public logout() {
    Cookies.remove("bearer");
    if (this.currentUser) {
      delete (<Mutable<this>>this).currentUser;
      window.location.reload();
    }
  }

  private getBearerToken() {
    return Cookies.get('bearer');
  }

  public start() {
    this.checkLogin();
  }

}

