import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';

@Component({ selector: 'x-signup', templateUrl: './signup.component.html' })
export class SignupComponent {
  private fb = inject(FormBuilder);

  form = this.fb.group({
    id: [{ value: null as number | null, disabled: true }, Validators.required],
    email: ['', [Validators.required, Validators.email]],
    nickname: [''],
  });

  submit(): void {
    if (this.form.invalid) return;
    console.log(this.form.getRawValue());
  }
}
