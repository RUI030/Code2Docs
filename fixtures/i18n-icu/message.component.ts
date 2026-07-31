import { Component } from '@angular/core';

/**
 * Isolates an ICU expression -- a construct the walker does NOT handle.
 *
 * This fixture exists to prove the unhandled-node detector fires, not to prove
 * ICU is extracted. Its expected output records the gap honestly: parseStatus
 * partial, nodesUnrecognized 1, one unhandled-template-node warning naming
 * TmplAstIcu. If ICU support is added later this golden changes, which is the
 * point -- the gap is visible either way.
 */
@Component({
  selector: 'app-message',
  templateUrl: './message.component.html',
})
export class MessageComponent {
  count = 0;
  label = 'items';
}
