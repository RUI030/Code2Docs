import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';

/**
 * Control shapes that text matching read wrongly.
 *
 * `disabled: <expression>` was invisible to /disabled:\s*true/, `updateOn` was
 * never read at all, `fb.array` did not match /FormArray/, and a string literal
 * mentioning either produced two confidently wrong facts.
 */
@Component({
  selector: 'x-profile',
  template: '',
})
export class ProfileComponent {
  private fb = inject(FormBuilder);
  locked = true;

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(10)]],
    note: [{ value: '', disabled: this.locked }],
    slow: ['', { updateOn: 'blur' }],
    tags: this.fb.array([]),
    hint: ['mentions disabled: true and FormArray inside a string'],
  });
}
