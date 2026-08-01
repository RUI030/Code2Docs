import { Component, Input } from '@angular/core';

/**
 * An [innerHTML] binding: the one template construct that can turn data into
 * markup, and therefore the one a rebuilder must not translate mechanically.
 *
 * Exists because F20 found `rawHtmlSinks` shipping records with no `id` -- the
 * emit was keyed on the parsed EXPRESSION rather than on the binding node, so
 * the id map had nothing to look up. Schema-invalid output, produced by every
 * innerHTML binding, and caught by no fixture because none bound innerHTML.
 */
@Component({
  selector: 'x-banner',
  template: `
    <div class="banner" [innerHTML]="message"></div>
    <p [innerText]="plain"></p>
  `,
})
export class BannerComponent {
  @Input() message = '';
  @Input() plain = '';
}
