import { Component } from '@angular/core';

/**
 * Event handlers that are not a bare call at position 0.
 *
 * Detection used to match /^(\w+)\s*\(/ against the handler's source, so every
 * form below except the first went unrecorded -- and a missed handler is a missed
 * call-graph edge, which surfaces as a method wrongly reported unreachable.
 */
@Component({
  selector: 'x-toolbar',
  templateUrl: './toolbar.component.html',
})
export class ToolbarComponent {
  items: string[] = [];

  save(): void {}
  close(): void {}
  reset(): void {}
}
