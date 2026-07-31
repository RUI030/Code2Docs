import { Component } from '@angular/core';

/**
 * Same semantics as template-inline, but the template lives in a file whose
 * name deliberately does NOT match the .ts stem -- the case the old
 * `<stem>.html` guess silently mis-resolved.
 */
@Component({
  selector: 'x-panel',
  templateUrl: './panel-markup.html',
})
export class PanelComponent {
  title = 'Panel';
  open = false;

  toggle(): void {
    this.open = !this.open;
  }
}
