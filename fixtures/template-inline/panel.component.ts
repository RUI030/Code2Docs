import { Component } from '@angular/core';

/**
 * Inline template, paired with template-external.
 *
 * Before the decorator was consulted, this shape produced NO template.json and
 * no message: the orchestrator looked for `<stem>.html`, found nothing, and a
 * unit whose UI is entirely unrecorded was indistinguishable from a unit with
 * no UI. Locations must resolve into this .ts, offset to the literal's own line.
 */
@Component({
  selector: 'x-panel',
  template: `
    <p>{{ title }}</p>
    @if (open) {
      <button (click)="toggle()">close</button>
    }
  `,
})
export class PanelComponent {
  title = 'Panel';
  open = false;

  toggle(): void {
    this.open = !this.open;
  }
}
