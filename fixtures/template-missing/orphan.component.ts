import { Component } from '@angular/core';

/**
 * Declares a templateUrl that does not exist. Asserts the GAP IS REPORTED:
 * parseStatus partial plus a template-not-found warning, never a silent skip.
 * "Declared but missing" and "no template at all" are different facts.
 */
@Component({
  selector: 'x-orphan',
  templateUrl: './this-file-does-not-exist.html',
})
export class OrphanComponent {
  title = 'Orphan';
}
