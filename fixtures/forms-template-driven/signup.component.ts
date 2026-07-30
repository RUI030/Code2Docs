import { Component } from '@angular/core';

@Component({ selector: 'x-signup', templateUrl: './signup.component.html' })
export class SignupComponent {
  email = '';
  nickname = '';

  submit(): void {
    console.log(this.email, this.nickname);
  }
}
